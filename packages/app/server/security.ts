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
export class Limiter {
  private entries = new Map<string, { count: number; until: number }>();
  hit(key: string, limit: number, window = 60_000) {
    const now = Date.now();
    if (this.entries.size > 10000) {
      for (const [k, v] of this.entries) if (v.until < now) this.entries.delete(k);
      if (this.entries.size > 10000) return false;
    }
    let entry = this.entries.get(key);
    if (!entry || entry.until < now) {
      entry = { count: 0, until: now + window };
      this.entries.set(key, entry);
    }
    return ++entry.count <= limit;
  }
}
export function checkOrigin(req: Request, origin: string) {
  return req.headers.origin === origin;
}
