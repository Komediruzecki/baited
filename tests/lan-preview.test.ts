import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { loadConfig, isPrivateIPv4 } from '../server/config.js';
import { canUseDemo, createBait } from '../server/app.js';

const previewEnv = {
  LOCAL_PREVIEW_HOST: '192.168.1.20', HOST: '192.168.1.20',
  PUBLIC_URL: 'http://192.168.1.20:3330', PORT: '3330', ENABLE_DEMO: 'true',
};

test('LAN preview is explicit, credential-free and restricted to a matching private IPv4 bind', () => {
  assert.equal(loadConfig({}).previewLanHost, null);
  assert.equal(loadConfig(previewEnv).previewLanHost, '192.168.1.20');
  for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.20'])
    assert.equal(isPrivateIPv4(address), true, address);
  for (const address of ['127.0.0.1', '0.0.0.0', '172.15.0.1', '172.32.0.1',
    '192.169.1.1', '169.254.1.1', '8.8.8.8', 'localhost', '::1', '010.0.0.1', '192.168.1.20/24'])
    assert.equal(isPrivateIPv4(address), false, address);
  for (const override of [
    { LOCAL_PREVIEW_HOST: '0.0.0.0' },
    { HOST: '0.0.0.0' },
    { PUBLIC_URL: 'http://192.168.1.21:3330' },
    { PUBLIC_URL: 'ftp://192.168.1.20:3330' },
    { NODE_ENV: 'production', PUBLIC_URL: 'https://192.168.1.20:3330' },
    { TWITCH_CLIENT_ID: 'fixture-id' },
    { TWITCH_CLIENT_SECRET: 'fixture-secret' },
    { TOKEN_ENCRYPTION_KEY: 'a'.repeat(64) },
    { TWITCH_EXTENSION_CLIENT_ID: 'fixtureid' },
    { TWITCH_EXTENSION_SECRET: 'fixture-secret' },
    { DEEPGRAM_API_KEY: 'fixture-key' },
    { TRUSTED_PROXIES: '127.0.0.1' },
  ]) assert.throws(() => loadConfig({ ...previewEnv, ...override }), /LOCAL_PREVIEW_HOST/);
});

test('demo access keeps loopback defaults and only permits actual private LAN peers when opted in', () => {
  const local = loadConfig({}), lan = loadConfig(previewEnv);
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(canUseDemo(local, address, address), true);
    assert.equal(canUseDemo(lan, address, address), true);
  }
  for (const address of ['10.1.2.3', '172.16.1.2', '192.168.1.21', '::ffff:192.168.1.21']) {
    assert.equal(canUseDemo(local, address, address), false);
    assert.equal(canUseDemo(lan, address, address), true);
  }
  for (const address of ['198.51.100.4', '172.32.0.1', '169.254.1.1', 'fe80::1234', undefined]) {
    assert.equal(canUseDemo(lan, '192.168.1.21', address), false);
    assert.equal(canUseDemo(lan, '127.0.0.1', address), false);
  }
  assert.equal(canUseDemo(local, '198.51.100.4', '127.0.0.1'), false,
    'the default still respects a configured proxy client address');
  assert.equal(canUseDemo(loadConfig({ ...previewEnv, ENABLE_DEMO: 'false' }), '192.168.1.21', '192.168.1.21'), false);
});

test('LAN demo retains exact Host, mutation Origin, session and CSRF boundaries', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-lan-preview-'));
  const config = loadConfig({ ...previewEnv, DATA_DIR: dir });
  const app = await createBait(config);
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as AddressInfo).port;
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const call = (path: string, body?: unknown, extra: Record<string, string> = {}) =>
    new Promise<{ status: number; body: any; cookie?: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST',
        headers: { Host: '192.168.1.20:3330', Origin: config.origin, 'Content-Type': 'application/json', ...extra } }, (res) => {
        let text = '';
        res.setEncoding('utf8'); res.on('data', (part) => { text += part; });
        res.on('end', () => resolve({ status: res.statusCode!, body: text ? JSON.parse(text) : null,
          cookie: res.headers['set-cookie']?.[0]?.split(';')[0] }));
      });
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  assert.equal((await call('/api/session', undefined, { Host: 'attacker.example' })).status, 421);
  assert.equal((await call('/api/demo/start', {}, { Origin: 'http://attacker.example' })).status, 403);
  assert.equal((await call('/api/session')).body.demoAvailable, true);
  const started = await call('/api/demo/start', {});
  assert.equal(started.status, 200);
  assert.ok(started.cookie);
  assert.equal((await call('/api/studio/action', { action: 'start' })).status, 401);
  assert.equal((await call('/api/studio/action', { action: 'start' }, { Cookie: started.cookie! })).status, 403);
  assert.equal((await call('/api/studio/action', { action: 'start' }, {
    Cookie: started.cookie!, 'x-csrf-token': started.body.csrf,
  })).status, 200);
});
