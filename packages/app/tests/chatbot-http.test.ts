import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { matches } from '../server/game.js';
import type { Studio } from '../shared/types.js';
import { defaults } from '../server/game.js';
import { Store, type Credentials } from '../server/store.js';
import { botKey } from '../server/twitch.js';

async function serve(t: { after: (fn: () => Promise<void>) => void }, env: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'bait-bot-http-'));
  const config = loadConfig({ PORT: '0', DATA_DIR: dir, ...env });
  const bait = await createBait(config);
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bait.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  return { bait, base, config };
}
const twitchEnv = {
  TWITCH_CLIENT_ID: 'client-test',
  TWITCH_CLIENT_SECRET: 'secret-test',
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
};

test('bot sign-in and channel permission ask Twitch for exactly their own scopes', async (t) => {
  const plain = await serve(t);
  const unavailable = await fetch(`${plain.base}/auth/twitch/bot`, { redirect: 'manual' });
  assert.equal(unavailable.headers.get('location'), '/?notice=bot-setup');

  const { base, config } = await serve(t, { ...twitchEnv, TWITCH_BOT_USER_ID: '999' });
  const scopes = async (path: string) => {
    const r = await fetch(base + path, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('set-cookie') ?? '', /bait_oauth=.*HttpOnly/);
    const url = new URL(r.headers.get('location')!);
    assert.equal(url.origin + url.pathname, 'https://id.twitch.tv/oauth2/authorize');
    assert.equal(url.searchParams.get('redirect_uri'), config.callback);
    return url.searchParams.get('scope');
  };
  assert.equal(await scopes('/auth/twitch'), 'user:read:chat');
  assert.equal(await scopes('/auth/twitch?bot=1'), 'user:read:chat channel:bot');
  assert.equal(await scopes('/auth/twitch/bot'), 'user:write:chat user:bot');
  // Without a bot account, a streamer is never asked for channel:bot.
  const noBot = await serve(t, twitchEnv);
  const r = await fetch(`${noBot.base}/auth/twitch?bot=1`, { redirect: 'manual' });
  assert.equal(new URL(r.headers.get('location')!).searchParams.get('scope'), 'user:read:chat');
});

test('demo studio previews bot posts and accepts moderator commands from simulated chat', async (t) => {
  const { bait, base, config } = await serve(t);
  const json = (path: string, body?: unknown, csrf?: string, cookie?: string) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: config.origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const start = await json('/api/demo/start', {});
  const cookie = start.headers.get('set-cookie')!.split(';')[0];
  const csrf = (await start.json()).csrf;
  let studio = (await (await json('/api/studio', undefined, undefined, cookie)).json()) as Studio;
  assert.equal(studio.room.settings.chatBot, true);
  assert.equal(studio.room.settings.modCommands, false);
  assert.deepEqual(studio.chatBot, {
    mode: 'demo',
    name: null,
    channelAllowed: true,
    problem: null,
    recent: [],
  });
  assert.equal(
    (await json('/api/studio/settings', { ...studio.room.settings, chatBot: 'yes' }, csrf, cookie)).status,
    400,
  );
  studio = await (
    await json('/api/studio/settings', { ...studio.room.settings, chatBot: true, modCommands: true }, csrf, cookie)
  ).json();
  assert.equal(studio.room.settings.chatBot, true);
  assert.equal(studio.room.settings.modCommands, true);

  // A moderator starts the round from chat; the preview shows the announcement without the word.
  const viewer = await (
    await json('/api/demo/chat', { name: 'viewer_one', text: '!bait start' }, csrf, cookie)
  ).json();
  assert.deepEqual(viewer, { accepted: false, command: true });
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.equal(studio.room.phase, 'idle');
  await json('/api/demo/chat', { name: 'mod_one', text: '!bait start', moderator: true }, csrf, cookie);
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.equal(studio.room.phase, 'active');
  const word = bait.rooms.get(studio.room.id)!.round!.word;
  assert.match(studio.chatBot.recent[0].text, /round 1\b/i);
  assert.equal(studio.chatBot.recent[0].status, 'preview');
  assert.equal(matches(JSON.stringify(studio.chatBot), word), false);

  await json('/api/demo/chat', { name: 'mod_one', text: '!bait pause', moderator: true }, csrf, cookie);
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.equal(studio.room.phase, 'paused');
  // The pause announcement waits out the per-channel gap, then the ticker posts it.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.match(studio.chatBot.recent[0].text, /the clock is frozen/i);
  assert.equal(matches(JSON.stringify(studio.chatBot), word), false);
  // Public projections never carry the bot's feed.
  const publicView = await (await json(`/api/rooms/${studio.room.id}/viewer`)).text();
  assert.doesNotMatch(publicView, /"recent"|clock is frozen/i);
});

