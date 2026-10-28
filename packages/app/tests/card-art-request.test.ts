import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadCardArt, listCardArt, deleteCardArt } from '../client/card-art-request.js';

test('image requests bind original and final uploads with CSRF and preserve failure text for retry', async (t) => {
  const calls: { path: string; init: RequestInit }[] = [];
  let status = 201;
  const previous = globalThis.fetch;
  globalThis.fetch = (async (path: string, init: RequestInit = {}) => {
    calls.push({ path, init });
    return new Response(JSON.stringify(status === 201 ? { art: { id: 'approved' } } : { error: 'Choose a different image.' }), { status });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = previous; });
  const original = new Blob(['fixture'], { type: 'image/jpeg' });
  await uploadCardArt(original, 'fixture-csrf', 'source', 'upload');
  await uploadCardArt(new Blob(['pixels'], { type: 'image/png' }), 'fixture-csrf', 'card', 'pixel', 'source-id');
  assert.equal(calls[0].init.body, original);
  assert.equal(new Headers(calls[0].init.headers).get('x-art-purpose'), 'source');
  assert.equal(new Headers(calls[1].init.headers).get('x-art-source-id'), 'source-id');
  assert.equal(new Headers(calls[1].init.headers).get('x-csrf-token'), 'fixture-csrf');
  assert.equal(calls[1].init.credentials, 'same-origin');
  await listCardArt(); await deleteCardArt('image-id', 'fixture-csrf');
  assert.equal(calls.at(-1)?.init.method, 'DELETE');
  status = 422;
  await assert.rejects(uploadCardArt(original, 'fixture-csrf'), /Choose a different image/);
  const before = calls.length;
  await assert.rejects(uploadCardArt(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'fixture-csrf'), /PNG, JPEG or WebP/);
  await assert.rejects(uploadCardArt(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'fixture-csrf'), /5 MB/);
  assert.equal(calls.length, before);
  globalThis.fetch = async () => { throw new DOMException("deadline", "TimeoutError"); };
  await assert.rejects(uploadCardArt(original, "fixture-csrf"), /took too long/);
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(listCardArt(), /Check your connection/);
});
