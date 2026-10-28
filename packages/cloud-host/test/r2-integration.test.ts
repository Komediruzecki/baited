import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';

// Use Wrangler's pinned emulator so these conditions run against its real R2 binding.
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve('wrangler/package.json'))('miniflare');
const compiled = buildSync({
  stdin: { contents: `import { storageBridge } from './src/storage-bridge.ts';
    export default { fetch(request, env) { return storageBridge(request, env.STATE, true); } };`,
    resolveDir: new URL('..', import.meta.url).pathname },
  bundle: true, format: 'esm', platform: 'neutral', write: false,
}).outputFiles[0].text;

test('R2 emulator honors create-only writes, stale ETags and conditional tombstones', { timeout: 30_000 }, async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: compiled, compatibilityDate: '2026-09-07', r2Buckets: ['STATE'] }));
  try {
    const url = 'http://baited.storage/art/123e4567-e89b-42d3-a456-426614174000.png';
    const create = await mf.dispatchFetch(url, { method: 'PUT', body: 'original', headers: { 'If-None-Match': '*' } });
    assert.equal(create.status, 200);
    const etag = create.headers.get('etag');
    assert.ok(etag);
    assert.equal((await mf.dispatchFetch(url, { method: 'PUT', body: 'duplicate', headers: { 'If-None-Match': '*' } })).status, 412);
    assert.equal((await mf.dispatchFetch(url, { method: 'PUT', body: 'stale', headers: { 'If-Match': '"wrong"' } })).status, 412);
    assert.equal(await (await mf.dispatchFetch(url)).text(), 'original');
    const deleted = await mf.dispatchFetch(url, { method: 'DELETE', headers: { 'If-Match': etag } });
    assert.equal(deleted.status, 200);
    const gone = await mf.dispatchFetch(url);
    assert.equal(gone.status, 404);
    assert.equal(gone.headers.get('etag'), deleted.headers.get('etag'));
    assert.equal((await mf.dispatchFetch(url, { method: 'PUT', body: 'resurrect stale', headers: { 'If-Match': etag } })).status, 412);
    const pendingUrl = 'http://baited.storage/art/123e4567-e89b-42d3-a456-426614174001.png';
    assert.equal((await mf.dispatchFetch(pendingUrl, { method: 'DELETE', headers: { 'If-None-Match': '*' } })).status, 200);
    assert.equal((await mf.dispatchFetch(pendingUrl, { method: 'PUT', body: 'late private image', headers: { 'If-None-Match': '*' } })).status, 412);
    assert.equal((await mf.dispatchFetch(pendingUrl)).status, 404);
  } finally { await mf.dispose(); }
});
