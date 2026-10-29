/** Browser auth only. There is deliberately no HTTP token minting endpoint. */
export interface AuthEnv {
  EDGE_POC_ENABLED?: string;
  EDGE_ALLOWED_HOSTS?: string;
  EDGE_ALLOWED_ORIGINS?: string;
  EDGE_ALLOWED_CHANNELS?: string;
  TWITCH_EXTENSION_SECRET_B64?: string;
  EDGE_LOCAL_FIXTURE_AUTH?: string;
  EDGE_FIXTURE_SECRET_B64?: string;
  EDGE_STAGING_AUTH?: string;
  EDGE_STAGING_SECRET_B64?: string;
}

export const LOCAL_FIXTURE_ISSUER = 'baited-local-fixture';
export const LOCAL_FIXTURE_AUDIENCE = 'baited-edge-local';
export const STAGING_CAPABILITY_ISSUER = 'baited-edge-staging';
export const STAGING_CAPABILITY_AUDIENCE = 'baited-edge-poc';
export const MAX_FIXTURE_TTL_SECONDS = 300;
export const AUTH_PROTOCOL = 'baited.v1';
const AUTH_PREFIX = 'baited.auth.';
const MAX_TOKEN_BYTES = 4096;

export interface AuthIdentity {
  authKind: 'twitch-extension' | 'local-fixture' | 'staging-capability';
  channelId: string;
  subject: string;
  role: 'viewer' | 'studio' | 'overlay';
  stableIdentity: boolean;
  /** Extension broadcaster identity alone never authorizes POC control writes. */
  canControl: boolean;
  expiresAt: number;
  /** Twitch has no room generation claim; the room binds its current generation. */
  generation: number | null;
}

export type AuthResult =
  | { ok: true; identity: AuthIdentity; protocol?: typeof AUTH_PROTOCOL }
  | { ok: false; response: Response };

type Claims = Record<string, unknown>;

function denied(status: 401 | 403 | 503): AuthResult {
  const message = status === 503 ? 'Service unavailable.' : status === 403 ? 'Access denied.' : 'Sign in to continue.';
  return {
    ok: false,
    response: Response.json({ error: message }, {
      status,
      headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    }),
  };
}

function configuredValues(value: string | undefined): string[] {
  return value?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
}

function isLoopback(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

function record(value: unknown): value is Claims {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function numericDate(value: unknown): value is number {
  return integer(value) && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1000);
}

function base64Bytes(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function urlBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid token');
  const bytes = base64Bytes(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  // Disallow alternate encodings with non-zero padding bits.
  const canonical = btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (canonical !== value) throw new Error('Invalid token');
  return bytes;
}

function decodeJson(value: string): Claims {
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(urlBytes(value)));
  if (!record(parsed)) throw new Error('Invalid token');
  return parsed;
}

function secretBytes(value: string | undefined): Uint8Array {
  // Twitch supplies standard base64, not the UTF-8 bytes of the displayed key.
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('Auth unavailable');
  const bytes = base64Bytes(value);
  if (bytes.length < 32 || bytes.length > 128 || btoa(String.fromCharCode(...bytes)) !== value) throw new Error('Auth unavailable');
  return bytes;
}

function independentSecret(value: string | undefined, others: (string | undefined)[]): string | undefined {
  // Canonical base64 is required by secretBytes, so equality catches reused keys.
  return value && !others.includes(value) ? value : undefined;
}

async function signatureValid(parts: string[], secret: string | undefined): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', secretBytes(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, urlBytes(parts[2]!) as BufferSource, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
}

function originAllowed(request: Request, env: AuthEnv, missingOriginAllowed: boolean): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return missingOriginAllowed;
  try {
    const url = new URL(origin);
    return url.origin === origin &&
      (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopback(url))) &&
      configuredValues(env.EDGE_ALLOWED_ORIGINS).includes(origin);
  } catch {
    return false;
  }
}

function requestToken(request: Request): { token: string; protocol?: typeof AUTH_PROTOCOL } | null {
  const authorization = request.headers.get('authorization');
  const protocols = request.headers.get('sec-websocket-protocol');
  const isWebSocket = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
  if (isWebSocket) {
    // A single transport avoids credential precedence ambiguity. Never echo auth.
    if (request.method !== 'GET' || authorization !== null || protocols === null) return null;
    const offered = protocols.split(',').map((part) => part.trim());
    if (offered.length !== 2 || new Set(offered).size !== 2 || !offered.includes(AUTH_PROTOCOL)) return null;
    const auth = offered.find((part) => part.startsWith(AUTH_PREFIX));
    if (!auth) return null;
    return { token: auth.slice(AUTH_PREFIX.length), protocol: AUTH_PROTOCOL };
  }
  if (protocols !== null || authorization === null || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization)) return null;
  return { token: authorization.slice('Bearer '.length) };
}

function capabilityIdentity(claims: Claims, authKind: 'local-fixture' | 'staging-capability', audience: string): AuthIdentity | null {
  if (claims.aud !== audience || !numericDate(claims.iat) || !numericDate(claims.exp) ||
      claims.exp <= claims.iat || claims.exp - claims.iat > MAX_FIXTURE_TTL_SECONDS ||
      !integer(claims.generation) || typeof claims.sub !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(claims.sub) || typeof claims.role !== 'string' ||
      !['viewer', 'studio', 'overlay'].includes(claims.role)) return null;
  const role = claims.role as AuthIdentity['role'];
  return {
    authKind, channelId: claims.channel_id as string, subject: claims.sub,
    role, stableIdentity: true, canControl: role === 'studio', expiresAt: claims.exp * 1000,
    generation: claims.generation,
  };
}

