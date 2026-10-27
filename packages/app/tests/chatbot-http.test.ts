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
  assert.equal(studio.room.settings.chatBot, false);
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
  assert.match(studio.chatBot.recent[0].text, /Round 1 is live/);
  assert.equal(studio.chatBot.recent[0].status, 'preview');
  assert.equal(matches(JSON.stringify(studio.chatBot), word), false);

  await json('/api/demo/chat', { name: 'mod_one', text: '!bait pause', moderator: true }, csrf, cookie);
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.equal(studio.room.phase, 'paused');
  // The pause announcement waits out the per-channel gap, then the ticker posts it.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
  assert.match(studio.chatBot.recent[0].text, /Round paused/);
  assert.equal(matches(JSON.stringify(studio.chatBot), word), false);
  // Public projections never carry the bot's feed.
  const publicView = await (await json(`/api/rooms/${studio.room.id}/viewer`)).text();
  assert.doesNotMatch(publicView, /"recent"|Round paused/);
});
