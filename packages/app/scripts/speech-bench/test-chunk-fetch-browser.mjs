import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit local assets only. This test never contacts the pilot or a model host.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { build } = createRequire(resolve(app, '../edge-game/package.json'))('esbuild');
const { chromium } = createRequire(resolve(app, '../landing/package.json'))('playwright');
const assetDirectory = process.argv[2];
if (!assetDirectory) throw new Error('Pass the packaged speech-bench-assets directory.');
const manifestBytes = await readFile(resolve(assetDirectory, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const decoder = manifest.files.find((file) => file.chunks);
assert.equal(decoder?.chunks.length, 2);
const paths = new Set(manifest.files.flatMap((file) => file.chunks ?? [file]).map((file) => file.path));
const script = (await build({ entryPoints: [resolve(app, 'client/speech-bench/asset-fetch.ts')],
  bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].text;
let mode = 'valid', requests = [], heldConnectionClosed = false;
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    requests.push({ path, method: request.method });
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local asset test</title>'); return; }
    if (path === '/asset-fetch.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); return; }
    if (path === '/speech-bench-assets/manifest.json') {
      if (mode === 'missing') { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); return; }
      if (mode === 'html') { response.setHeader('Content-Type', 'text/html'); response.end('<html>App fallback</html>'); return; }
      response.setHeader('Content-Type', 'application/json'); response.end(manifestBytes); return;
    }
    const name = path.slice('/speech-bench-assets/'.length);
    if (!path.startsWith('/speech-bench-assets/') || !paths.has(name)) { response.writeHead(404); response.end(); return; }
    const bytes = await readFile(resolve(assetDirectory, name));
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', bytes.length);
    if (name === decoder.chunks[0].path) {
      if (mode === 'corrupt') bytes[0] ^= 255;
      if (mode === 'hold') {
        response.on('close', () => { heldConnectionClosed = true; });
        response.write(bytes.subarray(0, 32)); return;
      }
    }
    response.end(bytes);
  } catch { response.writeHead(500); response.end(); }
});
let browser;
const receipt = { browser: 'Chromium headless', localOnly: true, checks: [] };
try {
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, timeout: 30_000 });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    assert.equal(new URL(route.request().url()).origin, origin);
    assert.equal(route.request().method(), 'GET');
    await route.continue();
  });
  await page.goto(origin, { timeout: 15_000 });
  const run = async (kind) => {
    mode = kind; requests = [];
    return page.evaluate(async ({ decoderPath, firstChunk, kind }) => {
      const { createWhisperAssetFetch } = await import('/asset-fetch.js');
      const controller = new AbortController();
      const nativeFetch = window.fetch.bind(window);
      const fetcher = await createWhisperAssetFetch(async (url, init) => {
        const result = await nativeFetch(url, init);
        if (kind === 'hold' && new URL(String(url)).pathname.endsWith(firstChunk))
          setTimeout(() => controller.abort(), 20);
        return result;
      }, location.origin);
      if (kind === 'blocked') {
        const rejected = [];
        for (const [url, init] of [['https://external.invalid/model'], ['/speech-bench-assets/NOTICES.md', { method: 'POST', body: 'audio' }]]) {
          try { await fetcher(url, init); } catch { rejected.push(url); }
        }
        return { rejected: rejected.length };
      }
      try {
        const response = await fetcher(`/speech-bench-assets/${decoderPath}`, { signal: controller.signal });
        const bytes = await response.arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
          .map((value) => value.toString(16).padStart(2, '0')).join('');
        return { bytes: bytes.byteLength, hash };
      } catch (error) { return { error: error.name, message: error.message }; }
    }, { decoderPath: decoder.path, firstChunk: decoder.chunks[0].path, kind });
  };
  const valid = await run('valid');
  assert.deepEqual(valid, { bytes: decoder.bytes, hash: decoder.sha256 });
  assert.deepEqual(requests.filter(({ path }) => path.includes('/chunks/')).map(({ path }) => path),
    decoder.chunks.map(({ path }) => `/speech-bench-assets/${path}`));
  receipt.checks.push({ test: 'exact decoder reconstruction', ...valid });
  const corrupt = await run('corrupt');
  assert.match(corrupt.message, /unavailable/);
  assert.equal(requests.filter(({ path }) => path.includes('/chunks/')).length, 1);
  receipt.checks.push({ test: 'corrupt chunk rejected before second chunk', passed: true });
  const cancelled = await run('hold');
  assert.equal(cancelled.error, 'AbortError');
  await new Promise((ready) => setTimeout(ready, 100));
  assert.equal(heldConnectionClosed, true);
  assert.equal(requests.filter(({ path }) => path.includes('/chunks/')).length, 1);
  receipt.checks.push({ test: 'cancel closes pending chunk and prevents next chunk', passed: true });
  assert.deepEqual(await run('blocked'), { rejected: 2 });
  assert.equal(requests.filter(({ path }) => path !== '/speech-bench-assets/manifest.json').length, 0);
  receipt.checks.push({ test: 'off-origin and upload calls blocked before network', passed: true });
  for (const failure of ['missing', 'html']) {
    await assert.rejects(run(failure), /unavailable/);
    assert.equal(requests.length, 1);
    receipt.checks.push({ test: `${failure} manifest stops model fetch`, passed: true });
  }
  if (process.argv[3]) await writeFile(resolve(process.argv[3]), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