function twitchIdentity(claims: Claims): AuthIdentity | null {
  if (claims.iss !== undefined || claims.aud !== undefined ||
      typeof claims.role !== 'string' || !['viewer', 'moderator', 'broadcaster'].includes(claims.role) ||
      typeof claims.opaque_user_id !== 'string' || !/^[UA][A-Za-z0-9_-]{1,127}$/.test(claims.opaque_user_id) ||
      (claims.user_id !== undefined && (typeof claims.user_id !== 'string' || !/^[1-9][0-9]{0,24}$/.test(claims.user_id))) ||
      (claims.is_unlinked !== undefined && typeof claims.is_unlinked !== 'boolean') ||
      (claims.is_unlinked === true && claims.user_id !== undefined)) return null;
  const opaque = claims.opaque_user_id;
  const channel = claims.channel_id as string;
  if (claims.role === 'broadcaster' && (opaque !== `U${channel}` || (claims.user_id !== undefined && claims.user_id !== channel))) return null;
  if (opaque.startsWith('A') && (claims.role !== 'viewer' || claims.user_id !== undefined)) return null;
  // Twitch uses U + channel ID for a broadcaster even in a viewer context.
  const isOwner = claims.role === 'broadcaster' || opaque === `U${channel}` || claims.user_id === channel;
  return {
    authKind: 'twitch-extension', channelId: channel,
    subject: claims.user_id ? `twitch:${claims.user_id}` : `twitch-opaque:${opaque}`,
    role: isOwner ? 'studio' : 'viewer', stableIdentity: opaque.startsWith('U'),
    canControl: false, expiresAt: (claims.exp as number) * 1000, generation: null,
  };
}

/** Validate destination, origin, issuer, signature and channel before room access. */
export async function authenticateRequest(
  request: Request,
  env: AuthEnv,
  channelId: string,
  options: { nowMs?: number } = {},
): Promise<AuthResult> {
  if (env.EDGE_POC_ENABLED !== 'true') return denied(503);
  const nowMs = options.nowMs ?? Date.now();
  const url = new URL(request.url);
  if (!Number.isFinite(nowMs) || nowMs < 0 || !/^[1-9][0-9]{0,24}$/.test(channelId) ||
      !configuredValues(env.EDGE_ALLOWED_CHANNELS).includes(channelId) ||
      !configuredValues(env.EDGE_ALLOWED_HOSTS).includes(url.host) ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) ||
      (request.headers.has('host') && request.headers.get('host') !== url.host)) return denied(403);
  // Auth endpoints have no query contract. This also refuses token query aliases.
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') return denied(401);
  const credential = requestToken(request);
  if (!credential || credential.token.length > MAX_TOKEN_BYTES) return denied(401);
  try {
    const parts = credential.token.split('.');
    if (parts.length !== 3) return denied(401);
    const header = decodeJson(parts[0]!);
    const claims = decodeJson(parts[1]!);
    if (header.alg !== 'HS256' || (header.typ !== undefined && header.typ !== 'JWT') ||
        header.crit !== undefined || header.b64 !== undefined || claims.channel_id !== channelId ||
        !numericDate(claims.exp) || claims.exp * 1000 <= nowMs ||
        (claims.nbf !== undefined && (!numericDate(claims.nbf) || claims.nbf * 1000 > nowMs)) ||
        (claims.iat !== undefined && (!numericDate(claims.iat) || claims.iat * 1000 > nowMs))) return denied(401);
    let identity: AuthIdentity | null;
    let secret: string | undefined;
    if (claims.iss === LOCAL_FIXTURE_ISSUER) {
      if (env.EDGE_LOCAL_FIXTURE_AUTH !== 'true' || !isLoopback(url)) return denied(401);
      if (!originAllowed(request, env, true)) return denied(403);
      secret = independentSecret(env.EDGE_FIXTURE_SECRET_B64, [env.EDGE_STAGING_SECRET_B64, env.TWITCH_EXTENSION_SECRET_B64]);
      identity = capabilityIdentity(claims, 'local-fixture', LOCAL_FIXTURE_AUDIENCE);
    } else if (claims.iss === STAGING_CAPABILITY_ISSUER) {
      if (env.EDGE_STAGING_AUTH !== 'true' || url.protocol !== 'https:') return denied(401);
      if (!originAllowed(request, env, false)) return denied(403);
      secret = independentSecret(env.EDGE_STAGING_SECRET_B64, [env.EDGE_FIXTURE_SECRET_B64, env.TWITCH_EXTENSION_SECRET_B64]);
      identity = capabilityIdentity(claims, 'staging-capability', STAGING_CAPABILITY_AUDIENCE);
    } else {
      if (!originAllowed(request, env, false)) return denied(403);
      secret = independentSecret(env.TWITCH_EXTENSION_SECRET_B64, [env.EDGE_FIXTURE_SECRET_B64, env.EDGE_STAGING_SECRET_B64]);
      identity = twitchIdentity(claims);
    }
    if (!identity || !(await signatureValid(parts, secret))) return denied(401);
    return { ok: true, identity, ...(credential.protocol ? { protocol: credential.protocol } : {}) };
  } catch {
    // Never include token fragments, key values, claims or crypto diagnostics.
    return denied(401);
  }
}

/** Check this again before every outgoing private send, including idle sockets. */
export function identityIsCurrent(identity: AuthIdentity, channelId: string, generation: number, nowMs = Date.now()): boolean {
  return Number.isFinite(nowMs) && nowMs >= 0 && identity.channelId === channelId &&
    Number.isFinite(identity.expiresAt) && identity.expiresAt > nowMs &&
    integer(generation) && (identity.generation === null || identity.generation === generation);
}
