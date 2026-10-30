import { DurableObject } from 'cloudflare:workers';
import { eventAnnouncement, helpText, scoreText, topText, whoText } from '../../app/server/chat-copy.js';
import type { GameView } from '../../app/shared/types.js';
import { allowedLogins, cookieValue, decryptValue, encryptValue, maximumChannels, oauthCookie, OAUTH_COOKIE, publicOrigin,
  randomToken, sameOrigin, sameText, secretBytes, sessionCookie, SESSION_COOKIE, sha256, signPilotCapability, studioIdleMilliseconds, verifyWebhook } from './control-auth.js';
import { CONTROL_LIMITS, type ControlEnv, type ControlSession, type ControlState, type Credentials, type RegisteredChannel,
  type RoomAnnouncement, type TwitchChatEvent, type TwitchUser } from './control-types.js';
import { internalFetch } from './internal-fetch.js';
import { oauthDiagnostic, OAuthProviderError, type OAuthPhase } from './oauth-diagnostics.js';

const ID = /^[1-9][0-9]{0,24}$/;
const CALLBACK = '/auth/twitch/callback';
const WEBHOOK = '/api/twitch/eventsub';
// Webhook transport uses an app token: its reading identity must grant user:bot,
// and the broadcaster must grant channel:bot. These grants do not enable posting.
const BROADCASTER_SCOPES = ['user:read:chat', 'user:bot', 'channel:bot'];
const BOT_SCOPES = ['user:write:chat', 'user:bot'];
const MODERATION_TYPES = ['channel.chat.message_delete', 'channel.chat.clear_user_messages'];
const CONTROL_MAPS = ['pending', 'sessions', 'channels', 'dedupe', 'inbox', 'channelSentAt', 'channelSentWindow', 'commandCooldowns'] as const;
const readyState = (): ControlState => ({ version: 1, pending: {}, sessions: {}, channels: {}, dedupe: {}, inbox: {}, queue: [],
  sentAt: [], channelSentAt: {}, commandCooldowns: {}, pausedUntil: 0, receipts: [], nextValidationAt: 0 });
const json = (value: unknown, status = 200, extra: HeadersInit = {}) => new Response(JSON.stringify(value), { status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', ...extra } });
const denied = () => json({ error: 'Access denied.' }, 403);
const object = (v: unknown): Record<string, any> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
const userShape = (v: unknown): TwitchUser | null => {
  const item = object(v);
  return item && ID.test(item.id ?? '') && typeof item.login === 'string' && /^[a-z0-9_]{1,25}$/.test(item.login) &&
    typeof item.display_name === 'string' && item.display_name.length <= 100 ? { id: item.id, login: item.login, name: item.display_name } : null;
};
export async function boundedControlBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length') ?? 0) > CONTROL_LIMITS.bodyBytes) throw new Error('body_too_large');
  if (!request.body) return '';
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > CONTROL_LIMITS.bodyBytes) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}

