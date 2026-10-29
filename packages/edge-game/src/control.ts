import { DurableObject } from 'cloudflare:workers';
import { eventAnnouncement, helpText, scoreText, topText, whoText } from '../../app/server/chat-copy.js';
import type { GameView } from '../../app/shared/types.js';
import { allowedLogins, cookieValue, decryptValue, encryptValue, maximumChannels, oauthCookie, OAUTH_COOKIE, publicOrigin,
  randomToken, sameOrigin, sameText, secretBytes, sessionCookie, SESSION_COOKIE, sha256, signPilotCapability, studioIdleMilliseconds, verifyWebhook } from './control-auth.js';
import { CONTROL_LIMITS, type ControlEnv, type ControlSession, type ControlState, type Credentials, type RegisteredChannel,
  type RoomAnnouncement, type TwitchChatEvent, type TwitchUser } from './control-types.js';

const ID = /^[1-9][0-9]{0,24}$/;
const CALLBACK = '/auth/twitch/callback';
const WEBHOOK = '/api/twitch/eventsub';
// Webhook transport uses an app token: its reading identity must grant user:bot,
// and the broadcaster must grant channel:bot. These grants do not enable posting.
const BROADCASTER_SCOPES = ['user:read:chat', 'user:bot', 'channel:bot'];
const BOT_SCOPES = ['user:write:chat', 'user:bot'];
const MODERATION_TYPES = ['channel.chat.message_delete', 'channel.chat.clear_user_messages'];
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
  constructor(ctx: DurableObjectState, env: ControlEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<ControlState>('control-v1');
      if (saved) { if (saved.version !== 1) throw new Error('Unsupported control state.'); this.data = saved; }
      this.committed = structuredClone(this.data);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS twitch_inbox (
        id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, next_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, payload TEXT, delivered INTEGER NOT NULL DEFAULT 0)`);
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
  protected externalFetch(input: string, init?: RequestInit): Promise<Response> {
    return fetch(input, { ...init, signal: AbortSignal.timeout(5000), redirect: 'error' });
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
    this.ctx.storage.sql.exec('DELETE FROM twitch_inbox WHERE expires_at <= ?', now);
  }
  private async persist(): Promise<void> {
    try { await this.ctx.storage.put('control-v1', this.data); this.committed = structuredClone(this.data); }
    catch (error) { this.data = await this.ctx.storage.get<ControlState>('control-v1') ?? readyState(); throw error; }
    await this.schedule();
  }
  private async schedule(): Promise<void> {
    const now = Date.now(); const deadlines: number[] = [];
    const inbox = this.ctx.storage.sql.exec<{ at: number | null }>('SELECT MIN(next_at) AS at FROM twitch_inbox WHERE delivered = 0').toArray()[0]?.at;
    if (inbox) deadlines.push(inbox);
    if (this.data.queue.length) deadlines.push(Math.max(now + 1100, this.data.pausedUntil, this.data.sentAt.length >= this.botBudget() ? this.data.sentAt[0]! + 30_001 : 0));
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
  private async session(request: Request): Promise<{ id: string; value: ControlSession; channel: RegisteredChannel } | null> {
    const cookie = cookieValue(request, SESSION_COOKIE); if (!cookie) return null;
    const id = await sha256(cookie); const value = this.data.sessions[id];
    const channel = value ? this.data.channels[value.channelId] : undefined;
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
    if (url.pathname === CALLBACK && request.method === 'GET') return this.callback(request, url);
    if (url.pathname === WEBHOOK && request.method === 'POST') return this.webhook(request);
    if (url.pathname === '/api/edge/overlay' && request.method === 'POST') return this.overlay(request);
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
    if (url.pathname === '/api/edge/chat' && request.method === 'POST') {
      if (!this.csrf(request, session) || !request.headers.get('content-type')?.startsWith('application/json')) return denied();
      const body = object(JSON.parse(await boundedControlBody(request)));
      if (!body || typeof body.connected !== 'boolean') return json({ error: 'Choose whether to connect Twitch chat.' }, 400);
      const channel = session.channel;
      if (!body.connected) {
        await this.stopChat(channel, 'Twitch chat disconnected.');
        const stopped = await this.deleteSubscriptions(channel);
        return stopped ? json({ ok: true, connected: false, subscriptionStatus: 'offline' }) :
          json({ error: 'Twitch chat is paused. Twitch has not confirmed the subscription removal yet; we will keep retrying.', connected: false, subscriptionStatus: 'stopping' }, 503);
      }
      if (channel.pendingDeletion?.length || channel.subscriptionStatus === 'stopping') return json({ error: 'Twitch is still disconnecting. Try connecting again shortly.', subscriptionStatus: 'stopping' }, 409);
      channel.chatWanted = true; channel.lastStudioAt = Date.now();
      if (channel.subscriptionStatus !== 'enabled') { channel.subscriptionStatus = 'pending'; channel.subscriptionRetryAt = Date.now() + 1000; channel.subscriptionAttempts = 0; }
      await this.persist();
      await this.roomControl(channel.id, { type: 'connection', status: channel.subscriptionStatus === 'enabled' ? 'connected' : 'disconnected',
        detail: channel.subscriptionStatus === 'enabled' ? 'Twitch chat connected.' : 'Connecting Twitch chat.', login: channel.login }).catch(() => {});
      return json({ ok: true, connected: channel.subscriptionStatus === 'enabled', subscriptionStatus: channel.subscriptionStatus });
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
  private async beginOAuth(kind: 'broadcaster' | 'bot', initiatingSession?: string, asJson = false): Promise<Response> {
    if (Object.keys(this.data.pending).length >= CONTROL_LIMITS.pendingOAuth) return json({ error: 'Too many sign-in attempts. Try again shortly.' }, 429);
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
    const clear = { 'set-cookie': oauthCookie('', 0) };
    const state = url.searchParams.get('state') ?? ''; const cookie = cookieValue(request, OAUTH_COOKIE);
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !cookie) return json({ error: 'Sign-in expired. Connect your Twitch account again.' }, 400, clear);
    const stateKey = await sha256(state); const pending = this.data.pending[stateKey];
    // A bad cookie must not consume a valid state belonging to another browser.
    if (!pending || pending.expiresAt <= Date.now() || !sameText(pending.cookieHash, await sha256(cookie))) return denied();
    delete this.data.pending[stateKey]; await this.persist();
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048 || url.searchParams.has('error')) return json({ error: 'Twitch sign-in was not completed.' }, 400, clear);
    if (pending.kind === 'bot' && (!pending.initiatingSession || !this.data.sessions[pending.initiatingSession])) return denied();
    const c = await this.exchange(code, pending.kind);
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
    this.data.channels[c.id] = { id: c.id, login: c.login, name: c.name, credentials: await this.seal(c, `channel:${c.id}`),
      overlayKey: existing?.overlayKey ?? await this.seal(overlayKey, `overlay:${c.id}`), overlayKeyHash: existing?.overlayKeyHash ?? await sha256(overlayKey!),
      scopes: c.scopes, validatedAt: c.validatedAt, subscriptionId: existing?.subscriptionStatus === 'revoked' ? undefined : existing?.subscriptionId,
      moderationSubscriptions: existing?.subscriptionStatus === 'revoked' ? {} : existing?.moderationSubscriptions ?? {},
      subscriptionStatus: existing?.chatWanted === false ? existing.subscriptionStatus : existing?.subscriptionStatus === 'enabled' ? 'enabled' : 'pending',
      chatWanted: existing?.chatWanted ?? true, lastStudioAt: Date.now(), pendingDeletion: existing?.pendingDeletion ?? [],
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
  }
  private seal(value: unknown, context: string) { return encryptValue(value, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, context); }
  private async tokenCall(parameters: Record<string, string>): Promise<Record<string, any>> {
    const response = await this.externalFetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({
      client_id: this.env.TWITCH_CLIENT_ID!, client_secret: this.env.TWITCH_CLIENT_SECRET!, ...parameters }) });
    if (!response.ok) throw new Error('token_exchange_failed');
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
  private async exchange(code: string, kind: 'broadcaster' | 'bot'): Promise<Credentials> {
    const tokens = await this.tokenCall({ grant_type: 'authorization_code', code, redirect_uri: `${publicOrigin(this.env)}${CALLBACK}` });
    if (typeof tokens.refresh_token !== 'string' || tokens.refresh_token.length > 4096) throw new Error('invalid_refresh_token');
    const valid = await this.validateToken(tokens.access_token, kind === 'bot' ? BOT_SCOPES : BROADCASTER_SCOPES);
    const response = await this.externalFetch('https://api.twitch.tv/helix/users', { headers: { authorization: `Bearer ${tokens.access_token}`, 'client-id': this.env.TWITCH_CLIENT_ID! } });
    if (!response.ok) throw new Error('identity_unavailable');
    const payload = object(await response.json()); const user = payload && Array.isArray(payload.data) && payload.data.length === 1 ? userShape(payload.data[0]) : null;
    if (!user || user.id !== valid.userId || user.login !== valid.login) throw new Error('identity_mismatch');
    return { ...user, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000,
      validatedAt: Date.now(), scopes: valid.scopes };
  }
  private async appToken(force = false): Promise<string> {
    if (!force && this.data.appToken && this.data.appToken.expiresAt > Date.now() + 60_000) return decryptValue<string>(this.data.appToken.value, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, 'app-token');
    const token = await this.tokenCall({ grant_type: 'client_credentials' });
    this.data.appToken = { value: await this.seal(token.access_token, 'app-token'), expiresAt: Date.now() + token.expires_in * 1000 };
    await this.persist(); return token.access_token;
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
    const channel = value && ID.test(value.channelId ?? '') ? this.data.channels[value.channelId] : undefined;
    if (!this.allowed(channel) || typeof value?.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.key) || !sameText(await sha256(value.key), channel.overlayKeyHash)) return denied();
    return json({ channelId: channel.id, ...(await signPilotCapability(this.env, { channelId: channel.id, role: 'overlay', sessionId: `overlay:${channel.id}` })) });
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
      channel.subscriptionStatus === 'enabled' && MODERATION_TYPES.some((type) => !channel.moderationSubscriptions?.[type]));
  }
  private async stopChat(channel: RegisteredChannel, detail: string): Promise<void> {
    channel.chatWanted = false;
    channel.pendingDeletion = [...new Set([...(channel.pendingDeletion ?? []), ...(channel.subscriptionId ? [channel.subscriptionId] : []), ...Object.values(channel.moderationSubscriptions ?? {})])];
    channel.subscriptionStatus = channel.pendingDeletion.length ? 'stopping' : 'offline';
    channel.deleteRetryAt = Date.now() + 1000; channel.deleteAttempts = 0;
    this.data.queue = this.data.queue.filter((q) => q.channelId !== channel.id);
    this.ctx.storage.sql.exec("DELETE FROM twitch_inbox WHERE delivered = 0 AND json_extract(payload, '$.channelId') = ?", channel.id);
    // Store the stop intent before any external DELETE. In-flight notifications are
    // acknowledged without entering the room while provider removal is retried.
    await this.persist();
    await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail, login: channel.login }).catch(() => {});
  }
  private async deleteSubscriptions(channel: RegisteredChannel): Promise<boolean> {
    for (const id of [...(channel.pendingDeletion ?? [])]) {
      try {
        const response = await this.helix(`eventsub/subscriptions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) throw new Error('delete_not_confirmed');
        channel.pendingDeletion = channel.pendingDeletion!.filter((value) => value !== id); await this.persist();
      } catch {
        channel.deleteAttempts = Math.min(10, (channel.deleteAttempts ?? 0) + 1);
        channel.deleteRetryAt = Date.now() + Math.min(5 * 60_000, 1000 * 2 ** channel.deleteAttempts);
        channel.subscriptionStatus = 'stopping'; await this.persist(); return false;
      }
    }
    channel.subscriptionId = undefined; channel.moderationSubscriptions = {}; channel.pendingDeletion = [];
    channel.subscriptionStatus = 'offline'; channel.deleteAttempts = 0; channel.deleteRetryAt = undefined;
    await this.persist(); return true;
  }
  private async roomControl(channelId: string, event: Record<string, unknown>): Promise<void> {
    const response = await this.roomStub(channelId).fetch('https://room.internal/internal/control', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channelId, ...event }) });
    if (!response.ok) throw new Error('room_unavailable');
  }
  private async subscribe(channel: RegisteredChannel): Promise<void> {
    if (!this.allowed(channel)) return;
    const type = channel.subscriptionStatus === 'enabled' ? MODERATION_TYPES.find((type) => !channel.moderationSubscriptions?.[type]) : 'channel.chat.message';
    if (!type) return;
    const primary = type === 'channel.chat.message';
    try {
      const response = await this.helix('eventsub/subscriptions', { method: 'POST', body: JSON.stringify({ type, version: '1',
        condition: { broadcaster_user_id: channel.id, user_id: channel.id }, transport: { method: 'webhook', callback: `${publicOrigin(this.env)}${WEBHOOK}`, secret: this.env.TWITCH_EVENTSUB_SECRET } }) });
      if (response.status === 409) {
        // Do not guess an existing subscription's status or callback destination.
        const list = await this.helix(`eventsub/subscriptions?type=${type}`, { method: 'GET' });
        const payload = list.ok ? object(await list.json()) : null;
        const found = payload && Array.isArray(payload.data) ? payload.data.find((s: any) => s?.condition?.broadcaster_user_id === channel.id && s.condition.user_id === channel.id &&
          s.transport?.method === 'webhook' && s.transport.callback === `${publicOrigin(this.env)}${WEBHOOK}` && s.status === 'enabled') : null;
        if (!found) throw new Error('subscription_conflict');
        if (primary) { channel.subscriptionId = found.id; channel.subscriptionStatus = 'enabled'; }
        else { channel.moderationSubscriptions ??= {}; channel.moderationSubscriptions[type] = found.id; }
      } else {
        if (!response.ok) throw new Error('subscription_failed');
        const payload = object(await response.json()); const entry = payload && Array.isArray(payload.data) ? object(payload.data[0]) : null;
        if (!entry || typeof entry.id !== 'string' || entry.id.length > 128) throw new Error('subscription_failed');
        if (primary) { channel.subscriptionId = entry.id; channel.subscriptionStatus = entry.status === 'enabled' ? 'enabled' : 'pending'; }
        else { channel.moderationSubscriptions ??= {}; channel.moderationSubscriptions[type] = entry.id; }
      }
      channel.subscriptionAttempts = 0; channel.subscriptionRetryAt = Date.now() + (primary ? 60_000 : 1000);
      await this.persist();
      if (channel.subscriptionStatus === 'enabled') await this.roomControl(channel.id, { type: 'connection', status: 'connected', detail: 'Twitch chat connected.', login: channel.login });
    } catch {
      if (primary) channel.subscriptionStatus = 'failed';
      channel.subscriptionAttempts = Math.min(10, (channel.subscriptionAttempts ?? 0) + 1);
      channel.subscriptionRetryAt = Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** channel.subscriptionAttempts);
      await this.persist();
    }
  }
  private async webhook(request: Request): Promise<Response> {
    const body = await boundedControlBody(request); const signature = await verifyWebhook(request, body, this.env.TWITCH_EVENTSUB_SECRET);
    if (!signature) return denied();
    const payload = object(JSON.parse(body)); const subscription = object(payload?.subscription); const condition = object(subscription?.condition);
    const channel = condition && ID.test(condition.broadcaster_user_id ?? '') ? this.data.channels[condition.broadcaster_user_id] : undefined;
    if (!this.allowed(channel) || !['channel.chat.message', ...MODERATION_TYPES].includes(subscription?.type) || subscription?.version !== '1' || condition?.user_id !== channel.id ||
      typeof subscription.id !== 'string' || subscription.id.length > 128) return denied();
    if (channel.chatWanted === false) return new Response(null, { status: 204 });
    const primary = subscription.type === 'channel.chat.message';
    const knownId = primary ? channel.subscriptionId : channel.moderationSubscriptions?.[subscription.type];
    if (knownId && knownId !== subscription.id) return denied();
    if (!knownId && signature.type !== 'webhook_callback_verification') return denied();
    if (signature.type === 'webhook_callback_verification') {
      if (typeof payload?.challenge !== 'string' || payload.challenge.length > 1024) return denied();
      if (primary) { channel.subscriptionId = subscription.id; channel.subscriptionStatus = 'enabled'; channel.subscriptionRetryAt = Date.now() + 1000; }
      else { channel.moderationSubscriptions ??= {}; channel.moderationSubscriptions[subscription.type] = subscription.id; }
      await this.persist();
      await this.roomControl(channel.id, { type: 'connection', status: 'connected', detail: 'Twitch chat connected.', login: channel.login }).catch(() => {});
      return new Response(payload.challenge, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    }
    if (signature.type === 'revocation') {
      if (!primary && subscription.status !== 'authorization_revoked' && subscription.status !== 'user_removed') {
        if (channel.moderationSubscriptions) delete channel.moderationSubscriptions[subscription.type];
        channel.subscriptionRetryAt = Date.now() + 60_000; await this.persist();
        return new Response(null, { status: 204 });
      }
      channel.subscriptionStatus = 'revoked'; channel.active = false;
      for (const [id, session] of Object.entries(this.data.sessions)) if (session.channelId === channel.id) delete this.data.sessions[id];
      this.data.queue = this.data.queue.filter((q) => q.channelId !== channel.id); await this.persist();
      await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail: 'Twitch authorization changed. Connect again.', login: channel.login }).catch(() => {});
      return new Response(null, { status: 204 });
    }
    const event = object(payload?.event); const message = object(event?.message);
    if (!event || event.broadcaster_user_id !== channel.id) return denied();
    if (primary && (!ID.test(event.chatter_user_id ?? '') || typeof event.chatter_user_name !== 'string' ||
      event.chatter_user_name.length > 100 || typeof event.message_id !== 'string' || event.message_id.length > 128 || typeof message?.text !== 'string' ||
      message.text.length > 2000 || event.source_broadcaster_user_id && event.source_broadcaster_user_id !== channel.id)) return denied();
    if (!primary && (!ID.test(event.target_user_id ?? '') || subscription.type === 'channel.chat.message_delete' && (typeof event.message_id !== 'string' || event.message_id.length > 128))) return denied();
    if (primary && event.chatter_user_id === this.env.EDGE_BOT_USER_ID) return new Response(null, { status: 204 });
    if (this.ctx.storage.sql.exec('SELECT id FROM twitch_inbox WHERE id = ?', signature.id).toArray().length) return new Response(null, { status: 204 });
    const count = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM twitch_inbox').toArray()[0]!.count;
    const pending = this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM twitch_inbox WHERE delivered = 0').toArray()[0]!.count;
    if (count >= CONTROL_LIMITS.dedupe || pending >= CONTROL_LIMITS.inbox) return json({ error: 'Chat delivery is busy. Retry shortly.' }, 503);
    const badges = Array.isArray(event.badges) ? event.badges.slice(0, 64).flatMap((b: unknown) => { const v = object(b); return typeof v?.set_id === 'string' && v.set_id.length <= 40 ? [v.set_id] : []; }) : [];
    const normalized: TwitchChatEvent = { eventId: signature.id, channelId: channel.id, at: Date.parse(signature.timestamp),
      kind: primary ? 'message' : subscription.type === 'channel.chat.message_delete' ? 'delete' : 'clear-user',
      messageId: event.message_id, userId: primary ? event.chatter_user_id : event.target_user_id,
      ...(primary ? { name: event.chatter_user_name.slice(0, 40), text: message!.text, badges } : {}) };
    // Persist before delivery. Room deduplication makes a retry after eviction safe.
    this.ctx.storage.sql.exec('INSERT INTO twitch_inbox (id,expires_at,next_at,payload) VALUES (?,?,?,?)', signature.id,
      Math.max(Date.now(), normalized.at) + CONTROL_LIMITS.webhookMs, Date.now(), JSON.stringify(normalized));
    await this.schedule(); await this.deliver(normalized);
    return new Response(null, { status: 204 });
  }
  private async deliver(event: TwitchChatEvent): Promise<void> {
    try {
      const channel = this.data.channels[event.channelId];
      if (!this.allowed(channel) || channel.chatWanted === false) { this.ctx.storage.sql.exec('DELETE FROM twitch_inbox WHERE id = ?', event.eventId); return; }
      const response = await this.roomStub(event.channelId).fetch('https://room.internal/internal/twitch-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
      if (!response.ok) throw new Error('room_delivery_failed');
      this.ctx.storage.sql.exec('UPDATE twitch_inbox SET delivered = 1, payload = NULL WHERE id = ?', event.eventId);
    } catch {
      const row = this.ctx.storage.sql.exec<{ attempts: number }>('SELECT attempts FROM twitch_inbox WHERE id = ?', event.eventId).toArray()[0];
      const attempts = (row?.attempts ?? 0) + 1;
      this.ctx.storage.sql.exec('UPDATE twitch_inbox SET attempts = ?, next_at = ? WHERE id = ?', attempts, Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)), event.eventId);
    }
    await this.schedule();
  }
  private async roomEvent(input: RoomAnnouncement): Promise<Response> {
    if (typeof input.eventId !== 'string' || input.eventId.length > 160 || !object(input.safeView) || !object(input.event)) return json({ error: 'Invalid event.' }, 400);
    const key = `room:${input.channelId}:${input.eventId}`;
    if (this.data.dedupe[key]) return json({ ok: true });
    if (Object.keys(this.data.dedupe).length >= 512) return json({ error: 'Announcement queue is busy.' }, 503);
    // Never let even an accidentally supplied viewer projection feed the bot.
    const view = structuredClone(input.safeView) as GameView;
    if (view.round) { delete view.round.target; delete view.round.forbiddenClues; delete view.round.artUrl; delete view.round.example; delete view.round.ink; }
    view.history = view.history.map(({ word: _word, ...rest }) => rest);
    if (view.result && !['caught', 'escaped'].includes(view.result.outcome)) delete view.result.word;
    let announcement = null;
    if (!view.settings.chatBot) this.data.queue = this.data.queue.filter((q) => q.channelId !== input.channelId);
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
    this.data.dedupe[key] = Date.now() + CONTROL_LIMITS.webhookMs;
    const channel = this.data.channels[input.channelId]!; const bot = this.botStatus(channel);
    if (announcement && channel.chatWanted !== false && bot.configured && bot.authorized && bot.channelAllowed) {
      const text = announcement.text.trim();
      if (text && text.length <= 500) {
        this.data.queue = this.data.queue.filter((q) => !(q.channelId === input.channelId && q.key === announcement.key));
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
    const now = Date.now(); this.prune(now);
    if (!this.data.bot || this.data.bot.user.id !== this.env.EDGE_BOT_USER_ID || this.data.pausedUntil > now || this.data.sentAt.length >= this.botBudget()) return;
    // Round announcements win over help/score chatter when the shared bot is busy.
    this.data.queue.sort((a, b) => Number(a.key === 'command') - Number(b.key === 'command'));
    const index = this.data.queue.findIndex((q) => now - (this.data.channelSentAt[q.channelId] ?? 0) >= 1100 && this.data.channels[q.channelId]?.scopes.includes('channel:bot'));
    if (index < 0) return;
    const [item] = this.data.queue.splice(index, 1); if (!item) return;
    // Reserve globally and remove durably before the network request. Ambiguous failures
    // are not resent: at-most-once posting is safer than duplicate chat announcements.
    this.data.sentAt.push(now); this.data.channelSentAt[item.channelId] = now; await this.persist();
    let status: 'sent' | 'failed' | 'dropped' = 'failed';
    try {
      const response = await this.helix('chat/messages', { method: 'POST', body: JSON.stringify({ broadcaster_id: item.channelId, sender_id: this.data.bot.user.id, message: item.text }) }, false);
      if (response.status === 429) {
        const reset = Number(response.headers.get('ratelimit-reset')) * 1000;
        this.data.pausedUntil = now + Math.max(30_000, Math.min(5 * 60_000, Number.isFinite(reset) ? reset - now : 30_000));
      } else if (response.status === 401) { this.data.appToken = undefined; this.data.pausedUntil = now + 30_000; }
      else if (response.ok) { const body = object(await response.json()); status = body && Array.isArray(body.data) && body.data[0]?.is_sent === true ? 'sent' : 'dropped'; }
    } catch { /* No message bodies, access tokens or provider responses enter logs. */ }
    this.data.receipts.push({ id: item.id, channelId: item.channelId, at: now, status }); await this.persist();
  }
  private async validateCredential(channel: RegisteredChannel | null): Promise<void> {
    const bot = this.data.bot;
    if (!channel && !bot) return;
    const id = channel ? `channel:${channel.id}` : `bot:${bot!.user.id}`;
    const encrypted = channel?.credentials ?? bot!.credentials;
    try {
      let credentials = await decryptValue<Credentials>(encrypted, this.env.EDGE_TOKEN_ENCRYPTION_KEY_B64, id);
      if (credentials.expiresAt < Date.now() + 5 * 60_000) {
        const token = await this.tokenCall({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken });
        if (typeof token.refresh_token !== 'string') throw new Error('token_revoked');
        credentials = { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000 };
        // Save rotated refresh credentials before validation or another outbound request.
        if (channel) channel.credentials = await this.seal(credentials, id); else bot!.credentials = await this.seal(credentials, id);
        await this.persist();
      }
      const validated = await this.validateToken(credentials.accessToken, channel ? BROADCASTER_SCOPES : BOT_SCOPES);
      if (validated.userId !== credentials.id || validated.login !== credentials.login) throw new Error('token_revoked');
      credentials = { ...credentials, scopes: validated.scopes, validatedAt: Date.now() };
      if (channel) { channel.credentials = await this.seal(credentials, id); channel.validatedAt = credentials.validatedAt; channel.scopes = credentials.scopes; }
      else { bot!.credentials = await this.seal(credentials, id); bot!.validatedAt = credentials.validatedAt; }
    } catch (error) {
      if (error instanceof Error && error.message === 'token_revoked') {
        if (channel) {
          channel.active = false; channel.subscriptionStatus = 'revoked';
          for (const [sessionId, session] of Object.entries(this.data.sessions)) if (session.channelId === channel.id) delete this.data.sessions[sessionId];
          await this.roomControl(channel.id, { type: 'connection', status: 'disconnected', detail: 'Twitch authorization changed. Connect again.', login: channel.login }).catch(() => {});
        } else { delete this.data.bot; this.data.queue = []; }
      } else this.data.nextValidationAt = Math.min(this.data.nextValidationAt || Infinity, Date.now() + 5 * 60_000);
    }
    await this.persist();
  }
  async alarm(): Promise<void> {
    await this.serial(async () => {
      if (!this.configured()) { await this.ctx.storage.deleteAlarm(); return; }
      this.prune();
      for (const c of Object.values(this.data.channels)) if (this.allowed(c) && c.chatWanted !== false && c.lastStudioAt &&
        c.lastStudioAt + studioIdleMilliseconds(this.env) <= Date.now()) await this.stopChat(c, 'Studio has been inactive. Connect Twitch chat when you return.');
      const stopping = Object.values(this.data.channels).find((c) => c.pendingDeletion?.length && (c.deleteRetryAt ?? 0) <= Date.now());
      if (stopping) await this.deleteSubscriptions(stopping);
      const pending = this.ctx.storage.sql.exec<{ payload: string }>('SELECT payload FROM twitch_inbox WHERE delivered = 0 AND next_at <= ? ORDER BY next_at LIMIT 8', Date.now()).toArray();
      for (const row of pending) await this.deliver(JSON.parse(row.payload) as TwitchChatEvent);
      const channel = Object.values(this.data.channels).find((c) => this.needsSubscription(c) && (c.subscriptionRetryAt ?? 0) <= Date.now());
      if (channel) await this.subscribe(channel);
      if (this.data.nextValidationAt && this.data.nextValidationAt <= Date.now()) {
        this.data.nextValidationAt = Date.now() + CONTROL_LIMITS.validationMs; await this.persist();
        for (const c of Object.values(this.data.channels).filter((c) => this.allowed(c))) await this.validateCredential(c);
        if (this.data.bot) await this.validateCredential(null);
      }
      await this.sendOne(); await this.persist();
    });
  }
}
