import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import express from 'express';
import { CloudEdge } from '../server/cloud-edge.js';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';

const key = 'ab'.repeat(32), now = 1_793_181_234_000;
function signed(ip = '198.51.100.7', method = 'GET', target = '/api/health', timestamp = Math.floor(now / 1000), signingKey = key) {
  const time = String(timestamp), derived = createHmac('sha256', Buffer.from(signingKey, 'hex')).update('baited:edge-ip:v1').digest();
  const signature = createHmac('sha256', derived).update(`${time}\n${ip}\n${method}\n${target}`).digest('hex');
  return { 'x-baited-edge-ip': ip, 'x-baited-edge-time': time, 'x-baited-edge-signature': signature };
}
function request(headers: Record<string, string | string[]>, method = 'GET', url = '/api/health') {
  return { headers, method, url } as IncomingMessage;
}

test('valid IPv4 and IPv6 edge attestations use the exact signed method and path/query', () => {
  const edge = new CloudEdge(key, () => now), target = '/api/studio/events?room=a%2Fb&v=1';
  for (const ip of ['198.51.100.7', '2001:db8::1', '::ffff:198.51.100.7']) {
    assert.equal(edge.clientIp(request(signed(ip, 'GET', target), 'GET', target)), ip);
  }
  const valid = signed('198.51.100.7', 'POST', target);
  assert.equal(edge.clientIp(request(valid, 'POST', target)), '198.51.100.7');
  for (const [method, path] of [['GET', target], ['POST', '/api/studio/events?room=a%2Fb&v=2'], ['POST', '/api/other']])
    assert.equal(edge.clientIp(request(valid, method, path)), undefined);
});

test('edge attestations reject unsigned, malformed, expired, future and tampered envelopes', () => {
  const edge = new CloudEdge(key, () => now), seconds = Math.floor(now / 1000), valid = signed();
  assert.throws(() => new CloudEdge(''), /32-byte/);
  for (const headers of [
    {}, { ...valid, 'x-baited-edge-ip': '203.0.113.9' },
    signed('not-an-ip'), signed('999.999.999.999'), signed('198.51.100.7, 203.0.113.1'),
    { ...valid, 'x-baited-edge-time': `${seconds}.0` }, { ...valid, 'x-baited-edge-time': `0${seconds}` },
    { ...valid, 'x-baited-edge-signature': 'f'.repeat(64) }, { ...valid, 'x-baited-edge-signature': 'f'.repeat(63) },
    { ...valid, 'x-baited-edge-signature': ['a'.repeat(64), 'b'.repeat(64)] },
    signed('198.51.100.7', 'GET', '/api/health', seconds - 61),
    signed('198.51.100.7', 'GET', '/api/health', seconds + 61),
    signed('198.51.100.7', 'GET', '/api/health', seconds, 'cd'.repeat(32)),
  ]) assert.equal(edge.clientIp(request(headers)), undefined);
  assert.equal(edge.clientIp(request(signed('198.51.100.7', 'GET', '/api/health', seconds - 60))), '198.51.100.7');
  assert.equal(edge.clientIp(request(signed('198.51.100.7', 'GET', '/api/health', seconds + 60))), '198.51.100.7');
});

test('middleware installs an immutable own req.ip before routes despite trusted forwarded headers', async (t) => {
  const app = express(), edge = new CloudEdge(key, () => now);
  app.set('trust proxy', true);
  app.use(edge.middleware());
  app.get('/inspect', (req, res) => res.json({ ip: req.ip, descriptor: Object.getOwnPropertyDescriptor(req, 'ip') }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/inspect`;
  assert.equal((await fetch(url)).status, 403);
  const result = await fetch(url, { headers: { ...signed('198.51.100.7', 'GET', '/inspect'), 'x-forwarded-for': '127.0.0.1' } });
  assert.equal(result.status, 200);
  const body = await result.json() as { ip: string; descriptor: { writable: boolean; configurable: boolean } };
  assert.equal(body.ip, '198.51.100.7');
  assert.equal(body.descriptor.writable, false);
  assert.equal(body.descriptor.configurable, false);
});

test('cloud OAuth limits separate signed visitors and cannot be reset by forwarded-header spoofing', async (t) => {
  const app = await createBait(loadConfig({ STORAGE_BACKEND: 'cloudflare', TOKEN_ENCRYPTION_KEY: key, PORT: '0',
    TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-secret', ENABLE_DEMO: 'false' }), false, {
    storageFetch: async (_url, init) => new Response(null, { status: init?.method === 'GET' ? 404 : 200, headers: { etag: '"fixture"' } }),
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/auth/twitch`;
  const headers = (ip: string) => signed(ip, 'GET', '/auth/twitch', Math.floor(Date.now() / 1000));
  assert.equal((await fetch(url, { redirect: 'manual' })).status, 403);
  for (let i = 0; i < 20; i++) assert.equal((await fetch(url, { redirect: 'manual', headers: headers('198.51.100.7') })).status, 302);
  assert.equal((await fetch(url, { redirect: 'manual', headers: {
    ...headers('198.51.100.7'), 'X-Forwarded-For': '203.0.113.44', 'CF-Connecting-IP': '203.0.113.44',
  } })).status, 429);
  assert.equal((await fetch(url, { redirect: 'manual', headers: headers('198.51.100.8') })).status, 302);
});
