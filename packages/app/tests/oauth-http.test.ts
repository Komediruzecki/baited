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
  /** Runs while Twitch is answering the user lookup, before the grant is stored. */
  duringLookup?: () => void;
  /** Access tokens the server asked Twitch to revoke. */
  revoked: string[];
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
  const twitch: FakeTwitch = { scopes: ['user:read:chat'], userId: '123', tokenStatus: 200, userStatus: 200, revoked: [] };
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
    if (url.endsWith('/oauth2/revoke')) {
      twitch.revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '');
      return new Response('', { status: 200 });
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
      twitch.duringLookup?.();
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

/** Every OAuth failure line the server logs while `run` executes, plus the run's result. */
async function logged<T>(t: { mock: { method: typeof import('node:test').mock.method } }, run: () => Promise<T>) {
  const lines: string[] = [];
  const warn = t.mock.method(console, 'warn', (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    const result = await run();
    return { result, lines };
  } finally {
    warn.mock.restore();
  }
}
const never = ['code-', 'new-access', 'new-refresh', 'stored-access', 'secret-test', 'app-token'];

test('every OAuth failure logs one fixed reason code and never a code, state, cookie or token', async (t) => {
  const { twitch, begin, callback, bait } = await oauthServer(t);
  const cases: { name: string; run: () => Promise<{ location: string }>; location: string; line: RegExp }[] = [];
  const secrets: string[] = [];
  const flow = async (path = '/auth/twitch') => {
    const started = await begin(path);
    secrets.push(started.state, started.oauth.split('=')[1]);
    return started;
  };
  cases.push({
    name: 'state missing',
    run: async () => callback({ state: 'forged-state', code: 'code-a' }, ''),
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=state_missing$/,
  });
  cases.push({
    name: 'cookie missing',
    run: async () => callback({ state: (await flow()).state, code: 'code-b' }, ''),
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=cookie_missing$/,
  });
  cases.push({
    name: 'cookie mismatch',
    run: async () => callback({ state: (await flow()).state, code: 'code-c' }, 'bait_oauth=someone-else'),
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=cookie_mismatch$/,
  });
  cases.push({
    name: 'cancelled',
    run: async () => {
      const started = await flow();
      return callback({ state: started.state, error: 'access_denied', error_description: 'denied code-x' }, started.oauth);
    },
    location: '/?notice=cancelled',
    line: /^OAuth sign-in failed: flow=broadcaster reason=cancelled twitch_error=access_denied$/,
  });
  cases.push({
    name: 'token exchange',
    run: async () => {
      twitch.tokenStatus = 400;
      const started = await flow();
      return callback({ state: started.state, code: 'code-d' }, started.oauth).finally(() => (twitch.tokenStatus = 200));
    },
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=token_exchange status=400 error=TwitchHttpError$/,
  });
  cases.push({
    name: 'scope missing',
    run: async () => {
      twitch.scopes = [];
      const started = await flow();
      return callback({ state: started.state, code: 'code-e' }, started.oauth).finally(() => (twitch.scopes = ['user:read:chat']));
    },
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=scope_missing error=ScopeMissing$/,
  });
  cases.push({
    name: 'user lookup',
    run: async () => {
      twitch.userStatus = 503;
      const started = await flow();
      return callback({ state: started.state, code: 'code-f' }, started.oauth).finally(() => (twitch.userStatus = 200));
    },
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=user_lookup status=503 error=TwitchHttpError$/,
  });
  cases.push({
    name: 'superseded',
    run: async () => {
      // The account is disconnected while Twitch is still answering.
      twitch.duringLookup = () => void bait.auth.invalidate('123');
      const started = await flow();
      return callback({ state: started.state, code: 'code-g' }, started.oauth).finally(() => (twitch.duringLookup = undefined));
    },
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=superseded error=AuthSuperseded$/,
  });
  cases.push({
    name: 'store failure',
    run: async () => {
      const save = t.mock.method(bait.store, 'setCredentials', async () => {
        throw new Error('disk full');
      });
      const started = await flow();
      return callback({ state: started.state, code: 'code-h' }, started.oauth).finally(() => save.mock.restore());
    },
    location: '/?notice=oauth',
    line: /^OAuth sign-in failed: flow=broadcaster reason=store_failed error=StoreFailed cause=Error$/,
  });
  cases.push({
    name: 'bot account mismatch',
    run: async () => {
      twitch.userId = '555';
      twitch.scopes = ['user:write:chat', 'user:bot'];
      const started = await flow('/auth/twitch/bot');
      return callback({ state: started.state, code: 'code-i' }, started.oauth).finally(() => {
        twitch.userId = '123';
        twitch.scopes = ['user:read:chat'];
      });
    },
    location: '/?notice=bot-account',
    line: /^OAuth sign-in failed: flow=bot reason=bot_account_mismatch received=555 expected=999 error=BotAccountMismatch$/,
  });
  for (const item of cases) {
    const { result, lines } = await logged(t, item.run);
    assert.equal(result.location, item.location, item.name);
    assert.equal(lines.length, 1, `${item.name}: ${lines.join(' | ')}`);
    assert.match(lines[0], item.line, item.name);
    for (const secret of [...never, ...secrets]) assert.ok(!lines[0].includes(secret), `${item.name} logged ${secret}`);
  }
});

test('an expired sign-in is logged as expired', async (t) => {
  const { begin, callback } = await oauthServer(t);
  const started = await begin('/auth/twitch');
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 601000);
  const { result, lines } = await logged(t, () => callback({ state: started.state, code: 'code-1' }, started.oauth));
  assert.equal(result.location, '/?notice=oauth');
  assert.deepEqual(lines, ['OAuth sign-in failed: flow=broadcaster reason=state_expired']);
});

