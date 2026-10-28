import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { readRuntimeConfig } = await import(new URL('../extension/client.js', import.meta.url).href);

const { previewHost } = await import(new URL('../scripts/preview-host.mjs', import.meta.url).href);
const { createExtensionPreviewServer } = await import(new URL('../scripts/preview-extension.mjs', import.meta.url).href);

test('preview host stays loopback by default and requires an explicit private IPv4 address', () => {
  assert.equal(previewHost([]), '127.0.0.1');
  for (const host of ['127.0.0.1', '192.168.1.10', '10.2.3.4', '172.16.0.1', '172.31.255.254'])
    assert.equal(previewHost(['--host', host]), host);
  for (const host of ['0.0.0.0', '::', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.168.1.999', 'example.test', '192.168.1.10/path'])
    assert.throws(() => previewHost(['--host', host]), /private IPv4/);
  for (const args of [['--host'], ['--unknown', '192.168.1.10'], ['--host', '192.168.1.10', '--extra']])
    assert.throws(() => previewHost(args), /Usage/);
});

test('LAN extension harness pins Host/origin and adapts only its served client', async (t) => {
  const moduleDirectory = await mkdtemp(join(tmpdir(), 'bait-preview-modules-'));
  t.after(() => rm(moduleDirectory, { recursive: true, force: true }));
  const host = '192.168.1.10';
  const server = createExtensionPreviewServer({ host });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  const origin = `http://${host}:${port}`;
  function get(path: string, headers: Record<string, string> = {}) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, headers: { Host: `${host}:${port}`, ...headers } }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }
  try {
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/', { Host: 'attacker.example' })).status, 421);
    assert.equal((await get('/', { Origin: 'http://192.168.1.11' })).status, 403);
    const runtime = await get('/runtime-config.js');
    assert.ok(runtime.body.includes(origin));
    const wrapper = await get('/client.js');
    assert.equal(wrapper.status, 200);
    const presentation = await get('/presentation.js');
    assert.equal(presentation.status, 200);
    // Keep the served module graph intact: data: URLs cannot resolve relative
    // imports, while the browser resolves presentation.js beside client.js.
    await Promise.all([
      writeFile(join(moduleDirectory, 'package.json'), '{"type":"module"}'),
      writeFile(join(moduleDirectory, 'client.js'), wrapper.body),
      writeFile(join(moduleDirectory, 'presentation.js'), presentation.body),
    ]);
    const adapted = await import(pathToFileURL(join(moduleDirectory, 'client.js')).href);
    const config = { clientId: 'previewfixture', apiBaseUrl: origin, studioBaseUrl: origin };
    assert.deepEqual(adapted.readRuntimeConfig(config), config);
    assert.throws(() => adapted.readRuntimeConfig({ ...config, apiBaseUrl: 'http://192.168.1.11' }), /invalid/);
    assert.throws(() => adapted.readRuntimeConfig({ ...config, clientId: 'invalid-id' }), /missing/);
    assert.throws(() => readRuntimeConfig(config), /invalid/, 'shipped client must still reject HTTP LAN');
    assert.equal((await get('/.env')).status, 400);
    assert.equal((await get('/server/config.ts')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});
