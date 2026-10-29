import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  authenticateRequest, identityIsCurrent, LOCAL_FIXTURE_AUDIENCE, LOCAL_FIXTURE_ISSUER,
  STAGING_CAPABILITY_AUDIENCE, STAGING_CAPABILITY_ISSUER,
  type AuthEnv, type AuthIdentity, type AuthResult,
} from '../src/auth.js';

// Public synthetic fixture material. No live credentials are loaded by tests.
const twitchKey = Buffer.alloc(32, 251).toString('base64');
const fixtureKey = Buffer.alloc(32, 117).toString('base64');
const stagingKey = Buffer.alloc(32, 237).toString('base64');
const nowMs = 1_800_000_000_000;
const seconds = nowMs / 1000;
const origin = 'https://extension.example';
const localOrigin = 'http://127.0.0.1:8797';
const env: AuthEnv = {
  EDGE_POC_ENABLED: 'true', EDGE_ALLOWED_HOSTS: 'edge.example,127.0.0.1:8797,[::1]:8797,localhost:8797',
  EDGE_ALLOWED_ORIGINS: `${origin},${localOrigin}`, EDGE_ALLOWED_CHANNELS: '123,456',
  TWITCH_EXTENSION_SECRET_B64: twitchKey, EDGE_LOCAL_FIXTURE_AUTH: 'true', EDGE_FIXTURE_SECRET_B64: fixtureKey,
  EDGE_STAGING_AUTH: 'true', EDGE_STAGING_SECRET_B64: stagingKey,
};