/** Single, bounded control plane for the pilot. ChannelRoom remains the game authority. */
export class TwitchControl extends DurableObject<ControlEnv> {
  private data = readyState();
  private committed = readyState();
  private ready: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private waiting = 0;
  private nextInboxPruneAt = 0;
  private webhookSecretHash = '';
  private providerTasks = new Map<string, Promise<unknown>>();
  private appTokenTask?: Promise<string>;
  private checkpointRows = new Map<string, string>();
  private legacyCheckpoint = false;
  constructor(ctx: DurableObjectState, env: ControlEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS control_state (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
      for (const row of ctx.storage.sql.exec<{ key: string; value: string }>('SELECT key,value FROM control_state')) this.checkpointRows.set(row.key, row.value);
      const legacy = this.checkpointRows.size ? undefined : await ctx.storage.get<ControlState>('control-v1');
      const saved = this.checkpointRows.size ? this.loadCheckpoint() : legacy;
      this.legacyCheckpoint = !!legacy;
      this.webhookSecretHash = await sha256(env.TWITCH_EVENTSUB_SECRET ?? '');
      if (saved) { if (saved.version !== 1) throw new Error('Unsupported control state.'); this.data = saved; }
      this.committed = structuredClone(this.data);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS twitch_inbox (
        id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, next_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, payload TEXT, delivered INTEGER NOT NULL DEFAULT 0)`);
      ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS inbox_expiry ON twitch_inbox(expires_at)');
      ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS inbox_pending ON twitch_inbox(delivered,next_at)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS inbox_counts (id INTEGER PRIMARY KEY CHECK(id=1), total INTEGER NOT NULL, pending INTEGER NOT NULL)');
      // Only the first migration counts historical rows. Triggers keep capacity
      // checks O(1), including retries, expiry and channel disconnect cleanup.
      if (!ctx.storage.sql.exec('SELECT id FROM inbox_counts WHERE id=1').toArray().length)
        ctx.storage.sql.exec('INSERT INTO inbox_counts SELECT 1,COUNT(*),COALESCE(SUM(delivered=0),0) FROM twitch_inbox');
      ctx.storage.sql.exec(`CREATE TRIGGER IF NOT EXISTS inbox_insert AFTER INSERT ON twitch_inbox BEGIN
        UPDATE inbox_counts SET total=total+1,pending=pending+(NEW.delivered=0) WHERE id=1; END`);
      ctx.storage.sql.exec(`CREATE TRIGGER IF NOT EXISTS inbox_delete AFTER DELETE ON twitch_inbox BEGIN
        UPDATE inbox_counts SET total=total-1,pending=pending-(OLD.delivered=0) WHERE id=1; END`);
      ctx.storage.sql.exec(`CREATE TRIGGER IF NOT EXISTS inbox_delivery AFTER UPDATE OF delivered ON twitch_inbox BEGIN
        UPDATE inbox_counts SET pending=pending+(NEW.delivered=0)-(OLD.delivered=0) WHERE id=1; END`);
    });
  }
  private async serial<T>(run: () => Promise<T>): Promise<T> {
    if (this.waiting >= 64) throw new Error('control_busy');
    this.waiting++;
    const result = this.tail.then(async () => { await this.ready; return run(); });
    this.tail = result.catch(() => undefined);
    try { return await result; } finally { this.waiting--; }
  }
  /** Override in the isolated fixture only; production uses bounded native fetch. */
  protected async externalFetch(input: string, init?: RequestInit): Promise<Response> {
    // workerd rejects redirect:'error' before sending. Manual mode plus an
    // explicit refusal keeps credentials on the original Twitch endpoint.
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(5000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('provider_redirect');
    }
    return response;
  }
  /** Fixture instrumentation measures actual SQLite rows read, not an estimate. */
  protected inboxQuery<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): T[] {
    return this.ctx.storage.sql.exec<T>(query, ...bindings).toArray();
  }
  private async providerOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const pending = this.providerTasks.get(key); if (pending) return pending as Promise<T>;
    const task = operation(); this.providerTasks.set(key, task);
    try { return await task; } finally { if (this.providerTasks.get(key) === task) this.providerTasks.delete(key); }
  }
  private allowed(channel?: RegisteredChannel): channel is RegisteredChannel {
    return !!channel && channel.active && allowedLogins(this.env).has(channel.login);
  }
  private configured(): boolean {
    try {
      publicOrigin(this.env); allowedLogins(this.env); maximumChannels(this.env); studioIdleMilliseconds(this.env);
      secretBytes(this.env.EDGE_PILOT_SECRET_B64); secretBytes(this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64);
      return this.env.EDGE_PILOT_ENABLED === 'true' && !!this.env.TWITCH_CLIENT_ID && !!this.env.TWITCH_CLIENT_SECRET &&
        !!this.env.TWITCH_EVENTSUB_SECRET && this.env.TWITCH_EVENTSUB_SECRET.length >= 32 && this.env.TWITCH_EVENTSUB_SECRET.length <= 100 &&
        this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64 !== this.env.EDGE_PILOT_SECRET_B64;
    } catch { return false; }
  }
  private prune(now = Date.now()): void {
    for (const [id, pending] of Object.entries(this.data.pending)) if (pending.expiresAt <= now) delete this.data.pending[id];
    for (const [id, session] of Object.entries(this.data.sessions)) if (session.expiresAt <= now) delete this.data.sessions[id];
    for (const [id, expires] of Object.entries(this.data.dedupe)) if (expires <= now) delete this.data.dedupe[id];
    for (const [id, expires] of Object.entries(this.data.commandCooldowns)) if (expires <= now) delete this.data.commandCooldowns[id];
    this.data.queue = this.data.queue.filter((q) => q.expiresAt > now && this.allowed(this.data.channels[q.channelId]));
    this.data.sentAt = this.data.sentAt.filter((at) => at > now - 30_000);
    this.data.receipts = this.data.receipts.slice(-50);
    if (now >= this.nextInboxPruneAt) {
      this.inboxQuery('DELETE FROM twitch_inbox WHERE expires_at <= ?', now);
      this.nextInboxPruneAt = now + 30_000;
    }
  }
  private async persist(): Promise<void> {
    try {
      // Every path (OAuth, verification, revoke, stop, idle and recovery) goes
      // through this checkpoint. Assign projection revisions here so a delayed
      // cross-object push can never overwrite a later connection decision.
      for (const channel of Object.values(this.data.channels)) {
        const previous = this.committed.channels[channel.id];
        const connected = this.allowed(channel) && channel.chatWanted !== false && channel.subscriptionStatus === 'enabled';
        channel.connectionRevision = (previous?.connectionRevision ?? 0) +
          (!previous?.connectionRevision || previous.connectionConnected !== connected ? 1 : 0);
        channel.connectionConnected = connected;
      }
      const base = { ...this.data }; const next = new Map<string, string>();
      for (const field of CONTROL_MAPS) {
        for (const [id, value] of Object.entries(this.data[field] ?? {})) next.set(JSON.stringify([field, id]), JSON.stringify(value));
        (base as unknown as Record<string, unknown>)[field] = {};
      }
      next.set('base', JSON.stringify(base));
      let bytes = 0;
      for (const [key, value] of next) {
        const size = new TextEncoder().encode(key + value).length;
        if (size > 512 * 1024) throw new Error('control_record_capacity');
        bytes += size;
      }
      if (bytes > 16 * 1024 * 1024 || next.size > 20_000) throw new Error('control_capacity');
      this.ctx.storage.transactionSync(() => {
        for (const key of this.checkpointRows.keys()) if (!next.has(key)) this.ctx.storage.sql.exec('DELETE FROM control_state WHERE key=?', key);
        for (const [key, value] of next) if (this.checkpointRows.get(key) !== value)
          this.writeCheckpointRow(key, value);
      });
      this.checkpointRows = next; this.committed = structuredClone(this.data);
    } catch (error) { this.data = structuredClone(this.committed); throw error; }
    if (this.legacyCheckpoint) { await this.ctx.storage.delete('control-v1'); this.legacyCheckpoint = false; }
    await this.schedule();
  }
  protected writeCheckpointRow(key: string, value: string): void {
    this.ctx.storage.sql.exec('INSERT INTO control_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
  }
  private loadCheckpoint(): ControlState {
    const base = this.checkpointRows.get('base'); if (!base) throw new Error('missing_control_checkpoint');
    const state = JSON.parse(base) as ControlState;
    for (const field of CONTROL_MAPS) (state as unknown as Record<string, unknown>)[field] = Object.create(null);
    for (const [key, value] of this.checkpointRows) {
      if (key === 'base') continue;
      const tuple: unknown = JSON.parse(key);
      if (!Array.isArray(tuple) || tuple.length !== 2 || !CONTROL_MAPS.includes(tuple[0]) || typeof tuple[1] !== 'string') throw new Error('invalid_control_checkpoint');
      (state as unknown as Record<string, Record<string, unknown>>)[tuple[0]]![tuple[1]] = JSON.parse(value);
    }
    return state;
  }
  private async schedule(): Promise<void> {
    const now = Date.now(); const deadlines: number[] = [];
    const inbox = this.inboxQuery<{ next_at: number }>('SELECT next_at FROM twitch_inbox WHERE delivered=0 ORDER BY next_at LIMIT 1')[0]?.next_at;
    if (inbox) deadlines.push(inbox);
    if (this.data.queue.length) {
      const channelReady = Math.min(...this.data.queue.map((q) => {
        const window = (this.data.channelSentWindow?.[q.channelId] ?? []).filter((at) => at > now - 30_000);
        return Math.max(now + 1100, (this.data.channelSentAt[q.channelId] ?? 0) + 1100, window.length >= 6 ? window[0]! + 30_001 : 0);
      }));
      deadlines.push(Math.min(Math.max(channelReady, this.data.pausedUntil, this.data.sentAt.length >= this.botBudget() ? this.data.sentAt[0]! + 30_001 : 0),
        ...this.data.queue.map((q) => q.expiresAt)));
    }
    for (const c of Object.values(this.data.channels)) if (this.needsSubscription(c)) deadlines.push(c.subscriptionRetryAt ?? now + 1000);
    for (const c of Object.values(this.data.channels)) {
      if (c.pendingDeletion?.length) deadlines.push(c.deleteRetryAt ?? now + 1000);
      if (this.allowed(c) && c.chatWanted !== false && c.lastStudioAt) deadlines.push(c.lastStudioAt + studioIdleMilliseconds(this.env));
    }
    const expiry = Object.values(this.data.pending).map((s) => s.expiresAt).concat(Object.values(this.data.sessions).map((s) => s.expiresAt));
    if (expiry.length) deadlines.push(Math.min(...expiry));
    if (Object.values(this.data.channels).some((c) => this.allowed(c)) || this.data.bot) deadlines.push(this.data.nextValidationAt || now + CONTROL_LIMITS.validationMs);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(now + 1000, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private async session(request: Request, state = this.data): Promise<{ id: string; value: ControlSession; channel: RegisteredChannel } | null> {
    const cookie = cookieValue(request, SESSION_COOKIE); if (!cookie) return null;
    const id = await sha256(cookie); const value = state.sessions[id];
    const channel = value ? state.channels[value.channelId] : undefined;
    if (!value || value.expiresAt <= Date.now() || !this.allowed(channel)) return null;
    return { id, value, channel };
  }
  private csrf(request: Request, session: { value: ControlSession }): boolean {
    return sameOrigin(request, publicOrigin(this.env)) && sameText(request.headers.get('x-csrf-token') ?? '', session.value.csrf);
  }
  private botStatus(channel: RegisteredChannel) {
    return { configured: !!this.env.EDGE_BOT_USER_ID, authorized: !!this.data.bot && this.data.bot.user.id === this.env.EDGE_BOT_USER_ID,
      channelAllowed: channel.scopes.includes('channel:bot'), name: this.data.bot?.user.name ?? null,
      canAuthorize: ID.test(this.env.EDGE_BOT_USER_ID ?? '') && channel.login === (this.env.EDGE_BOT_OWNER_LOGIN ?? 'komediruzecki7') };
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === CALLBACK && request.method === 'GET') return await this.callback(request, url);
      if (url.pathname === '/api/edge/chat' && request.method === 'POST') return await this.chatConnection(request);
      if (url.pathname === '/api/edge/overlay' && request.method === 'POST') {
        await this.ready;
        if (!this.configured()) return json({ error: 'The hosted pilot is not configured.' }, 503);
        if (url.origin !== publicOrigin(this.env) || url.username || url.password || url.hash) return denied();
        // This public capability exchange is read-only. A slow request body must
        // never occupy the queue shared by signed chat and session mutations.
        return await this.overlay(request);
      }
      if (url.pathname === '/api/edge/session' && request.method === 'GET') {
        const response = await this.serial(() => this.handle(request));
        if (response.ok) {
          const session = await this.session(request, this.committed);
          if (!session) return denied();
          // Reconcile outside the Control queue. A lost subscription push heals
          // on bootstrap; Room rejects any late projection with an old revision.
          await this.roomControl(session.channel.id, { type: 'connection', login: session.channel.login });
          if (!await this.session(request, this.committed)) return denied();
        }
        return response;
      }
      if (url.pathname === '/api/session' && request.method === 'GET' || url.pathname === WEBHOOK && request.method === 'POST') {
        await this.ready;
        if (!this.configured()) return json({ error: 'The hosted pilot is not configured.' }, 503);
        if (url.origin !== publicOrigin(this.env) || url.username || url.password || url.hash) return denied();
        if (url.pathname === '/api/session') {
          const session = await this.session(request, this.committed);
          return json({ runtime: 'edge', authenticated: !!session, twitchReady: true, demoAvailable: false, speechReady: true,
            ...(session ? { user: { name: session.channel.name, mode: 'twitch' }, csrf: session.value.csrf } : {}) });
        }
        const body = await boundedControlBody(request);
        const signature = await verifyWebhook(request, body, this.env.TWITCH_EVENTSUB_SECRET);
        if (!signature) return denied();
        const result = await this.serial(() => { this.prune(); return this.webhook(body, signature); });
        if (result instanceof Response) return result;
        // The inbox is already durable. Waiting for a Room must not occupy the
        // shared control queue used by other channels and session revocation.
        await this.deliver(result.delivery);
        return new Response(null, { status: 204 });
      }
      // Room authentication must not wait behind a control operation delivering a
      // webhook into that same room. Read only the last committed auth snapshot.
      if (request.url === 'https://control.internal/internal/authorize' && request.method === 'POST') {
        await this.ready;
        if (!this.configured()) return denied();
        return this.authorize(object(JSON.parse(await boundedControlBody(request))));
      }
      return await this.serial(() => this.handle(request));
    }
    catch (error) {
      if (error instanceof Error && error.message === 'body_too_large') return json({ error: 'Request too large.' }, 413);
      if (error instanceof SyntaxError) return json({ error: 'Use a valid JSON request.' }, 400);
      return json({ error: 'Twitch connection could not be completed. Try again.' }, 503);
    }
  }
  private async handle(request: Request): Promise<Response> {
    if (!this.configured()) return json({ error: 'The hosted pilot is not configured.' }, 503);
    const url = new URL(request.url); this.prune();
    if (url.origin === 'https://control.internal' && request.method === 'POST') return this.internal(url.pathname, request);
    if (url.origin !== publicOrigin(this.env) || url.username || url.password || url.hash) return denied();
    if (url.pathname === '/auth/twitch' && request.method === 'GET') return this.beginOAuth('broadcaster');
    const session = await this.session(request);
    if (url.pathname === '/api/session' && request.method === 'GET') return json({ runtime: 'edge', authenticated: !!session, twitchReady: true,
      demoAvailable: false, speechReady: true, ...(session ? { user: { name: session.channel.name, mode: 'twitch' }, csrf: session.value.csrf } : {}) });
    if (!session) return json({ error: 'Connect your Twitch account first.' }, 401);
    if (url.pathname === '/api/edge/session' && request.method === 'GET') {
      session.channel.lastStudioAt = Date.now(); await this.persist();
      const key = await decryptValue<string>(session.channel.overlayKey, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, `overlay:${session.channel.id}`);
      return json({ channelId: session.channel.id, ...(await signPilotCapability(this.env, { channelId: session.channel.id, role: 'studio', sessionId: session.id })),
        csrf: session.value.csrf, user: { id: session.channel.id, login: session.channel.login, name: session.channel.name }, bot: this.botStatus(session.channel),
        overlayUrl: `${publicOrigin(this.env)}/overlay/${session.channel.id}#key=${key}`, viewerUrl: `https://www.twitch.tv/${session.channel.login}` });
    }
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      if (!this.csrf(request, session)) return denied();
      delete this.data.sessions[session.id]; await this.persist();
      await this.roomControl(session.channel.id, { type: 'disconnect', sessionId: session.id }).catch(() => {});
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
    }
    if (url.pathname === '/api/bot/authorize' && request.method === 'POST') {
      if (!this.csrf(request, session) || session.channel.login !== (this.env.EDGE_BOT_OWNER_LOGIN ?? 'komediruzecki7') || !ID.test(this.env.EDGE_BOT_USER_ID ?? '')) return denied();
      return this.beginOAuth('bot', session.id, true);
    }
    return json({ error: 'Not found.' }, 404);
  }
  private async chatConnection(request: Request): Promise<Response> {
    const prepared = await this.serial(async (): Promise<Response | string> => {
      if (!this.configured() || new URL(request.url).origin !== publicOrigin(this.env)) return denied();
      const session = await this.session(request); if (!session) return json({ error: 'Connect your Twitch account first.' }, 401);
      if (!this.csrf(request, session) || !request.headers.get('content-type')?.startsWith('application/json')) return denied();
      const body = object(JSON.parse(await boundedControlBody(request)));
      if (!body || typeof body.connected !== 'boolean') return json({ error: 'Choose whether to connect Twitch chat.' }, 400);
      const channel = session.channel;
      if (!body.connected) { await this.stopChat(channel, 'Twitch chat disconnected.'); return channel.id; }
      if (channel.pendingDeletion?.length || channel.subscriptionStatus === 'stopping') return json({ error: 'Twitch is still disconnecting. Try connecting again shortly.', subscriptionStatus: 'stopping' }, 409);
      channel.generation = (channel.generation ?? 0) + 1;
      channel.chatWanted = true; channel.lastStudioAt = Date.now();
      if (channel.subscriptionStatus !== 'enabled') { channel.subscriptionStatus = 'pending'; channel.subscriptionRetryAt = Date.now() + 1000; channel.subscriptionAttempts = 0; }
      await this.persist();
      await this.roomControl(channel.id, { type: 'connection', status: channel.subscriptionStatus === 'enabled' ? 'connected' : 'disconnected',
        detail: channel.subscriptionStatus === 'enabled' ? 'Twitch chat connected.' : 'Connecting Twitch chat.', login: channel.login }).catch(() => {});
      return json({ ok: true, connected: channel.subscriptionStatus === 'enabled', subscriptionStatus: channel.subscriptionStatus });
    });
    if (prepared instanceof Response) return prepared;
    const stopped = await this.deleteSubscriptions(prepared);
    return stopped ? json({ ok: true, connected: false, subscriptionStatus: 'offline' }) :
      json({ error: 'Twitch chat is paused. Twitch has not confirmed the subscription removal yet; we will keep retrying.', connected: false, subscriptionStatus: 'stopping' }, 503);
  }
  private async beginOAuth(kind: 'broadcaster' | 'bot', initiatingSession?: string, asJson = false): Promise<Response> {
    if (Object.keys(this.data.pending).length >= CONTROL_LIMITS.pendingOAuth) {
      const oldest = Object.entries(this.data.pending).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) delete this.data.pending[oldest[0]];
    }
    const state = randomToken(); const cookie = randomToken();
    this.data.pending[await sha256(state)] = { cookieHash: await sha256(cookie), kind, initiatingSession, expiresAt: Date.now() + CONTROL_LIMITS.oauthMs };
    await this.persist();
    const scopes = kind === 'bot' ? BOT_SCOPES : BROADCASTER_SCOPES;
    const auth = new URL('https://id.twitch.tv/oauth2/authorize');
    auth.search = new URLSearchParams({ client_id: this.env.TWITCH_CLIENT_ID!, redirect_uri: `${publicOrigin(this.env)}${CALLBACK}`,
      response_type: 'code', scope: scopes.join(' '), state, force_verify: 'true' }).toString();
    const headers = { 'set-cookie': oauthCookie(cookie, CONTROL_LIMITS.oauthMs / 1000), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
    return asJson ? json({ url: auth.href }, 200, headers) : new Response(null, { status: 302, headers: { ...headers, location: auth.href } });
  }
  private async callback(request: Request, url: URL): Promise<Response> {
    let phase: OAuthPhase = 'state';
    try { return await this.completeCallback(request, url, (next) => { phase = next; }); }
    catch (error) {
      const diagnostic = oauthDiagnostic(phase, error);
      console.warn(JSON.stringify(diagnostic));
      return json({ error: 'Twitch connection could not be completed. Try again.', code: `oauth_${phase}_${diagnostic.reason}` }, 503,
        { 'set-cookie': oauthCookie('', 0) });
    }
  }
  private async completeCallback(request: Request, url: URL, phase: (next: OAuthPhase) => void): Promise<Response> {
    const clear = { 'set-cookie': oauthCookie('', 0) };
    const prepared = await this.serial(async () => {
      if (!this.configured() || url.origin !== publicOrigin(this.env) || url.username || url.password || url.hash) return denied();
    const state = url.searchParams.get('state') ?? ''; const cookie = cookieValue(request, OAUTH_COOKIE);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !cookie) return json({ error: 'Sign-in expired. Connect your Twitch account again.' }, 400, clear);
    const stateKey = await sha256(state); const pending = this.data.pending[stateKey];
    // A bad cookie must not consume a valid state belonging to another browser.
    if (!pending || pending.expiresAt <= Date.now() || !sameText(pending.cookieHash, await sha256(cookie))) return denied();
    delete this.data.pending[stateKey]; await this.persist();
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048 || url.searchParams.has('error')) return json({ error: 'Twitch sign-in was not completed.' }, 400, clear);
    if (pending.kind === 'bot' && (!pending.initiatingSession || !this.data.sessions[pending.initiatingSession])) return denied();
    return { code, pending };
    });
    if (prepared instanceof Response) return prepared;
    const { code, pending } = prepared;
    const c = await this.exchange(code, pending.kind, phase);
    phase('session-storage');
    return this.serial(async () => {
    if (pending.kind === 'bot' && (!pending.initiatingSession || !this.data.sessions[pending.initiatingSession] ||
      !this.allowed(this.data.channels[this.data.sessions[pending.initiatingSession]!.channelId]))) return denied();
    if (pending.kind === 'bot') {
      if (c.id !== this.env.EDGE_BOT_USER_ID) return json({ error: 'Use the configured bot account to connect Baity.' }, 403, clear);
      this.data.bot = { user: { id: c.id, login: c.login, name: c.name }, credentials: await this.seal(c, `bot:${c.id}`), validatedAt: c.validatedAt };
      this.data.nextValidationAt ||= Date.now() + CONTROL_LIMITS.validationMs; await this.persist();
      return new Response(null, { status: 302, headers: { ...clear, location: `${publicOrigin(this.env)}/studio`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    }
    if (!allowedLogins(this.env).has(c.login) || c.id === this.env.EDGE_BOT_USER_ID) return json({ error: 'This channel is not on the pilot list yet.' }, 403, clear);
    const existing = this.data.channels[c.id];
    if (!this.allowed(existing) && Object.values(this.data.channels).filter((channel) => this.allowed(channel)).length >= maximumChannels(this.env)) return json({ error: 'The pilot channel limit has been reached.' }, 409, clear);
    if (Object.keys(this.data.channels).length >= 100 && !existing) return json({ error: 'The pilot channel registry is full.' }, 409, clear);
    if (Object.keys(this.data.sessions).length >= CONTROL_LIMITS.sessions) return json({ error: 'Too many active sessions. Sign out on another device first.' }, 429, clear);
    const overlayKey = existing ? undefined : randomToken();
    this.data.channels[c.id] = { id: c.id, login: c.login, name: c.name, generation: (existing?.generation ?? 0) + 1, botGeneration: existing?.botGeneration ?? 0, credentials: await this.seal(c, `channel:${c.id}`),
      overlayKey: existing?.overlayKey ?? await this.seal(overlayKey, `overlay:${c.id}`), overlayKeyHash: existing?.overlayKeyHash ?? await sha256(overlayKey!),
      scopes: c.scopes, validatedAt: c.validatedAt, subscriptionId: existing?.subscriptionStatus === 'revoked' ? undefined : existing?.subscriptionId,
      moderationSubscriptions: existing?.subscriptionStatus === 'revoked' ? {} : existing?.moderationSubscriptions ?? {},
      subscriptionStatus: existing?.chatWanted === false ? existing.subscriptionStatus : existing?.subscriptionStatus === 'enabled' ? 'enabled' : 'pending',
      chatWanted: existing?.chatWanted ?? true, lastStudioAt: Date.now(), pendingDeletion: existing?.pendingDeletion ?? [],
      subscriptionSecretHash: existing?.subscriptionSecretHash, resubscribeAfterDeletion: existing?.resubscribeAfterDeletion,
      deleteRetryAt: existing?.deleteRetryAt, deleteAttempts: existing?.deleteAttempts,
      subscriptionRetryAt: Date.now() + 1000, subscriptionAttempts: 0, active: true };
    const token = randomToken(); const sessionId = await sha256(token);
    this.data.sessions[sessionId] = { channelId: c.id, csrf: randomToken(), expiresAt: Date.now() + CONTROL_LIMITS.sessionMs };
    this.data.nextValidationAt ||= Date.now() + CONTROL_LIMITS.validationMs; await this.persist();
    await this.roomControl(c.id, { type: 'connection', status: this.data.channels[c.id]!.subscriptionStatus === 'enabled' ? 'connected' : 'disconnected',
      detail: 'Connecting Twitch chat.', login: c.login }).catch(() => {});
    const headers = new Headers({ location: `${publicOrigin(this.env)}/studio`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    headers.append('set-cookie', oauthCookie('', 0)); headers.append('set-cookie', sessionCookie(token, CONTROL_LIMITS.sessionMs / 1000));
    return new Response(null, { status: 302, headers });
    });
  }
  private seal(value: unknown, context: string) { return encryptValue(value, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, context); }
  private async tokenCall(parameters: Record<string, string>): Promise<Record<string, any>> {
    const response = await this.externalFetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({
      client_id: this.env.TWITCH_CLIENT_ID!, client_secret: this.env.TWITCH_CLIENT_SECRET!, ...parameters }) });
    if (!response.ok) {
      if (parameters.grant_type === 'authorization_code') throw new OAuthProviderError(response.status);
      throw new Error(parameters.grant_type === 'refresh_token' && [400, 401].includes(response.status) ? 'token_revoked' : 'token_exchange_failed');
    }
    const data = object(await response.json());
    if (!data || typeof data.access_token !== 'string' || data.access_token.length > 4096 || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('invalid_token_response');
    return data;
  }
  private async validateToken(token: string, required: string[]) {
    const response = await this.externalFetch('https://id.twitch.tv/oauth2/validate', { headers: { authorization: `OAuth ${token}` } });
    if (response.status === 401) throw new Error('token_revoked');
    if (!response.ok) throw new Error('validation_unavailable');
    const value = object(await response.json());
    if (!value || value.client_id !== this.env.TWITCH_CLIENT_ID || !ID.test(value.user_id ?? '') || !/^[a-z0-9_]{1,25}$/.test(value.login ?? '') ||
      !Array.isArray(value.scopes) || value.scopes.length > 100 || !value.scopes.every((s: unknown) => typeof s === 'string') || !required.every((s) => value.scopes.includes(s))) throw new Error('token_revoked');
    return { userId: value.user_id as string, login: value.login as string, scopes: value.scopes as string[] };
  }
  private async exchange(code: string, kind: 'broadcaster' | 'bot', phase: (next: OAuthPhase) => void): Promise<Credentials> {
    phase('token-exchange');
    const tokens = await this.tokenCall({ grant_type: 'authorization_code', code, redirect_uri: `${publicOrigin(this.env)}${CALLBACK}` });
    if (typeof tokens.refresh_token !== 'string' || tokens.refresh_token.length > 4096) throw new Error('invalid_refresh_token');
    phase('token-validation');
    const valid = await this.validateToken(tokens.access_token, kind === 'bot' ? BOT_SCOPES : BROADCASTER_SCOPES);
    phase('identity');
    const response = await this.externalFetch('https://api.twitch.tv/helix/users', { headers: { authorization: `Bearer ${tokens.access_token}`, 'client-id': this.env.TWITCH_CLIENT_ID! } });
    if (!response.ok) throw new Error('identity_unavailable');
    const payload = object(await response.json()); const user = payload && Array.isArray(payload.data) && payload.data.length === 1 ? userShape(payload.data[0]) : null;
    if (!user || user.id !== valid.userId || user.login !== valid.login) throw new Error('identity_mismatch');
    return { ...user, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000,
      validatedAt: Date.now(), scopes: valid.scopes };
  }
  private async appToken(force = false): Promise<string> {
    const cached = this.committed.appToken;
    if (!force && cached && cached.expiresAt > Date.now() + 60_000) return decryptValue<string>(cached.value, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, 'app-token');
    if (this.appTokenTask) return this.appTokenTask;
    const task = (async () => {
      const token = await this.tokenCall({ grant_type: 'client_credentials' });
      const value = await this.seal(token.access_token, 'app-token');
      await this.serial(async () => { this.data.appToken = { value, expiresAt: Date.now() + token.expires_in * 1000 }; await this.persist(); });
      return token.access_token as string;
    })();
    this.appTokenTask = task;
    try { return await task; } finally { if (this.appTokenTask === task) this.appTokenTask = undefined; }
  }
  private async helix(path: string, init: RequestInit, retry = true): Promise<Response> {
    const access = await this.appToken();
    const response = await this.externalFetch(`https://api.twitch.tv/helix/${path}`, { ...init, headers: { ...init.headers,
      authorization: `Bearer ${access}`, 'client-id': this.env.TWITCH_CLIENT_ID!, 'content-type': 'application/json' } });
    if (response.status === 401 && retry) { await this.appToken(true); return this.helix(path, init, false); }
    return response;
  }
  private async overlay(request: Request): Promise<Response> {
    if (!sameOrigin(request, publicOrigin(this.env)) || !request.headers.get('content-type')?.startsWith('application/json')) return denied();
    const value = object(JSON.parse(await boundedControlBody(request)));
    const channel = value && ID.test(value.channelId ?? '') ? this.committed.channels[value.channelId] : undefined;
    if (!this.allowed(channel) || typeof value?.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.key) || !sameText(await sha256(value.key), channel.overlayKeyHash)) return denied();
    const capability = await signPilotCapability(this.env, { channelId: channel.id, role: 'overlay', sessionId: `overlay:${channel.id}` });
    const current = this.committed.channels[channel.id];
    if (!this.allowed(current) || current.credentials?.ciphertext !== channel.credentials?.ciphertext ||
      current.generation !== channel.generation || current.overlayKeyHash !== channel.overlayKeyHash) return denied();
    return json({ channelId: channel.id, ...capability });
  }
  private async internal(path: string, request: Request): Promise<Response> {
    const input = object(JSON.parse(await boundedControlBody(request)));
    if (!input || !ID.test(input.channelId ?? '')) return denied();
    const channel = this.data.channels[input.channelId];
    if (path === '/internal/room-event') {
      if (!this.allowed(channel)) return denied();
      return this.roomEvent(input as unknown as RoomAnnouncement);
    }
    return json({ error: 'Not found.' }, 404);
  }
  private authorize(input: Record<string, any> | null): Response {
    if (!input || !ID.test(input.channelId ?? '')) return denied();
    const channel = this.committed.channels[input.channelId];
    let allowed = this.allowed(channel);
    if (input.role === 'studio' || input.sessionId && input.role !== 'overlay') {
      const session = this.committed.sessions[input.sessionId];
      allowed = allowed && !!session && session.channelId === input.channelId && session.expiresAt > Date.now();
    }
    if (input.role === 'overlay') allowed = allowed && input.sessionId === `overlay:${input.channelId}`;
    const bot = this.committed.bot;
    return json({ allowed, ...(allowed ? { login: channel!.login, name: channel!.name, bot: {
      configured: !!this.env.EDGE_BOT_USER_ID, authorized: !!bot && bot.user.id === this.env.EDGE_BOT_USER_ID,
      channelAllowed: channel!.scopes.includes('channel:bot'), name: bot?.user.name ?? null,
      canAuthorize: ID.test(this.env.EDGE_BOT_USER_ID ?? '') && channel!.login === (this.env.EDGE_BOT_OWNER_LOGIN ?? 'komediruzecki7') }, chatConnected: channel!.subscriptionStatus === 'enabled' } : {}) });
  }
  private roomStub(channelId: string) { return this.env.ROOMS.get(this.env.ROOMS.idFromName(`channel:${channelId}`)); }
  private needsSubscription(channel: RegisteredChannel): boolean {
    return this.allowed(channel) && channel.chatWanted !== false && !channel.pendingDeletion?.length && (['pending', 'failed'].includes(channel.subscriptionStatus) ||
      channel.subscriptionStatus === 'enabled' && (channel.subscriptionSecretHash !== this.webhookSecretHash || MODERATION_TYPES.some((type) => !channel.moderationSubscriptions?.[type])));
  }
  private async stopChat(channel: RegisteredChannel, detail: string): Promise<void> {
    channel.generation = (channel.generation ?? 0) + 1;
    channel.chatWanted = false;
    channel.resubscribeAfterDeletion = false;
    channel.pendingDeletion = [...new Set([...(channel.pendingDeletion ?? []), ...(channel.subscriptionId ? [channel.subscriptionId] : []), ...Object.values(channel.moderationSubscriptions ?? {})])];
    channel.subscriptionStatus = channel.pendingDeletion.length ? 'stopping' : 'offline';
    channel.deleteRetryAt = Date.now() + 1000; channel.deleteAttempts = 0;
    this.data.queue = this.data.queue.filter((q) => q.channelId !== channel.id);
    this.inboxQuery("DELETE FROM twitch_inbox WHERE delivered = 0 AND json_extract(payload, '$.channelId') = ?", channel.id);
    // Store the stop intent before any external DELETE. In-flight notifications are
    // acknowledged without entering the room while provider removal is retried.
    await this.persist();
    await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail, login: channel.login }).catch(() => {});
  }
  private async deleteSubscriptions(channelId: string): Promise<boolean> {
    return this.providerOperation(`delete:${channelId}`, async () => {
      const ids = await this.serial(async () => [...(this.data.channels[channelId]?.pendingDeletion ?? [])]);
      for (const id of ids) {
        try {
          const response = await this.helix(`eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 404) throw new Error('delete_not_confirmed');
          await this.serial(async () => {
            const channel = this.data.channels[channelId]; if (!channel?.pendingDeletion?.includes(id)) return;
            channel.pendingDeletion = channel.pendingDeletion.filter((value) => value !== id); await this.persist();
          });
        } catch {
          await this.serial(async () => {
            const channel = this.data.channels[channelId]; if (!channel?.pendingDeletion?.includes(id)) return;
            channel.deleteAttempts = Math.min(10, (channel.deleteAttempts ?? 0) + 1);
            channel.deleteRetryAt = Date.now() + Math.min(5 * 60_000, 1000 * 2 ** channel.deleteAttempts);
            channel.subscriptionStatus = channel.active ? 'stopping' : 'revoked'; await this.persist();
          });
          return false;
        }
      }
      return this.serial(async () => {
        const channel = this.data.channels[channelId]; if (!channel) return true;
        if (channel.pendingDeletion?.length) return false;
        // Only the pending deletion intent owns these fields. A newer connection
        // that no longer needs cleanup must not be rewound by a late DELETE.
        if (!['stopping', 'offline', 'revoked'].includes(channel.subscriptionStatus) && !channel.resubscribeAfterDeletion) return true;
        channel.subscriptionId = undefined; channel.moderationSubscriptions = {}; channel.pendingDeletion = [];
        const reconnect = channel.active && channel.chatWanted !== false && channel.resubscribeAfterDeletion;
        channel.subscriptionStatus = channel.active ? reconnect ? 'pending' : 'offline' : 'revoked';
        channel.resubscribeAfterDeletion = false; channel.deleteAttempts = 0; channel.deleteRetryAt = undefined;
        if (reconnect) channel.subscriptionRetryAt = Date.now() + 1000;
        await this.persist(); return true;
      });
    });
  }
  private async roomControl(channelId: string, event: Record<string, unknown>): Promise<void> {
    // A timeout does not undo work already admitted by Room. A monotonically
    // ordered projection lets Room ignore a late push after a newer decision.
    const channel = this.committed.channels[channelId];
    const payload = event.type === 'connection' ? { channelId, type: 'connection', login: channel?.login,
      status: channel?.connectionConnected === true ? 'connected' : 'disconnected', connectionRevision: channel?.connectionRevision ?? 0 } : { channelId, ...event };
    const response = await internalFetch(this.roomStub(channelId), 'https://room.internal/internal/control', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error('room_unavailable');
  }
  private async revokeChannel(channel: RegisteredChannel): Promise<void> {
    const sessions = Object.entries(this.data.sessions).filter(([, session]) => session.channelId === channel.id).map(([id]) => id);
    for (const id of sessions) delete this.data.sessions[id];
    channel.active = false; delete channel.credentials; channel.scopes = [];
    await this.stopChat(channel, 'Twitch authorization changed. Connect again.');
    channel.subscriptionStatus = 'revoked'; await this.persist();
    // Revoke the durable session before closing sockets. A failed push cannot
    // admit new commands; the room also rechecks durable session authorization.
    if (sessions.length) await this.roomControl(channel.id, { type: 'disconnect', sessionIds: sessions }).catch(() => {});
  }
  private async subscribe(channelId: string): Promise<void> {
    return this.providerOperation(`subscribe:${channelId}`, async () => {
      const snapshot = await this.serial(async () => {
        const channel = this.data.channels[channelId]; if (!channel || !this.needsSubscription(channel)) return null;
        if (channel.subscriptionId && channel.subscriptionSecretHash !== this.webhookSecretHash) {
          await this.queueSubscriptionCleanup(channel, channel.subscriptionId); return null;
        }
        const type = channel.subscriptionStatus === 'enabled' ? MODERATION_TYPES.find((type) => !channel.moderationSubscriptions?.[type]) : 'channel.chat.message';
        return type ? { channel: structuredClone(channel), type } : null;
      });
      if (!snapshot) return;
      const { channel, type } = snapshot; const primary = type === 'channel.chat.message';
      const current = () => {
        const value = this.data.channels[channelId];
        return value && this.allowed(value) && value.chatWanted !== false && !value.pendingDeletion?.length &&
          (value.generation ?? 0) === (channel.generation ?? 0) ? value : null;
      };
      try {
        const response = await this.helix('eventsub/subscriptions', { method: 'POST', body: JSON.stringify({ type, version: '1',
          condition: { broadcaster_user_id: channel.id, user_id: channel.id }, transport: { method: 'webhook', callback: `${publicOrigin(this.env)}${WEBHOOK}`, secret: this.env.TWITCH_EVENTSUB_SECRET } }) });
        let entry: Record<string, any> | null = null;
        if (response.status === 409) {
          // At most three 100-entry pages, restricted to the exact owned callback.
          // An old PC/tunnel callback is never adopted or deleted implicitly.
          let cursor = '';
          for (let page = 0; page < 3 && !entry; page++) {
            const list = await this.helix(`eventsub/subscriptions?type=${type}&first=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`, { method: 'GET' });
            const payload = list.ok ? object(await list.json()) : null;
            entry = payload && Array.isArray(payload.data) ? payload.data.find((item: any) => item?.type === type && item.version === '1' &&
              item.condition?.broadcaster_user_id === channelId && item.condition.user_id === channelId && item.transport?.method === 'webhook' &&
              item.transport.callback === `${publicOrigin(this.env)}${WEBHOOK}` && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 128) ?? null : null;
            const next = payload?.pagination?.cursor;
            if (entry || typeof next !== 'string' || !next || next.length > 256 || next === cursor) break;
            cursor = next;
          }
          if (!entry) throw new Error('subscription_conflict');
          const knownId = primary ? channel.subscriptionId : channel.moderationSubscriptions?.[type];
          if (entry.status !== 'enabled' || channel.subscriptionSecretHash !== this.webhookSecretHash || entry.id !== knownId) {
            await this.serial(async () => { const value = current(); if (value) await this.queueSubscriptionCleanup(value, entry!.id); });
            return;
          }
        } else {
          if (!response.ok) throw new Error('subscription_failed');
          const payload = object(await response.json()); entry = payload && Array.isArray(payload.data) ? object(payload.data[0]) : null;
          if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 128) throw new Error('subscription_failed');
        }
        await this.serial(async () => {
          const value = current();
          if (!value) {
            // A disconnect/revocation won the race after Twitch accepted creation.
            // Persist cleanup so an orphan cannot keep delivering indefinitely.
            const stopped = this.data.channels[channelId]; if (stopped) await this.queueSubscriptionCleanup(stopped, entry!.id);
            return;
          }
          if (primary) {
            const verified = value.subscriptionId === entry!.id && value.subscriptionStatus === 'enabled';
            value.subscriptionId = entry!.id; value.subscriptionStatus = verified || entry!.status === 'enabled' ? 'enabled' : 'pending';
          } else { value.moderationSubscriptions ??= {}; value.moderationSubscriptions[type] = entry!.id; }
          value.subscriptionSecretHash = this.webhookSecretHash;
          value.subscriptionAttempts = 0; value.subscriptionRetryAt = Date.now() + (primary ? 60_000 : 1000);
          await this.persist();
          if (value.subscriptionStatus === 'enabled') await this.roomControl(channelId, { type: 'connection', status: 'connected', detail: 'Twitch chat connected.', login: value.login }).catch(() => {});
        });
      } catch {
        await this.serial(async () => {
          const value = current(); if (!value) return;
          if (primary && value.subscriptionStatus !== 'enabled') value.subscriptionStatus = 'failed';
          value.subscriptionAttempts = Math.min(10, (value.subscriptionAttempts ?? 0) + 1);
          value.subscriptionRetryAt = Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** value.subscriptionAttempts);
          await this.persist();
        });
      }
    });
  }
  private async queueSubscriptionCleanup(channel: RegisteredChannel, id: string): Promise<void> {
    channel.generation = (channel.generation ?? 0) + 1;
    channel.pendingDeletion = [...new Set([...(channel.pendingDeletion ?? []), id, ...(channel.subscriptionId ? [channel.subscriptionId] : []), ...Object.values(channel.moderationSubscriptions ?? {})])];
    channel.subscriptionStatus = channel.active ? 'stopping' : 'revoked'; channel.resubscribeAfterDeletion = this.allowed(channel) && channel.chatWanted !== false;
    channel.deleteRetryAt = Date.now() + 1000; await this.persist();
    await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail: 'Reconnecting Twitch chat.', login: channel.login }).catch(() => {});
  }
  private async webhook(body: string, signature: NonNullable<Awaited<ReturnType<typeof verifyWebhook>>>): Promise<Response | { delivery: string }> {
    const ignored = () => new Response(null, { status: 204 });
    let payload: Record<string, any> | null;
    try { payload = object(JSON.parse(body)); } catch { return ignored(); }
    const subscription = object(payload?.subscription); const condition = object(subscription?.condition);
    const channel = condition && ID.test(condition.broadcaster_user_id ?? '') ? this.data.channels[condition.broadcaster_user_id] : undefined;
    if (!this.allowed(channel) || !['channel.chat.message', ...MODERATION_TYPES].includes(subscription?.type) || subscription?.version !== '1' || condition?.user_id !== channel.id ||
      typeof subscription.id !== 'string' || subscription.id.length > 128) return ignored();
    if (signature.type === 'revocation' && (subscription.status === 'authorization_revoked' || subscription.status === 'user_removed')) {
      await this.revokeChannel(channel); return ignored();
    }
    if (channel.chatWanted === false || channel.pendingDeletion?.includes(subscription.id)) return ignored();
    const primary = subscription.type === 'channel.chat.message';
    const knownId = primary ? channel.subscriptionId : channel.moderationSubscriptions?.[subscription.type];
    if (knownId && knownId !== subscription.id) return ignored();
    if (!knownId && signature.type !== 'webhook_callback_verification') return ignored();
    if (signature.type === 'webhook_callback_verification') {
      if (typeof payload?.challenge !== 'string' || payload.challenge.length > 1024) return ignored();
      if (primary) { channel.subscriptionId = subscription.id; channel.subscriptionStatus = 'enabled'; channel.subscriptionRetryAt = Date.now() + 1000; }
      else { channel.moderationSubscriptions ??= {}; channel.moderationSubscriptions[subscription.type] = subscription.id; }
      channel.subscriptionSecretHash = this.webhookSecretHash;
      await this.persist();
      await this.roomControl(channel.id, { type: 'connection', status: 'connected', detail: 'Twitch chat connected.', login: channel.login }).catch(() => {});
      return new Response(payload.challenge, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    }
    if (signature.type === 'revocation') {
      if (subscription.status === 'version_removed') {
        await this.stopChat(channel, 'Twitch chat needs an update before it can reconnect.'); return ignored();
      }
      channel.generation = (channel.generation ?? 0) + 1;
      if (primary) { channel.subscriptionId = undefined; channel.subscriptionStatus = 'failed'; }
      else if (channel.moderationSubscriptions) delete channel.moderationSubscriptions[subscription.type];
      channel.subscriptionRetryAt = Date.now() + 60_000; channel.subscriptionAttempts = 0; await this.persist();
      if (primary) await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail: 'Reconnecting Twitch chat.', login: channel.login }).catch(() => {});
      return ignored();
    }
    const event = object(payload?.event); const message = object(event?.message);
    if (!event || event.broadcaster_user_id !== channel.id) return ignored();
    if (primary && (!ID.test(event.chatter_user_id ?? '') || typeof event.chatter_user_name !== 'string' ||
      event.chatter_user_name.length > 100 || typeof event.message_id !== 'string' || event.message_id.length > 128 || typeof message?.text !== 'string' ||
      message.text.length > 2000 || event.source_broadcaster_user_id && event.source_broadcaster_user_id !== channel.id)) return ignored();
    if (!primary && (!ID.test(event.target_user_id ?? '') || subscription.type === 'channel.chat.message_delete' && (typeof event.message_id !== 'string' || event.message_id.length > 128))) return ignored();
    if (primary && event.chatter_user_id === this.env.EDGE_BOT_USER_ID) return new Response(null, { status: 204 });
    if (this.inboxQuery('SELECT id FROM twitch_inbox WHERE id = ?', signature.id).length) return ignored();
    const counts = this.inboxQuery<{ total: number; pending: number }>('SELECT total,pending FROM inbox_counts WHERE id=1')[0]!;
    if (counts.total >= CONTROL_LIMITS.dedupe || counts.pending >= CONTROL_LIMITS.inbox) return json({ error: 'Chat delivery is busy. Retry shortly.' }, 503);
    const badges = Array.isArray(event.badges) ? event.badges.slice(0, 64).flatMap((b: unknown) => { const v = object(b); return typeof v?.set_id === 'string' && v.set_id.length <= 40 ? [v.set_id] : []; }) : [];
    const normalized: TwitchChatEvent = { eventId: signature.id, channelId: channel.id, at: Date.parse(signature.timestamp),
      kind: primary ? 'message' : subscription.type === 'channel.chat.message_delete' ? 'delete' : 'clear-user',
      messageId: event.message_id, userId: primary ? event.chatter_user_id : event.target_user_id,
      ...(primary ? { name: event.chatter_user_name.slice(0, 40), text: message!.text, badges } : {}) };
    // Persist before delivery. Room deduplication makes a retry after eviction safe.
    this.inboxQuery('INSERT INTO twitch_inbox (id,expires_at,next_at,payload) VALUES (?,?,?,?)', signature.id,
      Math.max(Date.now(), normalized.at) + CONTROL_LIMITS.webhookMs, Date.now(), JSON.stringify(normalized));
    await this.schedule();
    return { delivery: normalized.eventId };
  }
  private async deliver(eventId: string): Promise<void> {
    await this.providerOperation(`room-delivery:${eventId}`, async () => {
      const event = await this.serial(async () => {
        const row = this.inboxQuery<{ payload: string }>('SELECT payload FROM twitch_inbox WHERE id = ? AND delivered = 0', eventId)[0];
        if (!row) return null;
        const current = JSON.parse(row.payload) as TwitchChatEvent;
        const channel = this.data.channels[current.channelId];
        if (!this.allowed(channel) || channel.chatWanted === false) {
          this.inboxQuery('DELETE FROM twitch_inbox WHERE id = ?', eventId); await this.schedule(); return null;
        }
        return current;
      });
      if (!event) return;
      let delivered = false;
      try {
        const response = await internalFetch(this.roomStub(event.channelId), 'https://room.internal/internal/twitch-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
        delivered = response.ok || response.status >= 400 && response.status < 500 && response.status !== 429;
      } catch { /* Keep the committed inbox entry for a bounded, idempotent retry. */ }
      await this.serial(async () => {
        // Disconnect or another completed attempt may have removed the entry
        // while the Room was working. Never resurrect a cancelled delivery.
        const row = this.inboxQuery<{ attempts: number }>('SELECT attempts FROM twitch_inbox WHERE id = ? AND delivered = 0', eventId)[0];
        if (!row) return;
        if (delivered) this.inboxQuery('UPDATE twitch_inbox SET delivered = 1, payload = NULL WHERE id = ?', eventId);
        else {
          const attempts = row.attempts + 1;
          this.inboxQuery('UPDATE twitch_inbox SET attempts = ?, next_at = ? WHERE id = ?', attempts, Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)), eventId);
        }
        await this.schedule();
      });
    });
  }
  private async roomEvent(input: RoomAnnouncement): Promise<Response> {
    if (typeof input.eventId !== 'string' || input.eventId.length > 160 || !object(input.safeView) || !object(input.event)) return json({ error: 'Invalid event.' }, 400);
    const isCommand = input.event.type === 'chat-command';
    const prefix = `room:${input.channelId}:${isCommand ? 'command' : 'round'}:`;
    const key = `${prefix}${input.eventId}`;
    if (this.data.dedupe[key]) return json({ ok: true });
    // Never let even an accidentally supplied viewer projection feed the bot.
    const view = structuredClone(input.safeView) as GameView;
    if (view.round) { delete view.round.target; delete view.round.forbiddenClues; delete view.round.artUrl; delete view.round.example; delete view.round.ink; }
    view.history = view.history.map(({ word: _word, ...rest }) => rest);
    if (view.result && !['caught', 'escaped'].includes(view.result.outcome)) delete view.result.word;
    let announcement = null;
    const channelSettings = this.data.channels[input.channelId]!;
    if (input.event.type === 'bot-settings') { channelSettings.botGeneration = (channelSettings.botGeneration ?? 0) + 1; await this.persist(); }
    if (!view.settings.chatBot) {
      const previous = this.data.queue.length;
      this.data.queue = this.data.queue.filter((q) => q.channelId !== input.channelId);
      if (previous !== this.data.queue.length) await this.persist();
      return json({ ok: true });
    }
    else if (input.event.type === 'chat-command') {
      const commands = { help: helpText, score: scoreText, top: topText, who: whoText };
      const command = input.event.command;
      const channelKey = `channel:${input.channelId}`; const userKey = `user:${input.channelId}:${input.event.userId}`;
      if (Object.hasOwn(commands, command) && ID.test(input.event.userId) && !this.data.commandCooldowns[channelKey] && !this.data.commandCooldowns[userKey] &&
        Object.keys(this.data.commandCooldowns).length < 1024) {
        announcement = { key: 'command', ttl: 10_000, text: commands[command](view) };
        this.data.commandCooldowns[channelKey] = Date.now() + 20_000;
        this.data.commandCooldowns[userKey] = Date.now() + 30_000;
      }
    } else if (input.event.type !== 'bot-settings') announcement = eventAnnouncement(view, input.event);
    // Cooldown-ignored commands do not consume announcement receipt capacity or
    // rewrite the full durable state. Each channel has its own bounded buckets.
    if (!announcement) return json({ ok: true });
    const receipts = Object.entries(this.data.dedupe).filter(([id]) => id.startsWith(prefix));
    if (receipts.length >= (isCommand ? 32 : 128)) {
      receipts.sort((a, b) => a[1] - b[1]); delete this.data.dedupe[receipts[0]![0]];
    }
    this.data.dedupe[key] = Date.now() + CONTROL_LIMITS.webhookMs;
    const channel = this.data.channels[input.channelId]!; const bot = this.botStatus(channel);
    if (announcement && channel.chatWanted !== false && bot.configured && bot.authorized && bot.channelAllowed) {
      const text = announcement.text.trim();
      if (text && text.length <= 500) {
        this.data.queue = this.data.queue.filter((q) => !(q.channelId === input.channelId && q.key === announcement.key));
        if (this.data.queue.filter((q) => q.channelId === input.channelId).length >= 8) {
          const replace = this.data.queue.findIndex((q) => q.channelId === input.channelId && (q.key === 'command' || !isCommand));
          if (replace >= 0) this.data.queue.splice(replace, 1);
        }
        if (this.data.queue.length < CONTROL_LIMITS.queue) this.data.queue.push({ id: key, channelId: input.channelId, key: announcement.key,
          text, expiresAt: Date.now() + Math.min(60_000, announcement.ttl) });
      }
    }
    await this.persist(); return json({ ok: true });
  }
  private botBudget(): number {
    const raw = Number(this.env.EDGE_BOT_MESSAGES_PER_30_SECONDS ?? 15);
    return Number.isInteger(raw) && raw >= 1 ? Math.min(18, raw) : 15;
  }
  private async sendOne(): Promise<void> {
    return this.providerOperation('bot-send', async () => {
      const reserved = await this.serial(async () => {
        const now = Date.now(); this.prune(now);
        const bot = this.data.bot;
        if (!bot || bot.user.id !== this.env.EDGE_BOT_USER_ID || this.data.pausedUntil > now || this.data.sentAt.length >= this.botBudget()) return null;
        this.data.queue.sort((a, b) => Number(a.key === 'command') - Number(b.key === 'command'));
        this.data.channelSentWindow ??= {};
        for (const [channel, times] of Object.entries(this.data.channelSentWindow)) this.data.channelSentWindow[channel] = times.filter((at) => at > now - 30_000);
        const index = this.data.queue.findIndex((q) => now - (this.data.channelSentAt[q.channelId] ?? 0) >= 1100 &&
          (this.data.channelSentWindow![q.channelId]?.length ?? 0) < 6 && this.data.channels[q.channelId]?.scopes.includes('channel:bot'));
        if (index < 0) return null;
        const [item] = this.data.queue.splice(index, 1); if (!item) return null;
        const channel = this.data.channels[item.channelId]!;
        this.data.sentAt.push(now); this.data.channelSentAt[item.channelId] = now;
        (this.data.channelSentWindow[item.channelId] ??= []).push(now);
        // Reserve and remove before any provider wait. An ambiguous send is never
        // retried, even if this object restarts while Twitch handles the request.
        await this.persist();
        return { item, now, sender: bot.user.id, credentials: bot.credentials.ciphertext,
          generation: channel.generation ?? 0, botGeneration: channel.botGeneration ?? 0 };
      });
      if (!reserved) return;
      const { item, now } = reserved; let status: 'sent' | 'failed' | 'dropped' = 'failed';
      let pause = 0; let clearToken = false;
      try {
        const access = await this.appToken();
        const canSend = await this.serial(async () => {
          const channel = this.data.channels[item.channelId];
          return this.allowed(channel) && channel.chatWanted !== false && channel.scopes.includes('channel:bot') &&
            (channel.generation ?? 0) === reserved.generation && (channel.botGeneration ?? 0) === reserved.botGeneration &&
            this.data.bot?.credentials.ciphertext === reserved.credentials && item.expiresAt > Date.now();
        });
        if (!canSend) status = 'dropped';
        else {
          const response = await this.externalFetch('https://api.twitch.tv/helix/chat/messages', { method: 'POST',
            headers: { authorization: `Bearer ${access}`, 'client-id': this.env.TWITCH_CLIENT_ID!, 'content-type': 'application/json' },
            body: JSON.stringify({ broadcaster_id: item.channelId, sender_id: reserved.sender, message: item.text }) });
          if (response.status === 429) {
            const reset = Number(response.headers.get('ratelimit-reset')) * 1000;
            pause = Date.now() + Math.max(30_000, Math.min(5 * 60_000, Number.isFinite(reset) ? reset - Date.now() : 30_000));
          } else if (response.status === 401) { clearToken = true; pause = Date.now() + 30_000; }
          else if (response.ok) {
            const body = object(await response.json()); const result = body && Array.isArray(body.data) ? object(body.data[0]) : null;
            status = result?.is_sent === true ? 'sent' : 'dropped';
            if (status === 'dropped' && /rate|limit|throttl/i.test(String(result?.drop_reason?.code ?? ''))) pause = Date.now() + 30_000;
          }
        }
      } catch { /* Ambiguous sends are not replayed. Provider data never enters logs. */ }
      await this.serial(async () => {
        this.data.pausedUntil = Math.max(this.data.pausedUntil, pause);
        if (clearToken) this.data.appToken = undefined;
        this.data.receipts.push({ id: item.id, channelId: item.channelId, at: now, status }); await this.persist();
      });
    });
  }
  private async validateCredential(channelId: string | null): Promise<void> {
    const snapshot = this.committed;
    const holder = channelId ? snapshot.channels[channelId] : snapshot.bot;
    let encrypted = holder?.credentials;
    if (!encrypted || channelId && !this.allowed(snapshot.channels[channelId])) return;
    const identity = channelId ? `channel:${channelId}` : `bot:${snapshot.bot!.user.id}`;
    const current = () => {
      const value = channelId ? this.data.channels[channelId] : this.data.bot;
      return this.configured() && value?.credentials?.ciphertext === encrypted!.ciphertext &&
        (!channelId || this.allowed(this.data.channels[channelId])) ? value : null;
    };
    try {
      let credentials = await decryptValue<Credentials>(encrypted, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, identity);
      if (credentials.expiresAt < Date.now() + 5 * 60_000) {
        const token = await this.tokenCall({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
        if (typeof token.refresh_token !== 'string') throw new Error('token_revoked');
        credentials = { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
        const refreshed = await this.seal(credentials, identity);
        const saved = await this.serial(async () => {
          const value = current(); if (!value) return false;
          value.credentials = refreshed; await this.persist(); return true;
        });
        if (!saved) return;
        encrypted = refreshed;
      }
      // Provider validation never occupies the Control mutation queue. A concurrent
      // logout/revocation/new OAuth grant wins over this older credential snapshot.
      const valid = await this.validateToken(credentials.accessToken, channelId ? BROADCASTER_SCOPES : BOT_SCOPES);
      if (valid.userId !== credentials.id || valid.login !== credentials.login) throw new Error('token_revoked');
      credentials = { ...credentials, scopes: valid.scopes, validatedAt: Date.now() };
      const sealed = await this.seal(credentials, identity);
      await this.serial(async () => {
        const value = current(); if (!value) return;
        value.credentials = sealed; value.validatedAt = credentials.validatedAt;
        if (channelId) this.data.channels[channelId]!.scopes = credentials.scopes;
        await this.persist();
      });
    } catch (error) {
      await this.serial(async () => {
        if (!current()) return;
        if (error instanceof Error && error.message === 'token_revoked') {
          if (channelId) await this.revokeChannel(this.data.channels[channelId]!);
          else { delete this.data.bot; this.data.queue = []; await this.persist(); }
        } else {
          this.data.nextValidationAt = Math.min(this.data.nextValidationAt || Infinity, Date.now() + 5 * 60_000);
          await this.persist();
        }
      });
    }
  }
  async alarm(): Promise<void> {
    const work = await this.serial(async () => {
      if (!this.configured()) { await this.ctx.storage.deleteAlarm(); return null; }
      this.prune();
      const idle = Object.values(this.data.channels).find((c) => this.allowed(c) && c.chatWanted !== false && c.lastStudioAt &&
        c.lastStudioAt + studioIdleMilliseconds(this.env) <= Date.now());
      if (idle) await this.stopChat(idle, 'Studio has been inactive. Connect Twitch chat when you return.');
      const stopping = Object.values(this.data.channels).find((c) => c.pendingDeletion?.length && (c.deleteRetryAt ?? 0) <= Date.now());
      const pending = this.inboxQuery<{ id: string }>('SELECT id FROM twitch_inbox WHERE delivered = 0 AND next_at <= ? ORDER BY next_at LIMIT 8', Date.now()).map((row) => row.id);
      const channel = Object.values(this.data.channels).find((c) => this.needsSubscription(c) && (c.subscriptionRetryAt ?? 0) <= Date.now());
      const validate: (string | null)[] = [];
      if (this.data.nextValidationAt && this.data.nextValidationAt <= Date.now()) {
        this.data.nextValidationAt = Date.now() + CONTROL_LIMITS.validationMs;
        validate.push(...Object.values(this.data.channels).filter((c) => this.allowed(c)).map((c) => c.id));
        if (this.data.bot) validate.push(null);
      }
      await this.persist(); return { stopping: stopping?.id, subscribe: channel?.id, validate, pending };
    });
    if (!work) return;
    // Twitch waits stay outside the shared mutation queue. Each operation captures
    // a durable intent and applies results only to that still-current generation.
    if (work.stopping) await this.deleteSubscriptions(work.stopping);
    if (work.subscribe) await this.subscribe(work.subscribe);
    await this.sendOne();
    for (const channelId of work.validate) await this.validateCredential(channelId);
    // Retry waits are bounded individually but can add up across eight attempts.
    // Finish due cleanup, subscriptions, announcements and auth checks first.
    for (const eventId of work.pending) await this.deliver(eventId);
  }
}
