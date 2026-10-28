import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { z } from 'zod';
import { extensionKey } from './extension.js';

export function isPrivateIPv4(address: string | undefined) {
  if (!address || isIP(address) !== 4) return false;
  const [first, second] = address.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

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
  const extensionClientId = env.TWITCH_EXTENSION_CLIENT_ID || '';
  const extensionSecret = env.TWITCH_EXTENSION_SECRET || '';
  // The one Twitch account allowed to post as the chat bot. Its own OAuth consent is separate.
  const botUserId = env.TWITCH_BOT_USER_ID || '';
  if (botUserId && !/^[1-9]\d{0,19}$/.test(botUserId))
    throw new Error('TWITCH_BOT_USER_ID must be the numeric Twitch user ID of the bot account.');
  // A streamer may run the bot on their own account. Otherwise the bot account cannot sign in as a streamer.
  const botIsStreamer = env.TWITCH_BOT_IS_STREAMER === '1';
  const host = env.HOST || '127.0.0.1';
  const previewLanHost = env.LOCAL_PREVIEW_HOST || null;
  if (previewLanHost && (
    production || !isPrivateIPv4(previewLanHost) || host !== previewLanHost ||
    url.hostname !== previewLanHost || !['http:', 'https:'].includes(url.protocol) ||
    key || clientId || clientSecret || extensionClientId || extensionSecret ||
    env.DEEPGRAM_API_KEY || trustedProxies.length
  )) throw new Error('LOCAL_PREVIEW_HOST requires a private IPv4 bind and matching PUBLIC_URL, development mode, and no credentials or trusted proxies.');
  const validExtensionId = /^[a-z0-9]{1,64}$/.test(extensionClientId);
  const extensionOrigins = (env.EXTENSION_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const allowed of extensionOrigins) {
    let parsed: URL;
    try { parsed = new URL(allowed); }
    catch { throw new Error('EXTENSION_ALLOWED_ORIGINS must contain explicit origins.'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.origin !== allowed || parsed.username || parsed.password ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback && !production)))
      throw new Error('EXTENSION_ALLOWED_ORIGINS requires HTTPS origins, or development HTTP loopback origins.');
  }
  if (validExtensionId) extensionOrigins.push(`https://${extensionClientId}.ext-twitch.tv`);
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
    host,
    previewLanHost,
    demo: !production && env.ENABLE_DEMO !== 'false',
    key,
    clientId,
    clientSecret,
    twitchReady: !!(key && clientId && clientSecret),
    botUserId,
    botIsStreamer,
    botReady: !!(key && clientId && clientSecret && botUserId),
    extensionClientId,
    extensionSecret,
    extensionOrigins: [...new Set(extensionOrigins)],
    extensionReady: validExtensionId && !!extensionKey(extensionSecret),
    speechKey: env.DEEPGRAM_API_KEY || '',
    speechProvider: z.enum(['moonshine', 'deepgram']).parse(env.SPEECH_PROVIDER || 'moonshine'),
    dataDir: resolve(env.DATA_DIR || 'data'),
    callback: `${origin}/auth/twitch/callback`,
  };
}
export type Config = ReturnType<typeof loadConfig>;
