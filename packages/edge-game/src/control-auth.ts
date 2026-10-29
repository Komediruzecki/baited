import type { ControlEnv, EncryptedValue } from './control-types.js';
import { CONTROL_LIMITS, DEFAULT_CHANNEL_LOGINS } from './control-types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const SESSION_COOKIE = '__Host-baited_session';
export const OAUTH_COOKIE = '__Secure-baited_oauth';
export const PILOT_ISSUER = 'baited-edge-pilot';
export const PILOT_AUDIENCE = 'baited-edge';
export function base64url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeBase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoded value.');
  const output = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (s) => s.charCodeAt(0));
  if (base64url(output) !== value) throw new Error('Invalid encoded value.');
  return output;
}
export function secretBytes(value?: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Missing control key.');
  const bytes = Uint8Array.from(atob(value), (s) => s.charCodeAt(0));
  if (bytes.length !== 32 || btoa(String.fromCharCode(...bytes)) !== value) throw new Error('Control keys must contain 32 random bytes.');
  return bytes;
}
export function randomToken(bytes = 32): string { return base64url(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function sha256(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export function sameText(a: string, b: string): boolean {
  const aa = encoder.encode(a); const bb = encoder.encode(b);
  let difference = aa.length ^ bb.length;
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) difference |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return difference === 0;
}
export function publicOrigin(env: ControlEnv): string {
  const url = new URL(env.EDGE_PUBLIC_ORIGIN ?? 'invalid:');
  if (url.protocol !== 'https:' || url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Configure one HTTPS public origin.');
  }
  return url.origin;
}
export function allowedLogins(env: ControlEnv): Set<string> {
  const values = (env.EDGE_CHANNEL_LOGIN_ALLOWLIST ?? DEFAULT_CHANNEL_LOGINS.join(',')).split(',').map((v) => v.trim().toLowerCase());
  if (!values.length || values.length > 100 || values.some((v) => !/^[a-z0-9_]{1,25}$/.test(v))) throw new Error('Invalid channel allowlist.');
  return new Set(values);
}
export function maximumChannels(env: ControlEnv): number {
  const n = Number(env.EDGE_MAX_CHANNELS ?? 3);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error('Pilot channel limit must be from 1 to 10.');
  return n;
}
export function studioIdleMilliseconds(env: ControlEnv): number {
  const minutes = Number(env.EDGE_STUDIO_IDLE_MINUTES ?? 15);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) throw new Error('Studio idle timeout must be from 5 to 60 minutes.');
  return minutes * 60_000;
}
export function cookieValue(request: Request, key: string): string | null {
  const items = (request.headers.get('cookie') ?? '').split(';').map((s) => s.trim()).filter((s) => s.startsWith(`${key}=`));
  if (items.length !== 1) return null;
  const value = items[0]!.slice(key.length + 1);
  return /^[A-Za-z0-9_-]{20,128}$/.test(value) ? value : null;
}
export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function oauthCookie(value: string, maxAge: number): string {
  return `${OAUTH_COOKIE}=${value}; Path=/auth/twitch/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function sameOrigin(request: Request, origin: string): boolean {
  return request.headers.get('origin') === origin && !['cross-site', 'none'].includes(request.headers.get('sec-fetch-site') ?? '');
}
export async function encryptValue(value: unknown, secret: string | undefined, context: string): Promise<EncryptedValue> {
  const key = await crypto.subtle.importKey('raw', secretBytes(secret), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`baited-control-v1:${context}`) }, key, encoder.encode(JSON.stringify(value)));
  return { version: 1, iv: base64url(iv), ciphertext: base64url(new Uint8Array(ciphertext)) };
}
export async function decryptValue<T>(value: EncryptedValue, secret: string | undefined, context: string): Promise<T> {
  if (value.version !== 1) throw new Error('Unknown credential envelope.');
  const key = await crypto.subtle.importKey('raw', secretBytes(secret), 'AES-GCM', false, ['decrypt']);
  const iv = decodeBase64url(value.iv);
  if (iv.length !== 12) throw new Error('Invalid credential envelope.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`baited-control-v1:${context}`) }, key, decodeBase64url(value.ciphertext));
  return JSON.parse(decoder.decode(plain)) as T;
}
export async function signPilotCapability(env: ControlEnv, input: { channelId: string; sessionId: string; role: 'studio' | 'overlay' }, now = Date.now()): Promise<{ token: string; tokenExpiresAt: number }> {
  const iat = Math.floor(now / 1000); const exp = iat + CONTROL_LIMITS.capabilitySeconds;
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64url(encoder.encode(JSON.stringify({ iss: PILOT_ISSUER, aud: PILOT_AUDIENCE, sub: `${input.role}:${input.channelId}`, sid: input.sessionId,
    channel_id: input.channelId, role: input.role, iat, exp, jti: randomToken(16) })));
  const key = await crypto.subtle.importKey('raw', secretBytes(env.EDGE_PILOT_SECRET_B64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return { token: `${header}.${body}.${base64url(new Uint8Array(signature))}`, tokenExpiresAt: exp * 1000 };
}
export async function verifyWebhook(request: Request, body: string, secret: string | undefined, now = Date.now()): Promise<{ id: string; timestamp: string; type: string } | null> {
  if (!secret || secret.length < 32 || secret.length > 100) return null;
  const id = request.headers.get('Twitch-Eventsub-Message-Id') ?? '';
  const timestamp = request.headers.get('Twitch-Eventsub-Message-Timestamp') ?? '';
  const type = request.headers.get('Twitch-Eventsub-Message-Type') ?? '';
  const signature = request.headers.get('Twitch-Eventsub-Message-Signature') ?? '';
  const at = Date.parse(timestamp);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isFinite(at) || now - at > CONTROL_LIMITS.webhookMs || at - now > 60_000 ||
    !['notification', 'webhook_callback_verification', 'revocation'].includes(type) || !/^sha256=[a-f0-9]{64}$/.test(signature)) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const computed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(id + timestamp + body)));
  const hex = [...computed].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sameText(signature, `sha256=${hex}`) ? { id, timestamp, type } : null;
}
