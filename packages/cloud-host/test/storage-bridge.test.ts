import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { storageBridge } from '../src/storage-bridge.ts';

function fixture() {
  const objects = new Map<string, { bytes: Uint8Array; etag: string; customMetadata: Record<string, string> }>();
  const bucket = {
    async get(key: string) {
      const value = objects.get(key);
      return value && { ...value, size: value.bytes.length, httpEtag: `"${value.etag}"`, body: value.bytes };
    },
    async put(key: string, bytes: Uint8Array, options: R2PutOptions) {
      const old = objects.get(key);
      const condition = options.onlyIf as R2Conditional;
      if (condition.etagMatches && condition.etagMatches !== old?.etag) return null;
      if (condition.etagDoesNotMatch === '*' && old) return null;
      const etag = createHash('sha256').update(bytes).digest('hex');
      const value = { bytes, etag, customMetadata: options.customMetadata ?? {} };
      objects.set(key, value);
      return { httpEtag: `"${etag}"` };
    },
  } as unknown as R2Bucket;
  const request = (key: string, method = 'GET', body?: string | Uint8Array, headers: Record<string, string> = {}, authorized = true) =>
    storageBridge(new Request(`http://baited.storage/${key}`, { method, body, headers }), bucket, authorized);
  return { objects, request };
}
const art = 'art/123e4567-e89b-42d3-a456-426614174000.png';

test('private bridge rejects foreign containers and unknown paths', async () => {
  const { request, objects } = fixture();
  assert.equal((await request('state/bait.json', 'GET', undefined, {}, false)).status, 403);
  assert.equal((await request('state/other.json')).status, 404);
  assert.equal((await request('state/bait.json?dump=1')).status, 400);
  assert.equal((await request('state/bait.json', 'POST')).status, 405);
  assert.equal(objects.size, 0);
});

test('restart readback and concurrent stale writers use conditional writes', async () => {
  const { request } = fixture();
  assert.equal((await request('state/card-library.json')).status, 404);
  assert.equal((await request('state/card-library.json', 'PUT', '{}')).status, 428);
  const first = await request('state/card-library.json', 'PUT', '{"revision":1}', { 'If-None-Match': '*' });
  assert.equal(first.status, 200);
  const saved = await request('state/card-library.json');
  assert.equal(await saved.text(), '{"revision":1}');
  assert.equal(saved.headers.get('ETag'), first.headers.get('ETag'));
  const etag = saved.headers.get('ETag')!;
  assert.equal((await request('state/card-library.json', 'PUT', '{"revision":2}', { 'If-Match': etag })).status, 200);
  assert.equal((await request('state/card-library.json', 'PUT', '{"revision":3}', { 'If-Match': etag })).status, 412);
  assert.equal((await request('state/card-library.json', 'PUT', '{}', { 'If-None-Match': '*' })).status, 412);
  assert.equal(await (await request('state/card-library.json')).text(), '{"revision":2}');
});

test('art deletion uses a conditional zero-byte tombstone, not a racing head/delete', async () => {
  const { request, objects } = fixture();
  const first = await request(art, 'PUT', 'private image bytes', { 'If-None-Match': '*' });
  const etag = first.headers.get('ETag')!;
  assert.equal((await request(art, 'DELETE')).status, 428);
  assert.equal((await request(art, 'DELETE', undefined, { 'If-Match': '"stale"' })).status, 412);
  const removed = await request(art, 'DELETE', undefined, { 'If-Match': etag });
  assert.equal(removed.status, 200);
  const gone = await request(art);
  assert.equal(gone.status, 404);
  assert.equal(gone.headers.get('ETag'), removed.headers.get('ETag'));
  assert.equal(objects.get(`v1/${art}`)!.bytes.length, 0);
  assert.equal((await request(art, 'PUT', 'old process', { 'If-Match': etag })).status, 412);
  assert.equal((await request(art, 'PUT', 'new image', { 'If-Match': gone.headers.get('ETag')! })).status, 200);
});

test('oversize uploads and invalid mutation conditions cannot change saved objects', async () => {
  const { request, objects } = fixture();
  assert.equal((await request(art, 'PUT', new Uint8Array(2 * 1024 * 1024 + 1), { 'If-None-Match': '*' })).status, 413);
  assert.equal((await request(art, 'PUT', 'x', { 'If-None-Match': '*', 'If-Match': '"old"' })).status, 428);
  assert.equal((await request('state/bait.json', 'DELETE', undefined, { 'If-Match': '"old"' })).status, 405);
  assert.equal(objects.size, 0);
});

test('a tombstone for a missing PNG prevents a delayed create from reviving private bytes', async () => {
  const { request, objects } = fixture();
  assert.equal((await request(art)).status, 404);
  assert.equal((await request(art, 'DELETE', undefined, { 'If-None-Match': '*' })).status, 200);
  assert.equal((await request(art, 'PUT', 'delayed upload', { 'If-None-Match': '*' })).status, 412);
  assert.equal((await request(art)).status, 404);
  assert.equal(objects.get(`v1/${art}`)!.bytes.length, 0);
});

test('storage errors expose no provider data', async () => {
  const bucket = { get: async () => { throw new Error('private provider diagnostic'); } } as unknown as R2Bucket;
  const response = await storageBridge(new Request('http://baited.storage/state/bait.json'), bucket, true);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '');
});
