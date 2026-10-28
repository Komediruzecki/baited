import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { loadConfig } from '../server/config.js';
import { createBait } from '../server/app.js';
import { extensionKey, verifyExtensionToken } from '../server/extension.js';
import { fixture } from './fixtures.js';
import type { ExtensionState, ExtensionConfiguration } from '../shared/extension.js';

// Fixed, synthetic keys used only by tests. Never a credential or real Extension key.
const key = Buffer.alloc(32, 42);
const secret = key.toString('base64');
const clientId = 'testextensionclient';
const frontend = `https://${clientId}.ext-twitch.tv`;
const hostId = '501062940';
const fresh = () => Math.floor(Date.now() / 1000) + 120;
const token = (patch: Record<string, unknown> = {}, signingKey = key, algorithm = 'HS256') =>
  new SignJWT({ channel_id: hostId, opaque_user_id: 'Utestviewer', role: 'viewer', exp: fresh(), ...patch })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .sign(signingKey);

test('Extension JWT checks signature, algorithm, required claims, expiry and role', async () => {
  const claims = await verifyExtensionToken(await token(), key);
  assert.equal(claims.channel_id, hostId);
  assert.equal(claims.role, 'viewer');
  assert.equal((await verifyExtensionToken(await token({ opaque_user_id: 'Aanonymous' }), key)).role, 'viewer');
  assert.equal((await verifyExtensionToken(await token({ role: 'moderator' }), key)).role, 'moderator');
  assert.equal((await verifyExtensionToken(await token({ role: 'broadcaster', opaque_user_id: `U${hostId}` }), key)).role, 'broadcaster');

  const bad = [
    token({}, Buffer.alloc(32, 43)),
    token({}, key, 'HS384'),
    token({ exp: Math.floor(Date.now() / 1000) - 1 }),
    token({ exp: undefined }),
    token({ exp: '9999999999' }),
    token({ nbf: fresh() + 60 }),
    token({ channel_id: undefined }),
    token({ channel_id: 'not-a-channel' }),
    token({ channel_id: '0' }),
    token({ role: 'external' }),
    token({ role: 'admin' }),
    token({ opaque_user_id: undefined }),
    token({ opaque_user_id: '' }),
    token({ role: 'broadcaster', opaque_user_id: 'Uwrong' }),
    token({ role: 'broadcaster', opaque_user_id: `U${hostId}`, user_id: '9999' }),
  ];
  for (const candidate of bad) await assert.rejects(verifyExtensionToken(await candidate, key));
  await assert.rejects(verifyExtensionToken('a.b.c', key));
  await assert.rejects(verifyExtensionToken('a'.repeat(5000), key));
  const unsigned = [Buffer.from('{"alg":"none"}').toString('base64url'), Buffer.from('{}').toString('base64url'), ''].join('.');
  await assert.rejects(verifyExtensionToken(unsigned, key));
});

test('Extension configuration is separate from OAuth and fails closed without breaking demo', () => {
  assert.equal(loadConfig({}).extensionReady, false);
  const configured = loadConfig({ TWITCH_EXTENSION_CLIENT_ID: clientId, TWITCH_EXTENSION_SECRET: secret });
  assert.equal(configured.extensionReady, true);
  assert.equal(configured.twitchReady, false);
  assert.deepEqual(configured.extensionOrigins, [frontend]);
  for (const invalid of ['', 'not-base64', 'abcd', `${secret}\n`, secret.slice(0, -1)]) {
    assert.equal(extensionKey(invalid), null);
    assert.equal(loadConfig({ TWITCH_EXTENSION_CLIENT_ID: clientId, TWITCH_EXTENSION_SECRET: invalid }).extensionReady, false);
  }
  assert.equal(loadConfig({ TWITCH_EXTENSION_CLIENT_ID: 'evil.example/path', TWITCH_EXTENSION_SECRET: secret }).extensionReady, false);
  const local = loadConfig({ EXTENSION_ALLOWED_ORIGINS: 'https://localhost:3340,http://127.0.0.1:3341' });
  assert.deepEqual(local.extensionOrigins, ['https://localhost:3340', 'http://127.0.0.1:3341']);
  for (const origin of ['*', 'null', 'https://example.com/path', 'https://user:password@example.com', 'https://example.com/', 'http://example.com', 'https://example.com?x=1']) {
    assert.throws(() => loadConfig({ EXTENSION_ALLOWED_ORIGINS: origin }), /EXTENSION_ALLOWED_ORIGINS/);
  }
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'https://game.example', EXTENSION_ALLOWED_ORIGINS: 'http://localhost:3340' }), /EXTENSION_ALLOWED_ORIGINS/);
});

