import { sameText } from './control-auth.js';
import type { ControlEnv } from './control-types.js';

/** Dedicated server-to-server credential. Browsers never receive this key. */
export function operatorAuthorized(request: Request, env: ControlEnv): boolean {
  const key = env.EDGE_OPERATOR_KEY;
  if (!key || !/^[A-Za-z0-9_-]{43,128}$/.test(key) || request.headers.has('origin') || request.headers.has('cookie')) return false;
  const url = new URL(request.url);
  if (url.origin !== env.EDGE_PUBLIC_ORIGIN || url.username || url.password || url.hash || url.search ||
    (request.headers.has('host') && request.headers.get('host') !== url.host)) return false;
  return sameText(request.headers.get('authorization') ?? '', `Bearer ${key}`);
}