function jwt(payload: Record<string, unknown>, key = twitchKey, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
  const content = [header, payload].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${content}.${createHmac('sha256', Buffer.from(key, 'base64')).update(content).digest('base64url')}`;
}

function extension(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { channel_id: '123', opaque_user_id: 'Uviewer123', role: 'viewer', exp: seconds + 3600, ...overrides };
}

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { iss: LOCAL_FIXTURE_ISSUER, aud: LOCAL_FIXTURE_AUDIENCE, channel_id: '123',
    sub: 'fixture:one', role: 'viewer', iat: seconds, exp: seconds + 300, generation: 1, ...overrides };
}

function staging(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return fixture({ iss: STAGING_CAPABILITY_ISSUER, aud: STAGING_CAPABILITY_AUDIENCE, ...overrides });
}

function request(token: string, options: { url?: string; origin?: string | null; ws?: boolean; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { ...(options.origin === null ? {} : { origin: options.origin ?? origin }) };
  if (options.ws) {
    headers.upgrade = 'websocket';
    headers['sec-websocket-protocol'] = `baited.v1, baited.auth.${token}`;
  } else headers.authorization = `Bearer ${token}`;
  return new Request(options.url ?? 'https://edge.example/v1/rooms/123/snapshot', { headers: { ...headers, ...options.headers } });
}

async function authenticate(req: Request, overrides: AuthEnv = {}, channel = '123'): Promise<AuthResult> {
  return authenticateRequest(req, { ...env, ...overrides }, channel, { nowMs });
}

function authorized(result: AuthResult): AuthIdentity {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected authorized');
  return result.identity;
}

function rejected(result: AuthResult, status = 401): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected rejected');
  assert.equal(result.response.status, status);
  assert.equal(result.response.headers.get('cache-control'), 'private, no-store');
}

test('Twitch uses decoded standard base64 secret, verified role, channel, and opaque identity', async () => {
  assert.match(twitchKey, /\+/);
  const identity = authorized(await authenticate(request(jwt(extension()))));
  assert.deepEqual(identity, {
    authKind: 'twitch-extension', channelId: '123', subject: 'twitch-opaque:Uviewer123', role: 'viewer',
    stableIdentity: true, canControl: false, expiresAt: nowMs + 3_600_000, generation: null,
  });
  const content = jwt(extension()).split('.').slice(0, 2).join('.');
  const wrongKeyToken = `${content}.${createHmac('sha256', twitchKey).update(content).digest('base64url')}`;
  rejected(await authenticate(request(wrongKeyToken)));
});

test('broadcaster, linked owner and opaque owner receive hidden Studio projection without control rights', async () => {
  for (const claims of [
    { role: 'broadcaster', opaque_user_id: 'U123', user_id: '123' },
    { role: 'viewer', opaque_user_id: 'U123' },
    { role: 'viewer', user_id: '123' },
  ]) {
    const identity = authorized(await authenticate(request(jwt(extension(claims)))));
    assert.equal(identity.role, 'studio');
    assert.equal(identity.canControl, false);
  }
  const moderator = authorized(await authenticate(request(jwt(extension({ role: 'moderator', user_id: '789' })))));
  assert.equal(moderator.role, 'viewer');
  assert.equal(moderator.subject, 'twitch:789');
  assert.equal(moderator.canControl, false);
});

test('anonymous Twitch identity is explicitly read-only and unstable', async () => {
  const identity = authorized(await authenticate(request(jwt(extension({ opaque_user_id: 'Asession123' })))));
  assert.equal(identity.stableIdentity, false);
  assert.equal(identity.canControl, false);
});

test('documented U- and A- Twitch opaque IDs retain bounded dash and underscore support', async () => {
  for (const opaqueId of ['U-viewer_123', 'A-session_123']) {
    const identity = authorized(await authenticate(request(jwt(extension({ opaque_user_id: opaqueId })))));
    assert.equal(identity.subject, `twitch-opaque:${opaqueId}`);
    assert.equal(identity.role, 'viewer');
    assert.equal(identity.stableIdentity, opaqueId.startsWith('U'));
  }
  for (const opaqueId of ['U\nviewer', 'U/viewer', 'U' + 'v'.repeat(128)]) {
    rejected(await authenticate(request(jwt(extension({ opaque_user_id: opaqueId })))));
  }
});

test('disabled service, missing allowlists, unlisted origins, destinations and channels fail closed', async () => {
  const token = jwt(extension());
  rejected(await authenticate(request(token), { EDGE_POC_ENABLED: 'false' }), 503);
  rejected(await authenticate(request(token), { EDGE_POC_ENABLED: undefined }), 503);
  rejected(await authenticate(request(token), { EDGE_ALLOWED_HOSTS: undefined }), 403);
  rejected(await authenticate(request(token), { EDGE_ALLOWED_CHANNELS: undefined }), 403);
  rejected(await authenticate(request(token), { EDGE_ALLOWED_ORIGINS: undefined }), 403);
  for (const originValue of [null, 'null', 'https://extension.example.evil.test', `${origin}/`, `${origin}/path`, 'http://extension.example']) {
    rejected(await authenticate(request(token, { origin: originValue })), 403);
  }
  for (const url of ['https://edge.example.evil.test/v1/rooms/123/snapshot', 'http://edge.example/v1/rooms/123/snapshot']) {
    rejected(await authenticate(request(token, { url })), 403);
  }
  rejected(await authenticate(request(token, { headers: { host: 'evil.example' } })), 403);
  rejected(await authenticate(request(token), {}, '999'), 403);
  rejected(await authenticate(request(token), {}, '456'));
});

test('untrusted signatures, malformed JWTs, unsupported algorithms and JOSE extensions fail closed', async () => {
  for (const token of ['', 'a.b.c', 'a.b', 'abc', 'a'.repeat(4097), jwt(extension(), fixtureKey), jwt(extension(), twitchKey, { alg: 'none' }),
    jwt(extension(), twitchKey, { alg: 'HS512' }), jwt(extension(), twitchKey, { alg: 'HS256', typ: 'not-jwt' }),
    jwt(extension(), twitchKey, { alg: 'HS256', crit: ['private'] }), jwt(extension(), twitchKey, { alg: 'HS256', b64: false })]) {
    rejected(await authenticate(request(token)));
  }
  rejected(await authenticate(request(jwt(extension())), { TWITCH_EXTENSION_SECRET_B64: undefined }));
  rejected(await authenticate(request(jwt(extension())), { TWITCH_EXTENSION_SECRET_B64: 'not base64' }));
  rejected(await authenticate(request(jwt(extension())), { TWITCH_EXTENSION_SECRET_B64: Buffer.alloc(8).toString('base64') }));
});

test('Twitch rejects external tokens, bad identities, unexpected issuers and invalid times', async () => {
  for (const claims of [
    { role: 'external' }, { role: 'studio' }, { role: ['viewer'] }, { role: null }, { opaque_user_id: '' },
    { opaque_user_id: 'Eexternal' }, { opaque_user_id: 'Aanon', user_id: '789' },
    { opaque_user_id: 'Aanon', role: 'moderator' }, { role: 'broadcaster', opaque_user_id: 'U789' },
    { role: 'broadcaster', opaque_user_id: 'U123', user_id: '789' }, { user_id: 'not-numeric' },
    { is_unlinked: true, user_id: '789' }, { is_unlinked: 'false' }, { iss: 'attacker' }, { aud: 'wrong' },
    { exp: seconds }, { exp: seconds - 1 }, { exp: String(seconds + 100) }, { exp: null },
    { exp: Number.MAX_SAFE_INTEGER }, { nbf: seconds + 1 }, { iat: seconds + 1 }, { channel_id: '456' },
  ]) rejected(await authenticate(request(jwt(extension(claims)))));
});

test('websocket handshake returns only the agreed non-credential subprotocol', async () => {
  const token = jwt(extension());
  const result = await authenticate(request(token, { ws: true }));
  authorized(result);
  assert.equal(result.ok && result.protocol, 'baited.v1');
  assert.equal(JSON.stringify(result).includes(token), false);
  for (const offered of [`baited.auth.${token}`, `baited.v1,baited.v1,baited.auth.${token}`,
    `baited.v1,baited.auth.${token},other`, `baited.v1,baited.auth.${token},baited.auth.${token}`, 'baited.v1,other']) {
    rejected(await authenticate(request(token, { ws: true, headers: { 'sec-websocket-protocol': offered } })));
  }
  rejected(await authenticate(request(token, { ws: true, headers: { authorization: `Bearer ${token}` } })));
  rejected(await authenticate(request(token, { headers: { 'sec-websocket-protocol': `baited.v1,baited.auth.${token}` } })));
});

test('query credentials and alternative authorization forms are always refused', async () => {
  const token = jwt(extension());
  for (const query of [`token=${token}`, `jwt=${token}`, 'role=studio']) {
    rejected(await authenticate(request(token, { url: `https://edge.example/v1/rooms/123/snapshot?${query}` })));
  }
  for (const authorization of [`Basic ${token}`, `Bearer ${token}, Bearer ${token}`, `Bearer  ${token}`]) {
    rejected(await authenticate(request(token, { headers: { authorization } })));
  }
});

