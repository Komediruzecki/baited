import WebSocket from 'ws';
import { z } from 'zod';
import type { Config } from './config.js';
import { Store, type Credentials } from './store.js';
import type { Game } from './game.js';

export const SCOPES = ['user:read:chat'];
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
  constructor(
    private config: Config,
    private store: Store,
    private fetcher: typeof fetch = fetch,
  ) {}
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
      throw new Error('Twitch authorization failed. Reconnect your account.');
    }
    return tokenSchema.parse(await response.json());
  }
  async exchange(code: string) {
    const token = await this.token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.callback,
    });
    const valid = await this.validateAccess(token.access_token);
    const response = await this.fetcher('https://api.twitch.tv/helix/users', {
      headers: { 'Client-Id': this.config.clientId, Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('Could not identify Twitch account.');
    const users = z
      .object({
        data: z
          .array(z.object({ id: z.string(), login: z.string(), display_name: z.string() }))
          .min(1),
      })
      .parse(await response.json());
    const user = users.data[0];
    if (user.id !== valid.user_id) throw new Error('Twitch identity mismatch.');
    const c: Credentials = {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      userId: user.id,
      login: user.login,
      name: user.display_name,
      scope: valid.scopes,
    };
    await this.store.setCredentials(c.userId, c);
    return c;
  }
  async validateAccess(access: string) {
    const r = await this.fetcher('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${access}` },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 401) throw new AuthRevoked();
    if (!r.ok) throw new Error('Twitch validation temporarily unavailable.');
    const data = validationSchema.parse(await r.json());
    if (data.client_id !== this.config.clientId || !SCOPES.every((s) => data.scopes.includes(s)))
      throw new AuthRevoked();
    return data;
  }
  async access(id: string, force = false): Promise<Credentials> {
    const c = this.store.credentials(id);
    if (!c) throw new AuthRevoked();
    if (!force && c.expiresAt > Date.now() + 60000) return c;
    const existing = this.refreshing.get(id);
    if (existing) return existing;
    const promise = (async () => {
      const t = await this.token({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
      const next = {
        ...c,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        scope: t.scope,
      };
      await this.store.setCredentials(id, next);
      return next;
    })();
    this.refreshing.set(id, promise);
    try {
      return await promise;
    } finally {
      this.refreshing.delete(id);
    }
  }
  async validate(id: string) {
    const c = await this.access(id);
    const v = await this.validateAccess(c.access_token);
    if (v.user_id !== id) throw new AuthRevoked();
    return c;
  }
  async api(id: string, path: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const c = await this.access(id);
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
    if (r.status === 401 && !retried) {
      await this.access(id, true);
      return this.api(id, path, init, true);
    }
    if (r.status === 401) throw new AuthRevoked();
    if (r.status === 429) {
      const reset = Number(r.headers.get('Ratelimit-Reset'));
      throw new RateLimited(Math.max(1000, Math.min(60000, reset * 1000 - Date.now() || 10000)));
    }
    if (!r.ok)
      throw new Error(`Twitch request failed (${r.status}). Check authorization and reconnect.`);
    return r;
  }
  async revoke(id: string) {
    const c = this.store.credentials(id);
    if (c) {
      await this.fetcher('https://id.twitch.tv/oauth2/revoke', {
        method: 'POST',
        body: new URLSearchParams({ client_id: this.config.clientId, token: c.access_token }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    }
    await this.store.deleteCredentials(id);
  }
}
export class AuthRevoked extends Error {
  constructor() {
    super('Twitch authorization expired or was revoked. Connect again.');
  }
}
export class RateLimited extends Error {
  constructor(public delay: number) {
    super('Twitch rate limit reached. Retrying shortly.');
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
});
type SocketFactory = (url: string) => WebSocket;
export class TwitchConnection {
  private sockets = new Set<WebSocket>();
  private current: WebSocket | undefined;
  private stopped = true;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private seen = new Map<string, number>();
  private watchdogs = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  constructor(
    private game: Game,
    private auth: TwitchAuth,
    private invalid: () => void,
    private socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}
  start() {
    this.stop();
    this.stopped = false;
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
          if (!migrating)
            await this.auth.api(this.game.data.owner, 'eventsub/subscriptions', {
              method: 'POST',
              body: JSON.stringify({
                type: 'channel.chat.message',
                version: '1',
                condition: {
                  broadcaster_user_id: this.game.data.owner,
                  user_id: this.game.data.owner,
                },
                transport: { method: 'websocket', session_id: session.id },
              }),
            });
          if (this.stopped || socket.readyState !== WebSocket.OPEN) return;
          const old = this.current;
          this.current = socket;
          if (migrating && old && old !== socket) old.close();
          this.attempts = 0;
          this.status('connected', 'Live chat connected');
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
          this.invalid();
        } else if (m.message_type === 'notification') this.acceptNotification(parsed.data);
      } catch (e) {
        if (e instanceof AuthRevoked) {
          this.stop();
          this.status('error', e.message);
          this.invalid();
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
  acceptNotification(input: unknown) {
    const parsed = envelope.safeParse(input);
    if (!parsed.success) return false;
    const { metadata: m, payload: p } = parsed.data,
      at = Date.parse(m.message_timestamp),
      now = Date.now();
    if (
      m.message_type !== 'notification' ||
      m.subscription_type !== 'channel.chat.message' ||
      !Number.isFinite(at) ||
      now - at > 15000 ||
      at > now + 2000 ||
      this.seen.has(m.message_id)
    )
      return false;
    const event = chatEvent.safeParse(p.event);
    if (!event.success || event.data.broadcaster_user_id !== this.game.data.owner) return false;
    this.seen.set(m.message_id, now);
    if (this.seen.size > 10000)
      for (const [id, t] of this.seen) if (now - t > 60000) this.seen.delete(id);
    const e = event.data;
    return this.game.chat(e.message_id, e.chatter_user_id, e.chatter_user_name, e.message.text, at);
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
