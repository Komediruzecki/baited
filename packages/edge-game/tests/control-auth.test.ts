import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { allowedLogins, cookieValue, decryptValue, encryptValue, maximumChannels, oauthCookie, publicOrigin,
  sameOrigin, sessionCookie, signPilotCapability, studioIdleMilliseconds, verifyWebhook } from '../src/control-auth.js';

// Public, deterministic fixture material. Not provider credentials.
const key = Buffer.alloc(32, 17).toString('base64');
const otherKey = Buffer.alloc(32, 29).toString('base64');
const origin = 'https://pilot.test';

test('credential envelopes authenticate both content and account identity', async () => {
  const fixture = { accessToken: 'fixture-access-only', refreshToken: 'fixture-refresh-only' };
  const encrypted = await encryptValue(fixture, key, 'channel:123');
  assert(!JSON.stringify(encrypted).includes(fixture.accessToken));
  assert.deepEqual(await decryptValue(encrypted, key, 'channel:123'), fixture);
  await assert.rejects(decryptValue(encrypted, otherKey, 'channel:123'));
  await assert.rejects(decryptValue(encrypted, key, 'channel:456'));
  const corrupted = { ...encrypted, ciphertext: `${encrypted.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.ciphertext.slice(1)}` };
  await assert.rejects(decryptValue(corrupted, key, 'channel:123'));
  assert.notEqual((await encryptValue(fixture, key, 'channel:123')).iv, encrypted.iv);
});

test('pilot capabilities bind channel, role and durable session for five minutes', async () => {
  const { token, tokenExpiresAt } = await signPilotCapability({ EDGE_PILOT_SECRET_B64: key } as any,
    { channelId: '123', role: 'studio', sessionId: 'session-fixture' }, 1_800_000_000_000);
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header!, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
  assert.equal(signature, createHmac('sha256', Buffer.from(key, 'base64')).update(`${header}.${payload}`).digest('base64url'));
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
  assert.equal(claims.iss, 'baited-edge-pilot'); assert.equal(claims.aud, 'baited-edge');
  assert.equal(claims.channel_id, '123'); assert.equal(claims.sid, 'session-fixture'); assert.equal(claims.role, 'studio');
  assert.equal(claims.exp - claims.iat, 300); assert.equal(tokenExpiresAt, 1_800_000_300_000);
});

test('OAuth and session cookies are HttpOnly secure and reject ambiguity', () => {
  assert.match(sessionCookie('fixture', 100), /^__Host-baited_session=fixture; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  assert.match(oauthCookie('fixture', 100), /Path=\/auth\/twitch\/callback; HttpOnly; Secure; SameSite=Lax/);
  const value = 'a'.repeat(43);
  assert.equal(cookieValue(new Request(origin, { headers: { cookie: `key=${value}` } }), 'key'), value);
  assert.equal(cookieValue(new Request(origin, { headers: { cookie: `key=${value}; key=${value}` } }), 'key'), null);
  assert.equal(cookieValue(new Request(origin, { headers: { cookie: 'key=<bad>' } }), 'key'), null);
});

test('pilot config validates allowlists, bounds channel count and rejects arbitrary origins', () => {
  assert.deepEqual([...allowedLogins({} as any)], ['komediruzecki7', 'lakeeko', 'yahwehwastaken']);
  assert.deepEqual([...allowedLogins({ EDGE_CHANNEL_LOGIN_ALLOWLIST: 'new_user,second' } as any)], ['new_user', 'second']);
  assert.throws(() => allowedLogins({ EDGE_CHANNEL_LOGIN_ALLOWLIST: '*' } as any));
  assert.equal(maximumChannels({} as any), 3);
  assert.throws(() => maximumChannels({ EDGE_MAX_CHANNELS: '11' } as any));
  assert.equal(studioIdleMilliseconds({} as any), 15 * 60_000);
  assert.throws(() => studioIdleMilliseconds({ EDGE_STUDIO_IDLE_MINUTES: '4' } as any));
  assert.throws(() => studioIdleMilliseconds({ EDGE_STUDIO_IDLE_MINUTES: '61' } as any));
  assert.equal(publicOrigin({ EDGE_PUBLIC_ORIGIN: origin } as any), origin);
  for (const value of ['http://pilot.test', 'https://evil@pilot.test', `${origin}/callback`, `${origin}?x=1`]) assert.throws(() => publicOrigin({ EDGE_PUBLIC_ORIGIN: value } as any));
  assert(sameOrigin(new Request(origin, { headers: { origin } }), origin));
  assert(!sameOrigin(new Request(origin, { headers: { origin: 'https://attacker.test' } }), origin));
  assert(!sameOrigin(new Request(origin), origin));
});

test('webhook verifier authenticates exact raw bytes and rejects replay-age/signature/type changes', async () => {
  const secret = 'public-webhook-fixture-32-characters';
  const now = 1_800_000_000_000; const timestamp = new Date(now).toISOString(); const body = '{"message":"fixture"}';
  const make = (overrides: Record<string, string> = {}) => new Request(`${origin}/api/twitch/eventsub`, { method: 'POST', body, headers: {
    'twitch-eventsub-message-id': 'fixture-id', 'twitch-eventsub-message-timestamp': timestamp, 'twitch-eventsub-message-type': 'notification',
    'twitch-eventsub-message-signature': `sha256=${createHmac('sha256', secret).update('fixture-id' + timestamp + body).digest('hex')}`, ...overrides } });
  assert.equal((await verifyWebhook(make(), body, secret, now))?.id, 'fixture-id');
  assert.equal(await verifyWebhook(make(), `${body} `, secret, now), null);
  assert.equal(await verifyWebhook(make(), body, secret, now + 600_001), null);
  assert.equal(await verifyWebhook(make(), body, secret, now - 60_001), null);
  assert.equal(await verifyWebhook(make({ 'twitch-eventsub-message-type': 'invalid' }), body, secret, now), null);
  assert.equal(await verifyWebhook(make({ 'twitch-eventsub-message-signature': 'sha256=' + '0'.repeat(64) }), body, secret, now), null);
});