test('Extension API isolates channels and roles while preserving studio protections', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-extension-'));
  const config = loadConfig({
    PORT: '0', DATA_DIR: dir,
    TWITCH_EXTENSION_CLIENT_ID: clientId,
    TWITCH_EXTENSION_SECRET: secret,
    EXTENSION_ALLOWED_ORIGINS: 'https://localhost:3340',
  });
  const bait = await createBait(config);
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  t.after(async () => {
    await bait.close();
    await rm(dir, { recursive: true, force: true });
  });
  const headers = (jwt: string, origin = frontend) => ({ Authorization: `Bearer ${jwt}`, Origin: origin });
  const viewToken = await token();
  const hostToken = await token({ role: 'broadcaster', opaque_user_id: `U${hostId}` });

  const unconfigured = await fetch(`${base}/api/extension/state`, { headers: headers(viewToken) });
  assert.equal(unconfigured.status, 200);
  assert.deepEqual(await unconfigured.json(), { version: '0.0.1', configured: false, room: null });
  const game = fixture().game;
  game.data.owner = hostId;
  game.data.mode = 'twitch';
  game.connection.status = 'connected';
  game.mic = 'listening';
  game.begin();
  bait.rooms.set(game.data.id, game);

  await t.test('viewer receives only its channel projection; broadcaster never receives the active target', async () => {
    const response = await fetch(`${base}/api/extension/state`, { headers: headers(viewToken) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), frontend);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const state = await response.json() as ExtensionState;
    assert.equal(state.room?.round?.target, game.round!.word);
    assert.deepEqual(state.room?.round?.forbiddenClues, game.round!.clues);
    assert.match(state.room?.round?.ink ?? '', /^#[0-9a-f]{6}$/);
    assert.equal(typeof state.room?.round?.example, 'string');
    assert.equal(state.configured, true);
    assert.equal('overlayKey' in state.room!, false);
    assert.equal('csrf' in state, false);
    const hostState = await (await fetch(`${base}/api/extension/state`, { headers: headers(hostToken) })).json() as ExtensionState;
    assert.equal(hostState.room?.round?.target, undefined);
    assert.equal(hostState.room?.round?.forbiddenClues, undefined);
    assert.equal(hostState.room?.round?.ink, undefined);
    assert.equal(hostState.room?.round?.example, undefined);
    assert.equal(JSON.stringify(hostState).includes(game.round!.word), false);

    const elsewhere = await token({ channel_id: '999999' });
    assert.deepEqual(await (await fetch(`${base}/api/extension/state`, { headers: headers(elsewhere) })).json(), {
      version: '0.0.1', configured: false, room: null,
    });
    assert.equal((await fetch(`${base}/api/extension/state?channel_id=${hostId}`, { headers: headers(elsewhere) })).status, 401);
    game.data.mode = 'demo';
    assert.equal((await (await fetch(`${base}/api/extension/state`, { headers: headers(viewToken) })).json()).configured, false);
    game.data.mode = 'twitch';
  });

  await t.test('configuration requires the broadcaster and reflects revoked OAuth separately from a saved room', async () => {
    for (const role of ['viewer', 'moderator']) {
      const response = await fetch(`${base}/api/extension/config`, { headers: headers(await token({ role })) });
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, 'extension_role');
    }
    const before = await (await fetch(`${base}/api/extension/config`, { headers: headers(hostToken) })).json() as ExtensionConfiguration;
    assert.equal(before.connected, false);
    // In-memory credential marker only; no Twitch requests or real credentials in this fixture.
    bait.store.snapshot.vault[hostId] = 'test-authorization-present';
    const response = await fetch(`${base}/api/extension/config`, { headers: headers(hostToken) });
    const data = await response.json() as ExtensionConfiguration;
    assert.equal(data.connected, true);
    assert.equal(data.channelId, hostId);
    assert.equal(data.channelName, game.data.channel);
    assert.equal(data.studioUrl, 'http://localhost:3000/studio');
    assert.equal(JSON.stringify(data).includes('test-authorization-present'), false);
    delete bait.store.snapshot.vault[hostId];
    assert.equal((await (await fetch(`${base}/api/extension/config`, { headers: headers(hostToken) })).json()).connected, false);
  });

  await t.test('fresh Helper tokens work after an expired token fails; a cookie cannot replace JWT authorization', async () => {
    const expired = await token({ exp: Math.floor(Date.now() / 1000) - 1 });
    const denied = await fetch(`${base}/api/extension/state`, { headers: headers(expired) });
    assert.equal(denied.status, 401);
    assert.equal((await denied.json()).code, 'extension_authorization');
    assert.equal((await fetch(`${base}/api/extension/state`, { headers: headers(await token({ exp: fresh() + 30 })) })).status, 200);
    assert.equal((await fetch(`${base}/api/extension/state`, { headers: { Cookie: 'bait_session=anything' } })).status, 401);
    assert.equal((await fetch(`${base}/api/extension/state?token=${viewToken}`)).status, 401);
  });

  await t.test('only exact frontend origins and read-only preflights are allowed', async () => {
    for (const origin of ['null', 'https://evil.example', `${frontend}.evil.example`]) {
      const response = await fetch(`${base}/api/extension/state`, { headers: headers(viewToken, origin) });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    const options = (origin: string, method: string, allowed = 'authorization') => fetch(`${base}/api/extension/state`, {
      method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': allowed },
    });
    const allowed = await options(frontend, 'GET');
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-headers'), 'Authorization');
    assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
    assert.equal((await options('https://localhost:3340', 'GET')).status, 204);
    assert.equal((await options(frontend, 'POST')).status, 403);
    assert.equal((await options(frontend, 'GET', 'authorization,x-csrf-token')).status, 403);
    assert.equal((await options('https://evil.example', 'GET')).status, 403);
    assert.equal((await fetch(`${base}/api/extension/state`, { method: 'POST', headers: headers(viewToken) })).status, 403);
    assert.equal((await fetch(`${base}/api/studio/action`, {
      method: 'POST', headers: { ...headers(hostToken), 'Content-Type': 'application/json' }, body: '{"action":"start"}',
    })).status, 403);
    assert.equal((await fetch(`${base}/api/studio`, { headers: headers(hostToken) })).status, 401);
    const hostPin = await new Promise<number>((resolve) => {
      const request = httpRequest(`${base}/api/extension/state`, { headers: { Host: 'evil.example', ...headers(viewToken) } }, (response) => {
        response.resume(); resolve(response.statusCode!);
      });
      request.end();
    });
    // PORT=0 is a deliberate loopback test exception. Production host pinning is tested separately below.
    assert.equal(hostPin, 200);
  });

  await t.test('authenticated polling is bounded', async () => {
    const busy = await token({ opaque_user_id: 'Ubusyviewer' });
    for (let i = 0; i < 180; i++) assert.equal((await fetch(`${base}/api/extension/state`, { headers: headers(busy) })).status, 200);
    const limited = await fetch(`${base}/api/extension/state`, { headers: headers(busy) });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).code, 'extension_rate_limit');
  });
});

test('unconfigured Extension returns 503 while the normal keyless demo remains usable', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-extension-disabled-'));
  const bait = await createBait(loadConfig({ PORT: '0', DATA_DIR: dir }));
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  t.after(async () => { await bait.close(); await rm(dir, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/api/extension/state`)).status, 503);
  const demo = await fetch(`${base}/api/demo/start`, { method: 'POST', headers: { Origin: 'http://localhost:3000' } });
  assert.equal(demo.status, 200);
});

test('Extension routing preserves production Host pinning', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-extension-host-'));
  const bait = await createBait(loadConfig({
    NODE_ENV: 'production', PUBLIC_URL: 'https://game.example', PORT: '0', DATA_DIR: dir,
    TWITCH_EXTENSION_CLIENT_ID: clientId, TWITCH_EXTENSION_SECRET: secret,
  }));
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  t.after(async () => { await bait.close(); await rm(dir, { recursive: true, force: true }); });
  assert.equal((await fetch(`${base}/api/extension/state`, { headers: { Authorization: `Bearer ${await token()}`, Origin: frontend } })).status, 421);
});
