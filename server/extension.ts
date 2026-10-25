import { Router } from 'express';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import { Limiter } from './security.js';
import type { Config } from './config.js';
import type { Game } from './game.js';
import type { Response } from 'express';
import {
  EXTENSION_VERSION,
  type ExtensionState,
  type ExtensionConfiguration,
  type ExtensionErrorCode,
} from '../shared/extension.js';

const claimsSchema = z.object({
  channel_id: z.string().regex(/^[1-9]\d{0,19}$/),
  exp: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  role: z.enum(['viewer', 'moderator', 'broadcaster']),
  opaque_user_id: z.string().regex(/^[UA][A-Za-z0-9_-]{1,128}$/),
  user_id: z.string().regex(/^[1-9]\d{0,19}$/).optional(),
});
export type ExtensionClaims = z.infer<typeof claimsSchema>;

/** Twitch supplies a standard-base64 shared key, not the OAuth client secret. */
export function extensionKey(secret: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(secret))
    return null;
  const key = Buffer.from(secret, 'base64');
  if (key.length < 32 || key.length > 128 || key.toString('base64') !== secret) return null;
  return key;
}

export async function verifyExtensionToken(token: string, key: Uint8Array): Promise<ExtensionClaims> {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error('Invalid Extension authorization.');
  const { payload, protectedHeader } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    requiredClaims: ['exp', 'channel_id', 'role', 'opaque_user_id'],
    clockTolerance: 0,
  });
  if (protectedHeader.typ !== undefined && protectedHeader.typ !== 'JWT')
    throw new Error('Invalid Extension authorization.');
  const claims = claimsSchema.parse(payload);
  // Twitch fixes the broadcaster's opaque ID to U + channel ID, without requiring identity link.
  if (claims.role === 'broadcaster' && (claims.opaque_user_id !== `U${claims.channel_id}` ||
      (claims.user_id !== undefined && claims.user_id !== claims.channel_id)))
    throw new Error('Invalid Extension authorization.');
  return claims;
}

function fail(res: Response, status: number, code: ExtensionErrorCode, error: string) {
  res.status(status).json({ code, error });
}

/** Mount after the existing Host/mutation-origin guard. This router never accepts cookies or writes. */
export function extensionRouter(
  config: Config,
  rooms: ReadonlyMap<string, Game>,
  hasAuthorization: (channelId: string) => boolean,
) {
  const router = Router();
  const origins = new Set(config.extensionOrigins);
  const limiter = new Limiter();
  const key = extensionKey(config.extensionSecret);

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.vary('Origin');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) {
      fail(res, 403, 'extension_origin', 'This Extension origin is not allowed.');
      return;
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      res.status(405).json({ error: 'This Extension endpoint is read-only.' });
      return;
    }
    if (req.method === 'OPTIONS') {
      const method = req.headers['access-control-request-method'];
      const headers = String(req.headers['access-control-request-headers'] || '')
        .split(',').map((header) => header.trim().toLowerCase()).filter(Boolean);
      if (!origin || method !== 'GET' || headers.some((header) => header !== 'authorization')) {
        fail(res, 403, 'extension_origin', 'This Extension request is not allowed.');
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization');
      res.setHeader('Access-Control-Max-Age', '300');
      res.status(204).end();
      return;
    }
    next();
  });

  router.use(async (req, res, next) => {
    if (!config.extensionReady || !key) {
      fail(res, 503, 'extension_unavailable', 'The Extension connection is not configured yet.');
      return;
    }
    if (!limiter.hit(`ip:${req.ip}`, 600)) {
      fail(res, 429, 'extension_rate_limit', 'Too many Extension requests. Try again shortly.');
      return;
    }
    const authorization = req.headers.authorization || '';
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
    try {
      if (!match || Object.keys(req.query).length) throw new Error('Invalid Extension request.');
      const claims = await verifyExtensionToken(match[1], key);
      if (!limiter.hit(`viewer:${claims.channel_id}:${claims.opaque_user_id}`, 180)) {
        fail(res, 429, 'extension_rate_limit', 'Too many Extension requests. Try again shortly.');
        return;
      }
      res.locals.extension = claims;
      next();
    } catch {
      res.setHeader('WWW-Authenticate', 'Bearer');
      fail(res, 401, 'extension_authorization', 'Twitch authorization expired or changed. Reopen the Extension.');
    }
  });

  const channelGame = (channelId: string) =>
    [...rooms.values()].find((game) => game.data.mode === 'twitch' && game.data.owner === channelId);

  router.get('/state', (_req, res) => {
    const claims = res.locals.extension as ExtensionClaims;
    const game = channelGame(claims.channel_id);
    const state: ExtensionState = {
      version: EXTENSION_VERSION,
      configured: !!game,
      room: game ? game.view(claims.role === 'broadcaster' ? 'studio' : 'viewer') : null,
    };
    res.json(state);
  });

  router.get('/config', (_req, res) => {
    const claims = res.locals.extension as ExtensionClaims;
    if (claims.role !== 'broadcaster') {
      fail(res, 403, 'extension_role', 'Only the channel owner can configure baited.');
      return;
    }
    const game = channelGame(claims.channel_id);
    const state: ExtensionConfiguration = {
      version: EXTENSION_VERSION,
      connected: !!game && hasAuthorization(claims.channel_id),
      channelId: claims.channel_id,
      channelName: game?.data.channel || null,
      studioUrl: `${config.origin}/studio`,
    };
    res.json(state);
  });

  return router;
}
