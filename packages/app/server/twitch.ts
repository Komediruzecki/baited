import WebSocket from 'ws';
import { z } from 'zod';
import type { Config } from './config.js';
import { Store, type Credentials } from './store.js';
import type { Game } from './game.js';

export const SCOPES = ['user:read:chat'];
/** The bot account's own consent: post chat messages and appear as a bot. */
export const BOT_SCOPES = ['user:write:chat', 'user:bot'];
/** Optional broadcaster consent that lets the bot account speak in this channel with the Chat Bot badge. */
export const CHANNEL_BOT_SCOPE = 'channel:bot';
/** Vault key for the bot account, kept apart from broadcaster credentials keyed by user ID. */
export const botKey = (id: string) => `bot:${id}`;
const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.array(z.string()),
});
const validationSchema = z.object({
  client_id: z.string(),
  user_id: z.string(),
  login: z.string(),
  expires_in: z.number(),
  scopes: z.array(z.string()),
});
export class TwitchAuth {
  private refreshing = new Map<string, Promise<Credentials>>();
  private generations = new Map<string, number>();
  constructor(
    private config: Config,
    private store: Store,
    private fetcher: typeof fetch = fetch,
  ) {}
  generation(id: string) { return this.generations.get(id) ?? 0; }
  isCurrent(id: string, generation: number) { return this.generation(id) === generation; }
  private assertCurrent(id: string, generation: number) {
    if (!this.isCurrent(id, generation)) throw new AuthSuperseded();
  }
  private async scoped<T>(id: string, task: (generation: number) => Promise<T>) {
    const generation = this.generation(id);
    try {
      const result = await task(generation);
      this.assertCurrent(id, generation);
      return result;
    } catch (error) {
      this.assertCurrent(id, generation);
      if (error instanceof AuthRevoked) error.generation = generation;
      throw error;
    }
  }
  private async token(params: Record<string, string>) {
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...params,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      if (params.grant_type === 'refresh_token' && [400, 401].includes(response.status))
        throw new AuthRevoked();
      throw new TwitchHttpError('Twitch authorization failed. Reconnect your account.', 'token', response.status);
    }
    return tokenSchema.parse(await response.json());
  }
  async exchange(code: string, kind: 'broadcaster' | 'bot' = 'broadcaster') {
    // An authorization begun before a disconnect must not recreate that account.
    const generations = new Map(this.generations);
    const token = await this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.callback,
    });
    const valid = await this.validateAccess(token.access_token, kind === 'bot' ? BOT_SCOPES : SCOPES);
    const response = await this.fetcher('https://api.twitch.tv/helix/users', {
      headers: { 'Client-Id': this.config.clientId, Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new TwitchHttpError('Could not identify Twitch account.', 'users', response.status);
    const users = z
      .object({
        data: z
          .array(z.object({ id: z.string(), login: z.string(), display_name: z.string() }))
          .min(1),
      })
      .parse(await response.json());
    const user = users.data[0];
    if (user.id !== valid.user_id) throw new IdentityMismatch();
    // Only the configured bot account may be stored as the bot. Anyone else's grant is discarded.
    if (kind === 'bot' && user.id !== this.config.botUserId) {
      await this.revokeToken(token.access_token);
      throw new BotAccountMismatch(user.id, this.config.botUserId);
    }
    // The bot account signing in as a streamer would get a room of its own. Refuse it before
    // anything is stored, unless this server runs the bot on the streamer's own account.
    if (kind === 'broadcaster' && this.config.botUserId && user.id === this.config.botUserId && !this.config.botIsStreamer) {
      await this.revokeToken(token.access_token);
      throw new BotAsStreamer(user.id);
    }
    const key = kind === 'bot' ? botKey(user.id) : user.id;
    // What this account had granted before, read before the new grant replaces it.
    let previousScope: string[] = [];
    try {
      previousScope = this.store.credentials(key)?.scope ?? [];
    } catch {
      previousScope = [];
    }
    const c: Credentials = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      userId: user.id,
      login: user.login,
      name: user.display_name,
      scope: valid.scopes,
    };
    if ((this.generations.get(key) ?? 0) !== (generations.get(key) ?? 0)) {
      await this.revokeToken(c.access_token);
      throw new AuthSuperseded();
    }
    const generation = this.bump(key);
    try {
      await this.store.setCredentials(key, c);
    } catch (error) {
      throw new StoreFailed(error);
    }
    this.assertCurrent(key, generation);
    return { ...c, previousScope };
  }
  async validateAccess(access: string, required = SCOPES) {
    const r = await this.fetcher('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${access}` },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 401) throw new AuthRevoked();
    if (!r.ok) throw new TwitchHttpError('Twitch validation temporarily unavailable.', 'validate', r.status);
    const data = validationSchema.parse(await r.json());
    if (data.client_id !== this.config.clientId) throw new AuthRevoked();
    if (!required.every((s) => data.scopes.includes(s))) throw new ScopeMissing();
    return data;
  }
  async access(id: string, force = false): Promise<Credentials> {
    const c = this.store.credentials(id);
    if (!c) throw new AuthRevoked(this.generation(id));
    if (!force && c.expiresAt > Date.now() + 60000) return c;
    const existing = this.refreshing.get(id);
    if (existing) return existing;
    const promise = this.scoped(id, async (generation) => {
      const t = await this.token({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
      const next = {
        ...c,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        scope: t.scope,
      };
      if ((this.generations.get(id) ?? 0) !== generation || !this.store.credentials(id)) {
        await this.revokeToken(next.access_token);
        throw new AuthSuperseded();
      }
      await this.store.setCredentials(id, next);
      return next;
    });
    this.refreshing.set(id, promise);
    try {
      return await promise;
    } finally {
      if (this.refreshing.get(id) === promise) this.refreshing.delete(id);
    }
  }
  async validate(id: string) {
    return this.scoped(id, async (generation) => {
      const c = await this.access(id);
      this.assertCurrent(id, generation);
      const v = await this.validateAccess(
        c.access_token,
        id.startsWith('bot:') ? BOT_SCOPES : SCOPES,
      );
      if (v.user_id !== c.userId) throw new AuthRevoked(generation);
      return c;
    });
  }
  async api(id: string, path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    return this.scoped(id, async (generation) => {
      const c = await this.access(id);
      this.assertCurrent(id, generation);
      const r = await this.fetcher(`https://api.twitch.tv/helix/${path}`, {
        ...init,
        headers: {
          ...init.headers,
          'Client-Id': this.config.clientId,
          Authorization: `Bearer ${c.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      });
      this.assertCurrent(id, generation);
      if (r.status === 401 && !retried) {
        await this.access(id, true);
        this.assertCurrent(id, generation);
        return this.api(id, path, init, true);
      }
      if (r.status === 401) throw new AuthRevoked(generation);
      if (r.status === 429) {
        const reset = Number(r.headers.get('Ratelimit-Reset'));
        throw new RateLimited(Math.max(1000, Math.min(60000, reset * 1000 - Date.now() || 10000)));
      }
      if (!r.ok)
        throw new Error(`Twitch request failed (${r.status}). Check authorization and reconnect.`);
      return r;
    });
  }
  private bump(id: string) {
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    this.refreshing.delete(id);
    return generation;
  }
  invalidate(id: string) {
    this.bump(id);
    // Store deletion is synchronous in memory; its persistence promise is awaited by callers.
    return this.store.deleteCredentials(id);
  }
  private async revokeToken(token: string) {
    await this.fetcher('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.config.clientId, token }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
  async revoke(id: string) {
    const c = this.store.credentials(id);
    const invalidation = this.invalidate(id);
    const generation = this.generation(id);
    await invalidation;
    if (c) await this.revokeToken(c.access_token);
    return generation;
  }
}
export class AuthSuperseded extends Error {
  constructor() { super('Twitch authorization changed. Reload your studio.'); }
}
export class AuthRevoked extends Error {
  constructor(public generation?: number) {
    super('Twitch authorization expired or was revoked. Connect again.');
  }
}
export class RateLimited extends Error {
  constructor(public delay: number) {
    super('Twitch rate limit reached. Retrying shortly.');
  }
}
export class BotAccountMismatch extends Error {
  /** Numeric Twitch user IDs: the account that signed in, and the configured bot account. */
  constructor(
    public received = '',
    public expected = '',
  ) {
    super('That Twitch account is not the configured bot account.');
  }
}
/** The configured bot account tried the streamer sign-in on a server where it is not a streamer. */
export class BotAsStreamer extends Error {
  /** Numeric Twitch user ID of the account that signed in. */
  constructor(public received = '') {
    super("That is the chat bot's Twitch account, not a streamer's.");
  }
}
/** The token lacks a scope this flow needs. Treated as a revoked authorization by callers. */
export class ScopeMissing extends AuthRevoked {}
/** Twitch answered one step of an authorization with an HTTP error. */
export class TwitchHttpError extends Error {
  constructor(
    message: string,
    public step: 'token' | 'validate' | 'users',
    public status: number,
  ) {
    super(message);
  }
}
export class IdentityMismatch extends Error {
  constructor() {
    super('Twitch identity mismatch.');
  }
}
export class StoreFailed extends Error {
  constructor(public reason: unknown) {
    super('The Twitch authorization could not be saved.');
  }
}

const envelope = z.object({
  metadata: z.object({
    message_id: z.string(),
    message_type: z.string(),
    message_timestamp: z.string(),
    subscription_type: z.string().optional(),
  }),
  payload: z.record(z.string(), z.unknown()),
});
const chatEvent = z.object({
  broadcaster_user_id: z.string(),
  chatter_user_id: z.string(),
  chatter_user_name: z.string(),
  message_id: z.string(),
  message: z.object({ text: z.string().max(2000) }),
  badges: z.array(z.object({ set_id: z.string().max(64) })).max(64).optional(),
  // Set during a Shared Chat session; another channel's ID means the message was sent there.
  source_broadcaster_user_id: z.string().nullish(),
});
/**
 * Moderator actions the game follows: one deleted message, and every message from a chatter
 * who was banned or timed out. Like chat itself they need only `user:read:chat`.
 */
const MESSAGE_DELETE = 'channel.chat.message_delete',
  CLEAR_USER = 'channel.chat.clear_user_messages';
const moderationEvent = z.object({
  broadcaster_user_id: z.string(),
  target_user_id: z.string(),
  message_id: z.string().optional(),
});
/** A validated chat message, handed to chat commands after the game has seen it. */
export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  badges: string[];
  at: number;
}
export type SocketFactory = (url: string) => WebSocket;
export class TwitchConnection {
  /** Receives every accepted message, in any phase. Errors never interrupt chat delivery. */
  onMessage: ((message: ChatMessage) => void) | undefined;
  /** The bot's own messages arrive here too. They are neither hints nor commands. */
  ignoreUserId = '';
  private sockets = new Set<WebSocket>();
  private current: WebSocket | undefined;
  private stopped = true;
  private authorizationGeneration: number | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private seen = new Map<string, number>();
  private watchdogs = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  constructor(
    private game: Game,
    private auth: TwitchAuth,
    private invalid: (generation?: number) => void,
    private socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}
  start() {
    this.stop();
    this.stopped = false;
    this.authorizationGeneration = this.auth.generation?.(this.game.data.owner);
    this.status('connecting', 'Opening Twitch chat');
    this.open('wss://eventsub.wss.twitch.tv/ws', false);
  }
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.retry = undefined;
    for (const t of this.watchdogs.values()) clearTimeout(t);
    this.watchdogs.clear();
    for (const s of this.sockets) s.close();
    this.sockets.clear();
    this.current = undefined;
  }
  private status(status: Game['connection']['status'], detail: string) {
    this.game.connection = { status, detail };
    this.game.onChange();
  }
  private open(url: string, migrating: boolean) {
    if (this.stopped) return;
    const socket = this.socketFactory(url);
    this.sockets.add(socket);
    let welcomed = false,
      timeout = 15000;
    const watch = () => {
      clearTimeout(this.watchdogs.get(socket));
      this.watchdogs.set(
        socket,
        setTimeout(() => socket.terminate(), timeout),
      );
    };
    watch();
    socket.on('message', async (data) => {
      if (this.stopped) return;
      try {
        const parsed = envelope.safeParse(JSON.parse(data.toString()));
        if (!parsed.success) return;
        const { metadata: m, payload: p } = parsed.data;
        watch();
        if (m.message_type === 'session_welcome') {
          const session = z
            .object({ id: z.string(), keepalive_timeout_seconds: z.number().nullable() })
            .parse(p.session);
          welcomed = true;
          timeout = ((session.keepalive_timeout_seconds ?? 10) + 5) * 1000;
          watch();
          if (!migrating) await this.subscribe('channel.chat.message', session.id);
          if (this.stopped || socket.readyState !== WebSocket.OPEN) return;
          const old = this.current;
          this.current = socket;
          if (migrating && old && old !== socket) old.close();
          this.attempts = 0;
          this.status('connected', 'Live chat connected');
          // Optional: chat works without them, so a refusal leaves the connection alone.
          if (!migrating)
            for (const type of [MESSAGE_DELETE, CLEAR_USER])
              this.subscribe(type, session.id).catch(() => {});
        } else if (m.message_type === 'session_reconnect') {
          const s = z.object({ reconnect_url: z.string().url() }).parse(p.session);
          const u = new URL(s.reconnect_url);
          if (u.protocol !== 'wss:' || u.hostname !== 'eventsub.wss.twitch.tv')
            throw new Error('Invalid Twitch reconnect host.');
          this.status('reconnecting', 'Moving Twitch connection');
          this.open(s.reconnect_url, true);
        } else if (m.message_type === 'revocation') {
          this.stop();
          this.status('error', 'Twitch authorization revoked. Reconnect your account.');
          this.invalid(this.authorizationGeneration);
        } else if (m.message_type === 'notification') this.acceptNotification(parsed.data);
      } catch (e) {
        // An older connection may finish an awaited subscription after stop/reconnect.
        if (this.stopped) return;
        if (e instanceof AuthSuperseded) { this.stop(); return; }
        if (e instanceof AuthRevoked) {
          this.stop();
          this.status('error', e.message);
          this.invalid(e.generation ?? this.authorizationGeneration);
        } else {
          this.status(
            'reconnecting',
            e instanceof RateLimited ? e.message : 'Twitch connection interrupted. Retrying…',
          );
          this.schedule(e instanceof RateLimited ? e.delay : undefined);
          socket.terminate();
        }
      }
    });
    socket.on('error', () => {
      /* close handles bounded recovery; never log tokens or event bodies */
    });
    socket.on('close', () => {
      clearTimeout(this.watchdogs.get(socket));
      this.watchdogs.delete(socket);
      this.sockets.delete(socket);
      if (this.stopped) return;
      if (
        this.current === socket ||
        !welcomed ||
        !this.current ||
        this.current.readyState !== WebSocket.OPEN
      ) {
        this.schedule();
      }
    });
  }
  private subscribe(type: string, sessionId: string) {
    return this.auth.api(this.game.data.owner, 'eventsub/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        type,
        version: '1',
        condition: { broadcaster_user_id: this.game.data.owner, user_id: this.game.data.owner },
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });
  }
  private remember(id: string, now: number) {
    this.seen.set(id, now);
    if (this.seen.size > 10000)
      for (const [seenId, t] of this.seen) if (now - t > 60000) this.seen.delete(seenId);
  }
  acceptNotification(input: unknown) {
    const parsed = envelope.safeParse(input);
    if (!parsed.success) return false;
    const { metadata: m, payload: p } = parsed.data,
      at = Date.parse(m.message_timestamp),
      now = Date.now();
    if (
      m.message_type !== 'notification' ||
      !Number.isFinite(at) ||
      now - at > 15000 ||
      at > now + 2000 ||
      this.seen.has(m.message_id)
    )
      return false;
    if (m.subscription_type === MESSAGE_DELETE || m.subscription_type === CLEAR_USER)
      return this.acceptModeration(m.subscription_type, m.message_id, p.event, now);
    if (m.subscription_type !== 'channel.chat.message') return false;
    const event = chatEvent.safeParse(p.event);
    if (
      !event.success ||
      event.data.broadcaster_user_id !== this.game.data.owner ||
      (event.data.source_broadcaster_user_id != null &&
        event.data.source_broadcaster_user_id !== this.game.data.owner)
    )
      return false;
    this.remember(m.message_id, now);
    const e = event.data;
    // A streamer who uses their own account as the bot still needs their own commands.
    if (
      this.ignoreUserId &&
      e.chatter_user_id === this.ignoreUserId &&
      e.chatter_user_id !== this.game.data.owner
    )
      return false;
    const accepted = this.game.chat(
      e.message_id,
      e.chatter_user_id,
      e.chatter_user_name,
      e.message.text,
      at,
    );
    try {
      this.onMessage?.({
        id: e.message_id,
        userId: e.chatter_user_id,
        name: e.chatter_user_name,
        text: e.message.text,
        badges: (e.badges ?? []).map((badge) => badge.set_id),
        at,
      });
    } catch {
      /* A failing command must not look like a broken chat connection. */
    }
    return accepted;
  }
  /**
   * Twitch's EventSub reference gives channel.chat.message a message_id plus a separate
   * source_message_id for a Shared Chat copy. channel.chat.message_delete and
   * channel.chat.clear_user_messages carry no Shared Chat source field, and the reference does
   * not say whether a partner channel's moderation reaches this channel's subscription.
   * Only messages sent in this channel become hints, so the worst case is a partner channel's
   * ban or delete removing a hint (and, during the 10-minute review, its award). That is
   * accepted.
   */
  private acceptModeration(
    type: typeof MESSAGE_DELETE | typeof CLEAR_USER,
    id: string,
    input: unknown,
    now: number,
  ) {
    const event = moderationEvent.safeParse(input);
    if (!event.success || event.data.broadcaster_user_id !== this.game.data.owner) return false;
    const { target_user_id: userId, message_id: messageId } = event.data;
    if (type === MESSAGE_DELETE && !messageId) return false;
    this.remember(id, now);
    return type === MESSAGE_DELETE
      ? this.game.dropMessage(messageId!, userId)
      : this.game.dropChatter(userId);
  }
  private schedule(delay?: number) {
    if (this.stopped || this.retry) return;
    this.status('reconnecting', 'Chat disconnected. Recovering automatically…');
    this.retry = setTimeout(
      () => {
        this.retry = undefined;
        for (const s of this.sockets) s.terminate();
        this.sockets.clear();
        this.current = undefined;
        this.open('wss://eventsub.wss.twitch.tv/ws', false);
      },
      delay ?? Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 500,
    );
  }
}
