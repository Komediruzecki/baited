import { sha256, verifyWebhook } from './control-auth.js';
import { CONTROL_LIMITS } from './control-types.js';
import { json, readBounded } from './protocol.js';

export interface IngressEnv {
  EDGE_PILOT_ENABLED?: string;
  TWITCH_EVENTSUB_SECRET?: string;
  PILOT_INGRESS_LIMITER?: RateLimit;
  PILOT_OAUTH_LIMITER?: RateLimit;
}
export type IngressDecision = { request: Request } | { response: Response };
const unavailable = () => ({ response: json({ error: 'The pilot is temporarily unavailable. Try again shortly.' }, 503) });
function throttled(): IngressDecision {
  const response = json({ error: 'Too many requests. Wait a minute and try again.' }, 429);
  response.headers.set('retry-after', '60'); return { response };
}

/** Approximate per-Cloudflare-location protection, not a global or billing cap.
 * Only Cloudflare's ingress header identifies the network. Never trust arbitrary
 * forwarded IP headers, retain a raw IP in app storage, or write it to logs.
 */
export async function pilotIngress(request: Request, env: IngressEnv): Promise<IngressDecision> {
  if (env.EDGE_PILOT_ENABLED !== 'true') return { request };
  const path = new URL(request.url).pathname;
  if (!/^\/(?:api|auth|v1)(?:\/|$)/.test(path)) return { request };

  // Twitch delivery addresses are shared by many channels. Verify before the DO
  // hop instead of applying browser/IP quotas to authentic provider traffic.
  if (path === '/api/twitch/eventsub') {
    if (request.method !== 'POST') return { response: json({ error: 'Method not allowed.' }, 405) };
    if (!env.TWITCH_EVENTSUB_SECRET) return unavailable();
    if (!/^sha256=[a-f0-9]{64}$/.test(request.headers.get('twitch-eventsub-message-signature') ?? '')) return { response: json({ error: 'Access denied.' }, 403) };
    let body: string;
    try { body = await readBounded(request, CONTROL_LIMITS.bodyBytes); }
    catch { return { response: json({ error: 'Request too large or unreadable.' }, 413) }; }
    if (!await verifyWebhook(request, body, env.TWITCH_EVENTSUB_SECRET)) return { response: json({ error: 'Access denied.' }, 403) };
    return { request: new Request(request, { body }) };
  }

  if (!env.PILOT_INGRESS_LIMITER || !env.PILOT_OAUTH_LIMITER) return unavailable();
  const address = request.headers.get('cf-connecting-ip');
  // Cloudflare supplies a single IPv4/IPv6 literal. Missing ingress attribution
  // fails closed; local tests must explicitly supply a fixture header.
  if (!address || address.length > 45 || !/^[0-9a-fA-F:.]+$/.test(address)) return unavailable();
  const key = `ip-v1:${await sha256(address.toLowerCase())}`;
  try {
    if (!(await env.PILOT_INGRESS_LIMITER.limit({ key })).success) return throttled();
    const oauth = path === '/auth/twitch' || path === '/auth/twitch/bot' || path === '/api/bot/authorize';
    if (oauth && !(await env.PILOT_OAUTH_LIMITER.limit({ key })).success) return throttled();
    return { request };
  } catch { return unavailable(); }
}