test('local capability requires explicit fixture flag and loopback, including CLI origin exception', async () => {
  const token = jwt(fixture({ role: 'studio' }), fixtureKey);
  for (const url of [`${localOrigin}/v1/rooms/123/snapshot`, 'http://localhost:8797/v1/rooms/123/snapshot', 'http://[::1]:8797/v1/rooms/123/snapshot']) {
    const identity = authorized(await authenticate(request(token, { url, origin: null })));
    assert.equal(identity.authKind, 'local-fixture');
    assert.equal(identity.canControl, true);
    assert.equal(identity.generation, 1);
  }
  rejected(await authenticate(request(token, { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: null }), { EDGE_LOCAL_FIXTURE_AUTH: 'false' }));
  rejected(await authenticate(request(token)));
  rejected(await authenticate(request(token, { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: 'https://evil.test' })), 403);
  rejected(await authenticate(request(jwt(extension()), { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: null })), 403);
});

test('capabilities require short expiry, issuance time, issuer, audience, subject, role and generation', async () => {
  for (const changes of [
    { aud: 'wrong' }, { iss: 'wrong' }, { sub: '' }, { sub: 'bad\nsubject' }, { sub: null }, { role: 'admin' }, { role: ['viewer'] },
    { iat: undefined }, { iat: seconds + 1 }, { exp: seconds + 301 }, { exp: seconds },
    { generation: undefined }, { generation: -1 }, { generation: '1' }, { generation: 0.5 }, { generation: Number.MAX_SAFE_INTEGER + 1 },
  ]) rejected(await authenticate(request(jwt(fixture(changes), fixtureKey), { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: localOrigin })));
  for (const role of ['viewer', 'overlay']) {
    assert.equal(authorized(await authenticate(request(jwt(fixture({ role }), fixtureKey), { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: localOrigin }))).canControl, false);
  }
});

test('staging capability needs its own key, exact origin, HTTPS and separate opt-in', async () => {
  const token = jwt(staging({ role: 'studio' }), stagingKey);
  const identity = authorized(await authenticate(request(token)));
  assert.equal(identity.authKind, 'staging-capability');
  assert.equal(identity.canControl, true);
  rejected(await authenticate(request(token), { EDGE_STAGING_AUTH: 'false' }));
  rejected(await authenticate(request(token), { EDGE_STAGING_AUTH: undefined }));
  rejected(await authenticate(request(token, { origin: null })), 403);
  rejected(await authenticate(request(token, { origin: 'https://extension.example.evil.test' })), 403);
  rejected(await authenticate(request(token, { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: localOrigin })));
  rejected(await authenticate(request(jwt(staging(), fixtureKey))));
  rejected(await authenticate(request(jwt(fixture(), fixtureKey))));
  rejected(await authenticate(request(jwt(staging(), fixtureKey)), { EDGE_STAGING_SECRET_B64: fixtureKey }));
  rejected(await authenticate(request(jwt(extension(), fixtureKey)), { TWITCH_EXTENSION_SECRET_B64: fixtureKey }));
});

test('expiry and room generation must be rechecked before each private send', async () => {
  const identity = authorized(await authenticate(request(jwt(fixture(), fixtureKey), { url: `${localOrigin}/v1/rooms/123/snapshot`, origin: null })));
  assert.equal(identityIsCurrent(identity, '123', 1, nowMs), true);
  assert.equal(identityIsCurrent(identity, '456', 1, nowMs), false);
  assert.equal(identityIsCurrent(identity, '123', 2, nowMs), false);
  assert.equal(identityIsCurrent(identity, '123', 1, identity.expiresAt - 1), true);
  assert.equal(identityIsCurrent(identity, '123', 1, identity.expiresAt), false);
  assert.equal(identityIsCurrent(identity, '123', 1, Number.NaN), false);
  const twitch = authorized(await authenticate(request(jwt(extension()))));
  assert.equal(identityIsCurrent({ ...twitch, generation: 1 }, '123', 2, nowMs), false);
});

test('failure response never returns tokens or keys', async () => {
  const token = jwt(extension(), fixtureKey);
  const result = await authenticate(request(token));
  rejected(result);
  if (result.ok) throw new Error('Expected rejected');
  const body = await result.response.text();
  assert.equal(body.includes(token), false);
  assert.equal(body.includes(fixtureKey), false);
  assert.equal(body.includes('opaque_user_id'), false);
});
