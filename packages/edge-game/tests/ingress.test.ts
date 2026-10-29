import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { pilotIngress, type IngressEnv } from '../src/ingress.js';

const origin = 'https://pilot.test';
const ip = '192.0.2.42';
function limiter(limit: number) {
  const keys: string[] = [];
  return { keys, binding: { async limit({ key }: { key: string }) { keys.push(key); return { success: keys.length <= limit }; } } };
}
function config(general = limiter(600), oauth = limiter(10)) {
  return { general, oauth, env: { EDGE_PILOT_ENABLED: 'true', PILOT_INGRESS_LIMITER: general.binding, PILOT_OAUTH_LIMITER: oauth.binding } as IngressEnv };
}
const request = (path = '/api/session', headers: Record<string, string> = {}) => new Request(origin + path, { headers: { 'cf-connecting-ip': ip, ...headers } });

test('dynamic ingress is capped before Control and OAuth has its own narrower quota', async () => {
  const { env, general, oauth } = config(limiter(4), limiter(1));
  assert('request' in await pilotIngress(request('/auth/twitch'), env));
  const limited = await pilotIngress(request('/auth/twitch'), env);
  assert('response' in limited && limited.response.status === 429);
  if ('response' in limited) assert.equal(limited.response.headers.get('retry-after'), '60');
  assert('request' in await pilotIngress(request('/api/edge/overlay'), env));
  assert('request' in await pilotIngress(request('/v1/rooms/123/state'), env));
  const overall = await pilotIngress(request('/api/edge/session'), env);
  assert('response' in overall && overall.response.status === 429);
  assert.equal(oauth.keys.length, 2); assert.equal(general.keys.length, 5);
  assert(general.keys.every((value) => !value.includes(ip) && /^ip-v1:[A-Za-z0-9_-]{43}$/.test(value)));
  assert.equal(general.keys[0], general.keys[4], 'rotating routes does not evade the shared network bucket');
});

test('enabled pilot fails closed on absent attribution, missing bindings and limiter errors', async () => {
  const { env } = config();
  for (const headers of [{}, { 'x-forwarded-for': ip }, { 'cf-connecting-ip': '192.0.2.1,192.0.2.2' }]) {
    const result = await pilotIngress(new Request(origin + '/api/session', { headers }), env);
    assert('response' in result && result.response.status === 503);
  }
  const missing = await pilotIngress(request(), { EDGE_PILOT_ENABLED: 'true' });
  assert('response' in missing && missing.response.status === 503);
  const broken = await pilotIngress(request(), { ...env, PILOT_INGRESS_LIMITER: { limit: async () => { throw new Error('fixture failure'); } } });
  assert('response' in broken && broken.response.status === 503);
});

test('forwarded IP spoofing cannot change quota keys; IPv6 is supported', async () => {
  const { env, general } = config();
  await pilotIngress(request('/api/session', { 'x-forwarded-for': '203.0.113.1', 'x-real-ip': '203.0.113.2' }), env);
  await pilotIngress(request('/api/session', { 'x-forwarded-for': '203.0.113.3', 'x-real-ip': '203.0.113.4' }), env);
  assert.equal(general.keys[0], general.keys[1]);
  assert('request' in await pilotIngress(request('/api/session', { 'cf-connecting-ip': '2001:db8::1234' }), env));
});

test('static assets and disabled synthetic POC do not consume pilot ingress quota', async () => {
  const { env, general } = config();
  for (const path of ['/health', '/studio', '/assets/card.webp']) assert('request' in await pilotIngress(request(path), env));
  assert('request' in await pilotIngress(request('/api/session'), { EDGE_PILOT_ENABLED: 'false' }));
  assert.equal(general.keys.length, 0);
});

test('only authentic bounded Twitch webhooks bypass shared-IP quotas and retain exact body', async () => {
  const secret = 'public-fixture-webhook-secret-not-a-credential';
  const body = '{"fixture":"signed webhook"}'; const id = 'fixture-message'; const timestamp = new Date().toISOString();
  const headers = { 'twitch-eventsub-message-id': id, 'twitch-eventsub-message-timestamp': timestamp, 'twitch-eventsub-message-type': 'notification',
    'twitch-eventsub-message-signature': 'sha256=' + createHmac('sha256', secret).update(id + timestamp + body).digest('hex') };
  const { env, general, oauth } = config(limiter(0), limiter(0)); env.TWITCH_EVENTSUB_SECRET = secret;
  const accepted = await pilotIngress(new Request(origin + '/api/twitch/eventsub', { method: 'POST', headers, body }), env);
  assert('request' in accepted); if ('request' in accepted) assert.equal(await accepted.request.text(), body);
  assert.equal(general.keys.length, 0); assert.equal(oauth.keys.length, 0);
  const invalid = await pilotIngress(new Request(origin + '/api/twitch/eventsub', { method: 'POST', headers, body: body + ' ' }), env);
  assert('response' in invalid && invalid.response.status === 403);
  const huge = await pilotIngress(new Request(origin + '/api/twitch/eventsub', { method: 'POST', headers, body: 'x'.repeat(65_537) }), env);
  assert('response' in huge && huge.response.status === 413);
});
