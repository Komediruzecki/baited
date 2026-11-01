import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import assetLock from '../scripts/speech-bench/asset-lock.json';
import { createWhisperAssetFetch, validateWhisperAssetManifest } from '../client/speech-bench/asset-fetch';

const origin = 'https://pilot.example.test';
const prefix = '/speech-bench-assets/';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function fixture(respond: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  const requests: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); requests.push(url.pathname);
    assert.equal(url.origin, origin); assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error');
    return url.pathname === prefix + 'manifest.json' ? json(assetLock) : respond(url.pathname, init);
  }) as typeof fetch;
  return { requests, fetcher };
}

test('prepared local files retain exact bytes; off-origin, uploads and unlisted paths never fetch', async () => {
  const notices = await readFile(new URL('../scripts/speech-bench/NOTICES.md', import.meta.url));
  const f = fixture(() => new Response(notices));
  const fetcher = await createWhisperAssetFetch(f.fetcher, origin);
  assert.equal(await (await fetcher(prefix + 'NOTICES.md')).text(), notices.toString());
  const before = f.requests.length;
  for (const [url, init] of [
    ['https://external.test/file', undefined], [prefix + 'NOTICES.md', { method: 'POST', body: 'audio' }],
    [prefix + '../api/session', undefined], [prefix + '.env', undefined], [prefix + 'NOTICES.md?token=x', undefined],
    [prefix + 'chunks/not-listed.bin', undefined],
  ] as const) await assert.rejects(fetcher(url, init));
  assert.equal(f.requests.length, before);
});

test('manifest validation pins model, file set, hashes and bounded deterministic chunk locations', () => {
  validateWhisperAssetManifest(assetLock);
  const decoder = assetLock.files.find((file) => file.bytes > 25 * 1024 * 1024)!;
  const manifest = { ...assetLock, transport: 'chunked-static-v1', files: assetLock.files.map((file) => file !== decoder ? file : {
    ...file, chunks: [0, 1].map((index) => ({ path: `chunks/${file.sha256}-${index}.bin`,
      bytes: Math.min(16 * 1024 * 1024, file.bytes - index * 16 * 1024 * 1024), sha256: 'a'.repeat(64) })),
  }) };
  validateWhisperAssetManifest(manifest);
  for (const change of [
    { ...manifest, revision: 'main' }, { ...manifest, files: [] },
    { ...manifest, files: [...manifest.files, manifest.files[0]] },
    { ...manifest, files: manifest.files.map((file) => file.path !== decoder.path ? file : { ...file, chunks: [{ path: '../private', bytes: Infinity, sha256: 'a'.repeat(64) }] }) },
    { ...manifest, files: manifest.files.map((file) => file.path !== decoder.path ? file : { ...file, sha256: 'b'.repeat(64) }) },
  ]) assert.throws(() => validateWhisperAssetManifest(change), /unavailable/);
});

test('404, HTML fallback, corrupt JSON and oversized manifest fail before model reads', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    new Response(' '.repeat(65537), { headers: { 'Content-Type': 'application/json' } })]) {
    let calls = 0;
    await assert.rejects(createWhisperAssetFetch((async () => { calls++; return response; }) as typeof fetch, origin), /unavailable/);
    assert.equal(calls, 1);
  }
});

test('truncated, corrupted and over-budget files are rejected before use', async () => {
  for (const content of ['bad', 'x'.repeat(898), 'x'.repeat(899)]) {
    const f = fixture(() => new Response(content));
    const fetcher = await createWhisperAssetFetch(f.fetcher, origin);
    await assert.rejects(fetcher(prefix + 'NOTICES.md'), /unavailable/);
  }
});

test('cancellation stops a body read even when the underlying fetch ignores abort', async () => {
  let cancelled = false;
  const f = fixture(() => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const controller = new AbortController();
  const fetcher = await createWhisperAssetFetch(f.fetcher, origin);
  const pending = fetcher(prefix + 'NOTICES.md', { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cancelled, true);
  await assert.rejects(fetcher(prefix + 'NOTICES.md', { signal: controller.signal }), { name: 'AbortError' });
});
