import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise the production gateway with local, deterministic binding failures.
// No Twitch or Cloudflare account is contacted and no Durable Object is created remotely.
const source = `
import gateway from './src/index.ts';
export default { async fetch(request) {
  const url = new URL(request.url);
  const env = {
    EDGE_PILOT_ENABLED: 'true', EDGE_ALLOWED_HOSTS: url.host,
    EDGE_CHANNEL_LOGIN_ALLOWLIST: 'fixture_channel',
    PILOT_INGRESS_LIMITER: { limit: async () => ({ success: true }) },
    PILOT_OAUTH_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async (asset) => {
      if (request.headers.get('x-fixture-outage') === '1') throw new Error('private asset details');
      return new URL(asset.url).pathname === '/index.html'
        ? new Response('<h1>Studio fixture</h1>', { headers: { 'content-type': 'text/html' } })
        : new Response('Raw asset miss', { status: 404 });
    } },
    CONTROL: { idFromName: () => 'fixture', get: () => ({ fetch: async () =>
      new Response(JSON.stringify({ error: 'private provider details' }), { status: 503,
        headers: { 'content-type': 'application/json', 'set-cookie': 'pending=; Max-Age=0; HttpOnly' } })
    }) },
  };
  return gateway.fetch(request, env);
} };
`;

test('pilot gateway brands navigation errors, preserves API JSON, and safely recovers OAuth', { timeout: 20_000 }, async () => {
  const result = await build({ stdin: { contents: source, resolveDir: new URL('..', import.meta.url).pathname, sourcefile: 'error-gateway-fixture.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers'], logLevel: 'silent' });
  const runtime = new Miniflare(convertV4MiniflareOptions({ name: 'error-gateway-fixture', modules: true, script: result.outputFiles[0]!.text,
    host: '127.0.0.1', port: 0, compatibilityDate: '2026-09-07', cf: false, cacheAPI: false,
    telemetry: { enabled: false }, unsafeRegisterWorker: false, unsafeLocalExplorer: false, unsafeObservability: false,
    outboundService: async () => { throw new Error('Error-page checks must not make external network requests.'); },
  } as any));
  try {
    const origin = (await runtime.ready).origin;
    const get = (path: string, extra: Record<string, string> = {}, method = 'GET') => runtime.dispatchFetch(origin + path, {
      method, headers: { accept: 'text/html', 'cf-connecting-ip': '127.0.0.1', ...extra },
    });
    const studio = await get('/studio');
    assert.equal(studio.status, 200);
    assert.equal(await studio.text(), '<h1>Studio fixture</h1>');
    for (const path of ['/mistyped', '/studio/mistyped']) {
      const missing = await get(path);
      assert.equal(missing.status, 404);
      assert.match(await missing.text(), /That link was a decoy/);
    }
    const unavailable = await get('/studio', { 'x-fixture-outage': '1' });
    assert.equal(unavailable.status, 503);
    const html = await unavailable.text();
    assert.match(html, /A little out of fuel/);
    assert.doesNotMatch(html, /private asset details/);
    const head = await get('/studio', { 'x-fixture-outage': '1' }, 'HEAD');
    assert.equal(head.status, 503);
    assert.equal(await head.text(), '');
    const callback = await get('/auth/twitch/callback?code=private-code');
    assert.equal(callback.status, 503);
    assert.match(callback.headers.get('set-cookie')!, /Max-Age=0/);
    const auth = await callback.text();
    assert.match(auth, /start a fresh connection/);
    assert.doesNotMatch(auth, /private-code|private provider details/);
    const api = await get('/api/session');
    assert.equal(api.status, 503);
    assert.deepEqual(await api.json(), { error: 'private provider details' });
    const missingApi = await get('/api/missing');
    assert.equal(missingApi.status, 404);
    assert.deepEqual(await missingApi.json(), { error: 'Not found.' });
  } finally { await runtime.dispose(); }
});
