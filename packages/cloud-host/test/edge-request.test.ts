import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { CloudEdge } from '../../app/server/cloud-edge.ts';
import { containerRequest } from '../src/edge-request.ts';

const key = '42'.repeat(32);
test('the public boundary strips container port overrides and signs only the edge client IP', async () => {
  const original = new Request('https://play.example.test/auth/twitch?next=studio', { headers: {
    'cf-connecting-ip': '2001:db8::1', 'cf-container-target-port': '9999',
    'x-forwarded-for': 'attacker', 'forwarded': 'for=attacker',
    'x-baited-edge-ip': '127.0.0.1', 'x-baited-edge-time': '1', 'x-baited-edge-signature': 'forged',
    cookie: 'session=fixture', upgrade: 'websocket',
  } });
  const prepared = await containerRequest(original, key, 1700000000000);
  for (const header of ['cf-container-target-port', 'x-forwarded-for', 'forwarded']) assert.equal(prepared.headers.get(header), null);
  assert.equal(prepared.headers.get('x-baited-edge-ip'), '2001:db8::1');
  assert.equal(prepared.headers.get('x-baited-edge-time'), '1700000000');
  const derived = createHmac('sha256', Buffer.from(key, 'hex')).update('baited:edge-ip:v1').digest();
  const signature = createHmac('sha256', derived).update('1700000000\n2001:db8::1\nGET\n/auth/twitch?next=studio').digest('hex');
  assert.equal(prepared.headers.get('x-baited-edge-signature'), signature);
  assert.equal(new CloudEdge(key, () => 1700000000000).clientIp({
    headers: Object.fromEntries(prepared.headers), method: prepared.method,
    url: '/auth/twitch?next=studio',
  } as IncomingMessage), '2001:db8::1');
  assert.equal(prepared.headers.get('cookie'), 'session=fixture');
  assert.equal(prepared.headers.get('upgrade'), 'websocket');
});

test('missing platform IP or key fails closed, and forwarding keeps the request body', async () => {
  await assert.rejects(containerRequest(new Request('https://example.test'), key), /address/);
  await assert.rejects(containerRequest(new Request('https://example.test', { headers: { 'cf-connecting-ip': '127.0.0.1' } }), 'bad'), /key/);
  const prepared = await containerRequest(new Request('https://example.test/api/cards', {
    method: 'POST', body: 'fixture', headers: { 'cf-connecting-ip': '192.0.2.1' },
  }), key);
  assert.equal(await prepared.text(), 'fixture');
});
