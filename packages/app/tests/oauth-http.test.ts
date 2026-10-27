import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { Store, type Credentials } from '../server/store.js';

const key = 'ab'.repeat(32);
const twitchEnv = {
  TWITCH_CLIENT_ID: 'client-test',
  TWITCH_CLIENT_SECRET: 'secret-test',
  TOKEN_ENCRYPTION_KEY: key,
  TWITCH_BOT_USER_ID: '999',
};
const grant = (patch: Partial<Credentials> = {}): Credentials => ({
  access_token: 'stored-access',
  refresh_token: 'stored-refresh',
  expiresAt: Date.now() + 3600000,
  userId: '123',
  login: 'bait_channel',
  name: 'Bait_Channel',
  scope: ['user:read:chat'],
  ...patch,
});

/** Twitch's side of the sign-in, as the test sets it before each callback. */
interface FakeTwitch {
  scopes: string[];
  userId: string;
  tokenStatus: number;
  userStatus: number;
}

async function oauthServer(
  t: { after: (fn: () => Promise<void>) => void },
  options: { stored?: string[]; env?: Record<string, string> } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'bait-oauth-'));
  if (options.stored) {
    const seed = new Store(dir, key);
    await seed.load();
    await seed.setCredentials('123', grant({ scope: options.stored }));
    await seed.flush();
  }
  const twitch: FakeTwitch = { scopes: ['user:read:chat'], userId: '123', tokenStatus: 200, userStatus: 200 };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
    if (url.endsWith('/oauth2/token')) {
      if (!String(init?.body).includes('grant_type=authorization_code'))
        return Response.json({ access_token: 'app-token', expires_in: 3600 });
      if (twitch.tokenStatus !== 200) return new Response('', { status: twitch.tokenStatus });
      return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, scope: twitch.scopes });
    }
    if (url.endsWith('/oauth2/validate'))
      return Response.json({
        client_id: 'client-test',
        user_id: twitch.userId,
        login: `user${twitch.userId}`,
        expires_in: 3600,
        scopes: twitch.scopes,
      });
    if (url.endsWith('/helix/users')) {
      if (twitch.userStatus !== 200) return new Response('', { status: twitch.userStatus });
      return Response.json({ data: [{ id: twitch.userId, login: `user${twitch.userId}`, display_name: `User${twitch.userId}` }] });
    }
    return Response.json({ data: [] });
  }) as typeof fetch;
  const config = loadConfig({ PORT: '0', DATA_DIR: dir, ...twitchEnv, ...options.env });
  // EventSub never leaves the machine: the socket points at a closed local port.
  const bait = await createBait(config, false, { socketFactory: () => new WebSocket('ws://127.0.0.1:9') });
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bait.close();
    globalThis.fetch = realFetch;
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  const get = (path: string, cookie = '') =>
    realFetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const cookieOf = (r: Response, name: string) =>
    r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter((c) => c.startsWith(`${name}=`) && c !== `${name}=`)
      .at(-1) ?? '';
  /** Starts a sign-in and returns what Twitch would send back to the callback. */
  const begin = async (path: string, cookie = '') => {
    const r = await get(path, cookie);
    assert.equal(r.status, 302);
    const url = new URL(r.headers.get('location')!);
    return { state: url.searchParams.get('state')!, scope: url.searchParams.get('scope')!, oauth: cookieOf(r, 'bait_oauth') };
  };
  const callback = async (query: Record<string, string>, cookie: string) => {
    const r = await get(`/auth/twitch/callback?${new URLSearchParams(query)}`, cookie);
    assert.equal(r.status, 302);
    return { location: r.headers.get('location')!, session: cookieOf(r, 'bait_session') };
  };
  return { bait, twitch, get, begin, callback, store: bait.store };
}

test('a streamer who had allowed the bot is asked for it again after signing in without it', async (t) => {
  const { twitch, begin, callback, store } = await oauthServer(t, { stored: ['user:read:chat', 'channel:bot'] });
  // The session expired, so the landing page asks Twitch only for chat reading.
  const first = await begin('/auth/twitch');
  assert.equal(first.scope, 'user:read:chat');
  const signedIn = await callback({ state: first.state, code: 'code-1' }, first.oauth);
  assert.equal(signedIn.location, '/auth/twitch?bot=1&restore=1');
  assert.ok(signedIn.session, 'the streamer is signed in before the second step');
  const second = await begin(signedIn.location, signedIn.session);
  assert.equal(second.scope, 'user:read:chat channel:bot');
  twitch.scopes = ['user:read:chat', 'channel:bot'];
  const restored = await callback({ state: second.state, code: 'code-2' }, `${second.oauth}; ${signedIn.session}`);
  assert.equal(restored.location, '/');
  assert.deepEqual(store.credentials('123')?.scope, ['user:read:chat', 'channel:bot']);
});

test('declining the bot again lands on a notice instead of another Twitch prompt', async (t) => {
  const { twitch, begin, callback } = await oauthServer(t, { stored: ['user:read:chat', 'channel:bot'] });
  const first = await begin('/auth/twitch');
  const signedIn = await callback({ state: first.state, code: 'code-1' }, first.oauth);
  const second = await begin(signedIn.location, signedIn.session);
  const declined = await callback(
    { state: second.state, error: 'access_denied', error_description: 'The user denied you access' },
    `${second.oauth}; ${signedIn.session}`,
  );
  assert.equal(declined.location, '/?notice=bot-declined');
  // A restore that still comes back without channel:bot never loops.
  const third = await begin('/auth/twitch?bot=1&restore=1', signedIn.session);
  twitch.scopes = ['user:read:chat'];
  const again = await callback({ state: third.state, code: 'code-3' }, `${third.oauth}; ${signedIn.session}`);
  assert.equal(again.location, '/?notice=bot-declined');
});

test('a streamer who never allowed the bot signs in without a second prompt', async (t) => {
  for (const stored of [undefined, ['user:read:chat']]) {
    const { begin, callback } = await oauthServer(t, { stored });
    const first = await begin('/auth/twitch');
    assert.equal((await callback({ state: first.state, code: 'code-1' }, first.oauth)).location, '/');
  }
  // Without a bot account on this server, a lost channel:bot is not asked for again.
  const { begin, callback } = await oauthServer(t, {
    stored: ['user:read:chat', 'channel:bot'],
    env: { TWITCH_BOT_USER_ID: '' },
  });
  const first = await begin('/auth/twitch');
  assert.equal((await callback({ state: first.state, code: 'code-1' }, first.oauth)).location, '/');
});
