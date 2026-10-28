import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
export interface Session {
  id: string;
  csrf: string;
  userId: string;
  name: string;
  mode: 'demo' | 'twitch';
  roomId: string;
  expiresAt: number;
}
export const randomKey = () => randomBytes(24).toString('base64url');
export const isLoopback = (addr: string | undefined) =>
  !!addr && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
export function cookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries(
    (header || '').split(';').flatMap((c) => {
      const p = c.indexOf('=');
      return p < 0 ? [] : [[c.slice(0, p).trim(), c.slice(p + 1).trim()]];
    }),
  );
}
export function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export class Sessions {
  entries = new Map<string, Session>();
  constructor(private secure: boolean) {}
  get(header: string | undefined) {
    const id = cookies(header).bait_session;
    const s = id ? this.entries.get(id) : undefined;
    if (s && s.expiresAt > Date.now()) return s;
    if (s) this.entries.delete(s.id);
  }
  create(res: Response, user: Omit<Session, 'id' | 'csrf' | 'expiresAt'>) {
    const s = {
      ...user,
      id: randomKey(),
      csrf: randomKey(),
      expiresAt: Date.now() + 12 * 3600_000,
    };
    this.entries.set(s.id, s);
    res.cookie('bait_session', s.id, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      maxAge: 12 * 3600_000,
      path: '/',
    });
    return s;
  }
  clear(res: Response, id?: string) {
    if (id) this.entries.delete(id);
    res.clearCookie('bait_session', {
      path: '/',
      secure: this.secure,
      sameSite: 'lax',
      httpOnly: true,
    });
  }
  deleteUser(userId: string) {
    for (const [id, s] of this.entries) if (s.userId === userId) this.entries.delete(id);
  }
  prune() {
    for (const [id, s] of this.entries) if (s.expiresAt <= Date.now()) this.entries.delete(id);
  }
}
export interface LimiterOptions {
  /** Length of each key's counting window, in milliseconds. */
  window?: number;
  /** Keys per generation. The table never holds more than twice this. */
  maxKeys?: number;
  now?: () => number;
}
/**
 * A fixed-window count per key, kept in two generations. Every window the newer
 * generation becomes the older one, and the older one is dropped: all of its windows
 * have ended by then. A key that is hit again moves into the newer generation with its
 * count. When the newer generation is full it turns early, so keys that were not hit
 * since the last turn start over. That can give an idle key a fresh allowance early,
 * but a new key is never refused because the table is full, and a key that keeps
 * hitting keeps its count through any flood of new keys.
 */
export class Limiter {
  private current = new Map<string, { count: number; until: number }>();
  private previous = new Map<string, { count: number; until: number }>();
  private readonly window: number;
  private readonly maxKeys: number;
  private readonly now: () => number;
  private turnAt: number;
  // Measured on Node 25: both generations full at the default hold 15 MB.
  constructor({ window = 60_000, maxKeys = 50_000, now = () => performance.now() }: LimiterOptions = {}) {
    this.window = window;
    this.maxKeys = maxKeys;
    this.now = now;
    this.turnAt = now() + window;
  }
  get size() {
    return this.current.size + this.previous.size;
  }
  private turn(now: number) {
    // Every window in the newer generation started before turnAt, so after two quiet
    // windows they have all ended as well.
    this.previous = now >= this.turnAt + this.window ? new Map() : this.current;
    this.current = new Map();
    this.turnAt = now + this.window;
  }
  hit(key: string, limit: number) {
    const now = this.now();
    if (now >= this.turnAt) this.turn(now);
    let entry = this.current.get(key);
    if (!entry) {
      entry = this.previous.get(key);
      this.previous.delete(key);
      if (!entry || entry.until <= now) entry = { count: 0, until: now + this.window };
      if (this.current.size >= this.maxKeys) this.turn(now);
      this.current.set(key, entry);
    }
    return ++entry.count <= limit;
  }
}
export function checkOrigin(req: Request, origin: string) {
  return req.headers.origin === origin;
}
