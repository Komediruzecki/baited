import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Keep TwitchControl's production externalFetch implementation intact. The
// outbound fixture receives the native workerd request, including redirect mode.
const source = `
import { TwitchControl } from './src/control.ts';
export class NativeFetchControl extends TwitchControl {
  async fetch(request) {
    try {
      const response = await this.externalFetch('https://provider.fixture/token', {
        method: 'POST',
        headers: { authorization: 'Bearer public-fixture-access', 'x-fixture-case': new URL(request.url).searchParams.get('case') || 'success' },
        body: new URLSearchParams({ client_id: 'public-fixture-client', client_secret: 'public-fixture-not-a-secret', code: 'public-fixture-code' }),
      });
      return Response.json({ ok: true, status: response.status, body: await response.text() });
    } catch (error) {
      return Response.json({ ok: false, name: error.name, message: error.message }, { status: 502 });
    }
  }
}
export default { fetch(request, env) {
  return env.CONTROL.get(env.CONTROL.idFromName('native-fetch-fixture')).fetch(request);
}};
`;

type OutboundRequest = { url: string; method: string; authorization: string | null; contentType: string | null; body: string };

async function fixture(status = 200) {
  const requests: OutboundRequest[] = [];
  const result = await build({ stdin: { contents: source, resolveDir: new URL('..', import.meta.url).pathname,
    sourcefile: 'native-fetch-fixture.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser',
    target: 'es2022', external: ['cloudflare:workers'], logLevel: 'silent' });
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'native-fetch-fixture', modules: true,
    script: result.outputFiles[0]!.text, host: '127.0.0.1', port: 0, compatibilityDate: '2026-09-07', cf: false,
    telemetry: { enabled: false }, unsafeRegisterWorker: false, unsafeLocalExplorer: false, unsafeObservability: false,
    durableObjects: { CONTROL: { className: 'NativeFetchControl', useSQLite: true } }, cacheAPI: false,
    outboundService: async (request: Request) => {
      requests.push({ url: request.url, method: request.method, authorization: request.headers.get('authorization'),
        contentType: request.headers.get('content-type'), body: await request.text() });
      // A followed redirect must be observable and fail the assertion, rather
      // than disappearing into an unrestricted external network request.
      if (request.url !== 'https://provider.fixture/token') return new Response('unexpected redirect target', { status: 500 });
      if (request.headers.get('x-fixture-case') === 'timeout') await new Promise((resolve) => setTimeout(resolve, 6000));
      return status >= 300 && status < 400
        ? new Response(null, { status, headers: { location: 'https://redirected.fixture/credentials' } })
        : Response.json({ fixture: true });
    },
  } as any));
  await mf.ready;
  return { mf, requests, request: (kind = 'success') => mf.dispatchFetch(`https://pilot.test/native-fetch?case=${kind}`, { redirect: 'manual' }) };
}

test('production control fetch supports native workerd POST form and authorization headers', { timeout: 15_000 }, async () => {
  const f = await fixture();
  try {
    const response = await f.request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: 200, body: '{"fixture":true}' });
    assert.equal(f.requests.length, 1);
    const request = f.requests[0]!;
    assert.equal(request.url, 'https://provider.fixture/token');
    assert.equal(request.method, 'POST');
    assert.equal(request.authorization, 'Bearer public-fixture-access');
    assert.match(request.contentType!, /^application\/x-www-form-urlencoded(?:;|$)/);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(request.body)), {
      client_id: 'public-fixture-client', client_secret: 'public-fixture-not-a-secret', code: 'public-fixture-code',
    });
  } finally { await f.mf.dispose(); }
});

for (const status of [301, 302, 303, 307, 308]) {
  test(`production control fetch rejects ${status} without following or forwarding credentials`, { timeout: 15_000 }, async () => {
    const f = await fixture(status);
    try {
      const response = await f.request();
      assert.equal(response.status, 502);
      const result = await response.json() as { ok: boolean; message: string };
      assert.equal(result.ok, false);
      assert.equal(result.message, 'provider_redirect');
      assert.equal(f.requests.length, 1);
      assert.equal(f.requests[0]!.url, 'https://provider.fixture/token');
    } finally { await f.mf.dispose(); }
  });
}

test('production control fetch aborts an unresponsive provider', { timeout: 15_000 }, async () => {
  const f = await fixture();
  try {
    const response = await f.request('timeout');
    assert.equal(response.status, 502);
    const result = await response.json() as { ok: boolean; name: string };
    assert.equal(result.ok, false);
    assert.equal(result.name, 'TimeoutError');
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0]!.url, 'https://provider.fixture/token');
  } finally { await f.mf.dispose(); }
});