const grant = (patch: Partial<Credentials> = {}): Credentials => ({
  access_token: 'owner-access',
  refresh_token: 'owner-refresh',
  expiresAt: Date.now() + 3600000,
  userId: '123',
  login: 'bait_channel',
  name: 'Bait_Channel',
  scope: ['user:read:chat', 'channel:bot'],
  ...patch,
});

test('a revoked streamer authorization forgets the bot feed and anything queued for that channel', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-bot-revoke-'));
  const seed = new Store(dir, twitchEnv.TOKEN_ENCRYPTION_KEY);
  await seed.load();
  await seed.setCredentials('123', grant());
  await seed.setCredentials(
    botKey('999'),
    grant({ access_token: 'bot-access', userId: '999', login: 'baitedbot', name: 'BaitedBot', scope: ['user:write:chat', 'user:bot'] }),
  );
  seed.snapshot.rooms = [
    {
      id: 'room-revoked',
      owner: '123',
      channel: 'bait_channel',
      mode: 'twitch',
      overlayKey: 'overlay-secret',
      settings: { ...defaults, chatBot: true },
      history: [],
      priorWins: 0,
      priorPlayed: 0,
      priorBest: 0,
      leaders: {},
    },
  ];
  await seed.save();
  await seed.flush();
  // Startup validation of the streamer waits until the test lets Twitch answer 401.
  let revoke!: () => void;
  const revoked = new Promise<void>((resolve) => (revoke = resolve));
  const posts: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
    if (url.endsWith('/oauth2/validate')) {
      const bot = (init?.headers as Record<string, string>).Authorization === 'OAuth bot-access';
      if (!bot) {
        await revoked;
        return new Response('', { status: 401 });
      }
      return Response.json({ client_id: 'client-test', user_id: '999', login: 'baitedbot', expires_in: 3600, scopes: ['user:write:chat', 'user:bot'] });
    }
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'app-token', expires_in: 3600 });
    if (url.endsWith('/helix/chat/messages')) {
      posts.push(JSON.parse(String(init?.body)).message);
      return Response.json({ data: [{ message_id: `m-${posts.length}`, is_sent: true, drop_reason: null }] });
    }
    return new Response('', { status: 200 });
  }) as typeof fetch;
  const config = loadConfig({ PORT: '0', DATA_DIR: dir, ...twitchEnv, TWITCH_BOT_USER_ID: '999' });
  const bait = await createBait(config);
  t.after(async () => {
    revoke();
    await bait.startupValidation.catch(() => {});
    await bait.close();
    globalThis.fetch = realFetch;
    await rm(dir, { recursive: true, force: true });
  });
  const game = bait.rooms.get('room-revoked')!;
  const chat = (id: string, userId: string, text: string) =>
    bait.bot.chat(game, { id, userId, name: userId, text, badges: [], at: Date.now() });
  chat('m1', 'viewer-1', '!bait help');
  for (let i = 0; i < 20 && !bait.bot.status(game).recent.length; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(posts.length, 1);
  assert.equal(bait.bot.status(game).recent.length, 1);
  // Queued inside the per-channel gap, then the streamer's grant turns out to be revoked.
  chat('m2', 'viewer-2', '!bait score');
  revoke();
  await bait.startupValidation;
  assert.match(game.connection.detail ?? '', /Authorization revoked/);
  assert.deepEqual(bait.bot.status(game).recent, [], 'the studio feed for that channel is forgotten');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(posts.length, 1, 'nothing queued before the revocation goes out');
});
