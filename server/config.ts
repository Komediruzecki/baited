import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { z } from 'zod';
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Trust only named proxy addresses/subnets, never arbitrary forwarded headers or hop counts.
  const trustedProxies = (env.TRUSTED_PROXIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const proxy of trustedProxies) {
    const [address, prefix, extra] = proxy.split('/');
    const version = isIP(address);
    if (!version || extra !== undefined || (prefix !== undefined &&
      (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128))))
      throw new Error('TRUSTED_PROXIES must contain explicit IP addresses or non-global CIDR ranges.');
  }
  const production = env.NODE_ENV === 'production';
  const origin = (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw new Error('PUBLIC_URL must be an origin without a path or credentials.');
  if (production && url.protocol !== 'https:')
    throw new Error('Production requires an HTTPS PUBLIC_URL.');
  const key = env.TOKEN_ENCRYPTION_KEY || '';
  if (key && !/^[a-f0-9]{64}$/i.test(key))
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  const clientId = env.TWITCH_CLIENT_ID || '',
    clientSecret = env.TWITCH_CLIENT_SECRET || '';
  const port = z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .parse(env.PORT ?? 3000);
  return {
    production,
    trustedProxies,
    origin,
    port,
    host: env.HOST || '127.0.0.1',
    demo: !production && env.ENABLE_DEMO !== 'false',
    key,
    clientId,
    clientSecret,
    twitchReady: !!(key && clientId && clientSecret),
    speechKey: env.DEEPGRAM_API_KEY || '',
    dataDir: resolve(env.DATA_DIR || 'data'),
    callback: `${origin}/auth/twitch/callback`,
  };
}
export type Config = ReturnType<typeof loadConfig>;