test('a bot sign-in that loses its pending state lands on the bot notice', async (t) => {
  const { begin, callback } = await oauthServer(t);
  const bot = await begin('/auth/twitch/bot');
  assert.match(bot.state, /^bot\./, 'the bot flow is marked in its state');
  assert.doesNotMatch((await begin('/auth/twitch')).state, /^bot\./);
  // The backend restarted mid-flow, so the pending entry for this state is gone.
  const { result, lines } = await logged(t, () => callback({ state: 'bot.lost-after-restart', code: 'code-1' }, bot.oauth));
  assert.equal(result.location, '/?notice=bot-oauth');
  assert.deepEqual(lines, ['OAuth sign-in failed: flow=bot reason=state_missing']);
  // Other bot-flow failures send the operator back to the bot sign-in too.
  const cancelled = await begin('/auth/twitch/bot');
  const declined = await logged(t, () => callback({ state: cancelled.state, error: 'access_denied' }, cancelled.oauth));
  assert.equal(declined.result.location, '/?notice=bot-oauth');
});

test('the chat bot account cannot sign in as a streamer and get its own room', async (t) => {
  const { twitch, begin, callback, store, bait } = await oauthServer(t);
  twitch.userId = '999';
  const started = await begin('/auth/twitch');
  const { result, lines } = await logged(t, () => callback({ state: started.state, code: 'code-1' }, started.oauth));
  assert.equal(result.location, '/?notice=bot-as-streamer');
  assert.equal(result.session, '', 'no studio session');
  assert.deepEqual(lines, ['OAuth sign-in failed: flow=broadcaster reason=bot_as_streamer received=999 error=BotAsStreamer']);
  assert.equal(store.credentials('999'), undefined, 'no grant stored');
  assert.equal([...bait.rooms.values()].some((game) => game.data.owner === '999'), false, 'no room');
  assert.deepEqual(twitch.revoked, [], "the bot's own grant is never put at risk");
});

test('TWITCH_BOT_IS_STREAMER=1 lets a streamer use their own account as the bot', async (t) => {
  const { twitch, begin, callback, store, bait } = await oauthServer(t, { env: { TWITCH_BOT_IS_STREAMER: '1' } });
  twitch.userId = '999';
  const started = await begin('/auth/twitch');
  const signedIn = await callback({ state: started.state, code: 'code-1' }, started.oauth);
  assert.equal(signedIn.location, '/');
  assert.ok(signedIn.session);
  assert.equal(store.credentials('999')?.userId, '999');
  assert.equal([...bait.rooms.values()].some((game) => game.data.owner === '999'), true);
  assert.deepEqual(twitch.revoked, []);
});
