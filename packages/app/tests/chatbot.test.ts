import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game, defaults, matches, spoils, type GameEvent, type SavedGame } from '../server/game.js';
import { words } from '../server/words.js';
import { Store, type Credentials } from '../server/store.js';
import { loadConfig } from '../server/config.js';
import { ChatBot, LIMITS } from '../server/chatbot.js';
import {
  badgeAnnouncement,
  eventAnnouncement,
  finalAnnouncement,
  halfwayAnnouncement,
  helpText,
  parseCommand,
  scoreText,
  streakText,
  strugglingAnnouncement,
  topText,
  whoText,
} from '../server/chat-copy.js';
import { lines, shouting } from '../server/baity.js';
import {
  AuthRevoked,
  BotAccountMismatch,
  TwitchAuth,
  TwitchConnection,
  botKey,
  type ChatMessage,
} from '../server/twitch.js';
import { fixture } from './fixtures.js';
import { matchesCustomTarget } from '../shared/card-library.js';

const key = 'ab'.repeat(32);
const flush = async (times = 6) => {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setImmediate(resolve));
};
const saved = (patch: Partial<SavedGame> = {}): SavedGame => ({
  id: 'room-bot',
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
  ...patch,
});
const credentials = (patch: Partial<Credentials> = {}): Credentials => ({
  access_token: 'user-access',
  refresh_token: 'user-refresh',
  expiresAt: Date.now() + 3600000,
  userId: '123',
  login: 'bait_channel',
  name: 'Bait_Channel',
  scope: ['user:read:chat', 'channel:bot'],
  ...patch,
});
const message = (text: string, patch: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `message-${Math.random()}`,
  userId: 'viewer-1',
  name: 'Viewer',
  text,
  badges: [],
  at: Date.now(),
  ...patch,
});
async function tempStore(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), 'bait-bot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(dir, key);
  await store.load();
  return store;
}

test('!bait alone still joins; named commands parse strictly', () => {
  assert.equal(parseCommand('!bait'), 'join');
  assert.equal(parseCommand('  !BAIT  '), 'join');
  assert.equal(parseCommand('!bait help'), 'help');
  assert.equal(parseCommand('!bait rules'), 'help');
  assert.equal(parseCommand('!bait Score'), 'score');
  assert.equal(parseCommand('!bait top'), 'top');
  assert.equal(parseCommand('!bait who'), 'who');
  assert.equal(parseCommand('!bait Baity'), 'who');
  for (const name of ['start', 'pause', 'resume'] as const) assert.equal(parseCommand(`!bait ${name}`), name);
  for (const text of ['!bait nonsense', '!baited', '!bait start now', 'hello !bait', '!skip', 'bait help'])
    assert.equal(parseCommand(text), null, text);
});

test('pending catch posts explain automatic scoring and expire at its deadline', () => {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript(), 'confirm');
  const view = f.game.view('overlay');
  const post = eventAnnouncement(view, { type: 'review' });
  assert.ok(post);
  assert.match(post.text, /Counts in 15s unless rejected\./);
  assert.equal(post.ttl, 15000);
  assert.equal(matches(post.text, f.game.round!.word), false);
  assert.equal(eventAnnouncement({ ...view, serverTime: view.result!.confirmAt! }, { type: 'review' }), null);
  const legacy = { ...view, result: { ...view.result!, confirmAt: undefined } };
  assert.doesNotMatch(eventAnnouncement(legacy, { type: 'review' })!.text, /Counts in/);
});

test('no announcement during a round contains its word, for every target', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const)
    for (let i = 0; i < words[difficulty].length; i++) {
      let time = 100000;
      const game = new Game(
        saved({ mode: 'demo', settings: { ...defaults, difficulty, callBait: true, duration: 120 } }),
        () => time,
        () => i,
      );
      const texts: string[] = [];
      game.onEvent = (event: GameEvent) => {
        const announcement = eventAnnouncement(game.view('overlay'), event);
        if (announcement) texts.push(announcement.text);
      };
      game.data.leaders = { 'viewer-1': { name: 'Viewer', rounds: 2, baits: 1 } };
      game.begin();
      const word = game.round!.word;
      const view = () => game.view('overlay');
      texts.push(halfwayAnnouncement(view())!.text, finalAnnouncement(view()).text, helpText(view()), whoText(view()));
      texts.push(scoreText(view()), topText(view()), streakText(view()));
      assert.equal(game.chat('m1', 'viewer-1', 'Viewer', '!skip', time), true);
      game.pause();
      game.resume();
      game.guess(game.round!.id, game.round!.epoch, word === 'zzz' ? 'yyy' : 'zzz');
      time += 1000;
      const round = game.round!;
      game.transcript(
        { roundId: round.id, epoch: round.epoch, text: word, final: true, confidence: 0.99, capturedAt: time, id: 'catch' },
        'confirm',
      );
      game.decideCatch(round.id, 'reject');
      assert.ok(texts.length >= 10, `${word}: ${texts.length} messages`);
      for (const text of texts) assert.equal(matches(text, word), false, `${word} leaked: ${text}`);
    }
});

test("none of Baity's lines can say a target word, in any mood", () => {
  const all = Object.values(lines as Record<string, readonly string[] | Record<string, readonly string[]>>).flatMap(
    (set) => (Array.isArray(set) ? set : Object.values(set).flat()),
  );
  assert.ok(all.length > 150);
  for (const difficulty of ['easy', 'medium', 'hard'] as const)
    for (const word of words[difficulty])
      for (const line of all)
        assert.equal(spoils(line.replace(/\{\w+\}/g, ' '), word), false, `${word} in: ${line}`);
});

// Twitch chat is plain text: Baity keeps her voice in words and punctuation, never in
// emoji or pictographs, and signs as Baeittrice without an em dash.
const pictograph = /[\u{2190}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE0F}]/u;

test("Baity's lines and every chat-copy post are free of emoji", () => {
  const all = Object.values(lines as Record<string, readonly string[] | Record<string, readonly string[]>>).flatMap(
    (set) => (Array.isArray(set) ? set : Object.values(set).flat()),
  );
  for (const line of all) {
    assert.doesNotMatch(line, pictograph, `emoji in: ${line}`);
    assert.doesNotMatch(line, /\u2014/, `em dash in: ${line}`);
  }
  const f = fixture();
  f.game.data.leaders = { a: { name: 'Alex', rounds: 9, baits: 2 } };
  const texts: string[] = [];
  f.game.onEvent = (event) => {
    const view = f.game.view('overlay');
    const announcement = eventAnnouncement(view, event);
    if (announcement) texts.push(announcement.text);
    const badge = event.type === 'finish' ? badgeAnnouncement(view) : null;
    if (badge) texts.push(badge.text);
  };
  const commands = () => {
    const view = f.game.view('overlay');
    texts.push(helpText(view), whoText(view), scoreText(view), topText(view), streakText(view));
  };
  // Every mood: three wins for the streak badges, then four losses into Baeittrice and a comeback.
  for (const win of [true, true, true, false, false, false, false, true]) {
    f.game.begin();
    const view = f.game.view('overlay');
    texts.push(halfwayAnnouncement(view)!.text, finalAnnouncement(view).text);
    const struggling = strugglingAnnouncement(view);
    if (struggling) texts.push(struggling.text);
    f.game.pause();
    f.game.resume();
    commands();
    if (win) f.game.transcript(f.transcript());
    else {
      f.advance(f.game.round!.duration + 1);
      f.game.tick();
    }
    commands();
    f.advance(60000);
  }
  assert.ok(texts.length > 80, `${texts.length} posts`);
  for (const text of texts) assert.doesNotMatch(text, pictograph, `emoji in: ${text}`);
});

test('!bait top shows the bait MVPs once the streamer has picked someone', () => {
  const f = fixture();
  f.game.data.leaders = { a: { name: 'Alex', rounds: 9 }, b: { name: 'Blake', rounds: 2, baits: 2 } };
  const top = () => topText(f.game.view('overlay'));
  assert.match(top(), /MVP.*1\. Blake \(2 picks\)/);
  assert.doesNotMatch(top(), /Alex/);
  f.game.data.leaders.b.baits = 0;
  assert.match(top(), /1\. Alex \(9 rounds\) · 2\. Blake \(2 rounds\)/);
});

test('Baity gets louder while chat loses, and cute again when chat wins', () => {
  const f = fixture();
  const texts: string[] = [];
  f.game.onEvent = (event) => {
    const announcement = eventAnnouncement(f.game.view('overlay'), event);
    if (announcement) texts.push(announcement.text);
  };
  const timeOut = () => {
    f.advance(f.game.round!.duration + 1);
    f.game.tick();
  };
  f.game.begin();
  assert.equal(shouting(texts.at(-1)!), false, 'a fresh room starts cute');
  assert.equal(strugglingAnnouncement(f.game.view('overlay')), null, 'no struggling before a loss');
  for (let losses = 1; losses <= 3; losses++) {
    timeOut();
    assert.ok(shouting(texts.at(-1)!), `loss ${losses} is shouted: ${texts.at(-1)}`);
    f.advance(60000);
    f.game.begin();
    assert.ok(shouting(texts.at(-1)!), `the round after loss ${losses} is shouted: ${texts.at(-1)}`);
    assert.ok(shouting(strugglingAnnouncement(f.game.view('overlay'))!.text));
  }
  assert.match(texts.at(-2)!, /BAEITTRICE/, 'the third loss in a row is Baeittrice');
  assert.match(whoText(f.game.view('overlay')), /BAEITTRICE/);
  f.game.transcript(f.transcript());
  assert.equal(shouting(texts.at(-1)!), false, `the comeback is cute: ${texts.at(-1)}`);
  assert.match(texts.at(-1)!, /the bow is back on|all the yelling|Baity is back/);
  f.advance(60000);
  f.game.begin();
  assert.equal(shouting(texts.at(-1)!), false, 'a win resets the mood');
});

test('finished words are announced only for caught and escaped rounds, like OBS', () => {
  const f = fixture();
  const texts: string[] = [];
  f.game.onEvent = (event) => {
    const announcement = eventAnnouncement(f.game.view('overlay'), event);
    if (announcement) texts.push(announcement.text);
  };
  f.game.begin();
  let word = f.game.round!.word;
  f.game.transcript(f.transcript());
  assert.match(texts.at(-1)!, new RegExp(`said ${word.toUpperCase()} after`));
  for (const outcome of ['skipped', 'ended'] as const) {
    f.advance(60000);
    f.game.begin();
    word = f.game.round!.word;
    f.game.end(outcome);
    assert.equal(matches(texts.at(-1)!, word), false, texts.at(-1));
  }
  f.advance(60000);
  f.game.begin();
  word = f.game.round!.word;
  f.advance(f.game.round!.duration + 1);
  f.game.tick();
  assert.match(texts.at(-1)!, new RegExp(`WAS ${word.toUpperCase()}`));
});

test('custom targets and aliases are withheld from Baity posts until the result is public', async (t) => {
  const store = await tempStore(t);
  for (const [target, aliases] of [['word', []], ['quokka', ['word']]] as [string, string[]][]) {
    const f = fixture();
    f.game.data.settings.chatBot = true;
    f.game.deckFor = () => [{ target, acceptedSpellings: aliases, difficulty: 'medium', blockedClues: ['clue', 'hint'] }];
    const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: f.now });
    f.game.onEvent = (event) => bot.event(f.game, event);
    f.game.begin();
    assert.equal(bot.status(f.game).recent.length, 0, 'the start line would say the target or its alias');
    bot.chat(f.game, message('!bait help'));
    f.advance(61000); bot.tick(f.game);
    f.game.pause(); f.advance(LIMITS.channelGap); bot.tick(f.game);
    f.game.resume(); f.advance(LIMITS.channelGap); bot.tick(f.game);
    f.game.transcript(f.transcript(), 'confirm');
    f.advance(LIMITS.channelGap); bot.tick(f.game);
    for (const post of bot.status(f.game).recent)
      assert.equal(matchesCustomTarget(post.text, target, aliases), false, post.text);
    f.game.decideCatch(f.game.round!.id, 'confirm');
    f.advance(LIMITS.channelGap); bot.tick(f.game);
    assert.ok(bot.status(f.game).recent.some((post) => matches(post.text, target)), 'a confirmed catch may reveal its target');
  }
});

test('queued replies are checked against the newly selected card before delivery', async (t) => {
  const store = await tempStore(t), f = fixture();
  f.game.data.settings.chatBot = true;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: f.now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  f.game.begin();
  bot.chat(f.game, message('!bait help'));
  const oldPosts = new Set(bot.status(f.game).recent.map((post) => post.id));
  f.game.end('ended'); f.advance(11000);
  f.game.deckFor = () => [{ target: 'word', acceptedSpellings: [], difficulty: 'medium', blockedClues: ['clue', 'hint'] }];
  f.game.begin();
  f.advance(LIMITS.channelGap); bot.tick(f.game);
  for (const post of bot.status(f.game).recent.filter((post) => !oldPosts.has(post.id)))
    assert.equal(matches(post.text, 'word'), false, post.text);
});

test('demo rooms preview posts in the studio with Twitch pacing and newest-wins coalescing', async (t) => {
  const store = await tempStore(t);
  let now = 1_000_000;
  const f = fixture();
  f.game.data.settings.chatBot = true;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: () => now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  const recent = () => bot.status(f.game).recent;
  assert.equal(bot.status(f.game).mode, 'demo');
  f.game.begin();
  assert.equal(recent().length, 1);
  assert.equal(recent()[0].status, 'preview');
  assert.match(recent()[0].text, /round 1\b.*2:00 on the clock/i);
  // Within the per-channel gap, state changes coalesce to the latest one.
  f.game.pause();
  f.game.resume();
  f.game.pause();
  bot.tick(f.game);
  assert.equal(recent().length, 1);
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, 2);
  assert.match(recent()[0].text, /^(round )?paused[.!] the clock is frozen/i);
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, 2);
  // At most channelCount posts per window, however many keys are waiting.
  for (const [i, text] of ['!bait help', '!bait score', '!bait top'].entries())
    bot.chat(f.game, message(text, { userId: `viewer-${i}` }));
  // The same command again inside its cooldown gets no second answer.
  bot.chat(f.game, message('!bait help', { userId: 'viewer-9' }));
  for (let i = 0; i < 4; i++) {
    now += LIMITS.channelGap;
    bot.tick(f.game);
  }
  assert.equal(recent().length, 5);
  f.game.resume();
  f.game.pause();
  f.game.resume();
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, LIMITS.channelCount);
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, LIMITS.channelCount);
  // Messages expire instead of arriving late.
  now += LIMITS.channelWindow;
  bot.tick(f.game);
  assert.equal(recent().length, LIMITS.channelCount);
  assert.equal(recent().filter((post) => post.text.endsWith('!bait top · !bait who')).length, 1);
  assert.ok(recent().every((post) => !matches(post.text, f.game.round!.word)));
});

test('one chatter cycling commands gets one answer, and replies never crowd out announcements', async (t) => {
  const store = await tempStore(t);
  let now = 3_000_000;
  const f = fixture();
  f.game.data.settings.chatBot = true;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: () => now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  const recent = () => bot.status(f.game).recent;
  const step = () => {
    now += LIMITS.channelGap;
    bot.tick(f.game);
  };
  f.game.begin();
  assert.equal(recent().length, 1);
  // Cycling every command from one account earns a single answer per cooldown.
  for (const text of ['!bait help', '!bait score', '!bait streak', '!bait top', '!bait who'])
    bot.chat(f.game, message(text, { userId: 'cycler' }));
  for (let i = 0; i < 5; i++) step();
  assert.equal(recent().length, 2);
  assert.match(recent()[0].text, /!bait top · !bait who$/);
  // Other chatters fill the reply lane; a round post that arrives after them goes out first.
  for (const [i, text] of ['!bait score', '!bait streak', '!bait top', '!bait who'].entries())
    bot.chat(f.game, message(text, { userId: `viewer-${i}` }));
  f.game.pause();
  step();
  assert.match(recent()[0].text, /the clock is frozen/i);
  for (let i = 0; i < 6; i++) step();
  // Replies use at most their share of the channel budget, so a result still has room.
  assert.equal(recent().length, 2 + LIMITS.channelReplyCount);
  f.game.resume();
  step();
  assert.equal(recent().length, LIMITS.channelCount);
  assert.match(recent()[0].text, /^(back on|unpaused)\b/i);
  // The cycler can ask again once their own cooldown has passed.
  now += LIMITS.chatterCooldown;
  bot.chat(f.game, message('!bait score', { userId: 'cycler' }));
  step();
  assert.match(recent()[0].text, /^(chat's record|scoreboard): /);
});

test('a flood in three channels cannot hold back a fourth channel', async (t) => {
  const store = await tempStore(t);
  const owners = ['1', '2', '3', '4'];
  for (const owner of owners)
    await store.setCredentials(owner, credentials({ userId: owner, login: `channel${owner}`, name: `Channel${owner}` }));
  await store.setCredentials(
    botKey('999'),
    credentials({ userId: '999', login: 'baitedbot', name: 'BaitedBot', scope: ['user:write:chat', 'user:bot'] }),
  );
  const config = loadConfig({
    TWITCH_CLIENT_ID: 'client-test',
    TWITCH_CLIENT_SECRET: 'secret-test',
    TOKEN_ENCRYPTION_KEY: key,
    TWITCH_BOT_USER_ID: '999',
  });
  let now = 11_000_000;
  const posts: { at: number; channel: string; text: string }[] = [];
  const bot = new ChatBot({
    config,
    store,
    ready: () => null,
    clock: () => now,
    fetcher: (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/oauth2/token')) return tokenReply();
      const body = JSON.parse(String(init?.body));
      posts.push({ at: now, channel: body.broadcaster_id, text: body.message });
      return sent();
    }) as typeof fetch,
  });
  const games = owners.map((owner) => {
    const game = new Game(saved({ id: `room-${owner}`, owner, channel: `channel${owner}` }));
    game.onEvent = (event) => bot.event(game, event);
    return game;
  });
  const enqueue = (bot as unknown as { enqueue: (game: Game, announcement: { key: string; text: string; ttl: number }) => void })
    .enqueue.bind(bot);
  // Fetch the app token first, so each post is timed when the scheduler sends it.
  await (bot as unknown as { token: (force: boolean) => Promise<string> }).token(false);
  let load = 0;
  const flood = async () => {
    for (const game of games.slice(0, 3))
      for (let i = 0; i < 2; i++) enqueue(game, { key: `load-${load++}`, text: `load ${load}`, ttl: 30000 });
    await flush();
  };
  const step = async (ms = 100) => {
    now += ms;
    for (const game of games) bot.tick(game);
    await flush();
  };
  // The first three channels flood for ten seconds and use every slot they can.
  for (let i = 0; i < 100; i++) {
    if (i % 5 === 0) await flood();
    await step();
  }
  const flooded = posts.length;
  assert.ok(flooded >= LIMITS.globalCount - LIMITS.globalReserve, `${flooded} posts`);
  // The fourth channel's round post goes out within a few seconds, not after a full window.
  const quiet = games[3];
  const before = now;
  enqueue(quiet, { key: 'start', text: 'round 1 is live', ttl: 20000 });
  await flush();
  for (let i = 0; i < 30 && !posts.some((post) => post.channel === '4'); i++) {
    await flood();
    await step();
  }
  const fourth = posts.find((post) => post.channel === '4');
  assert.ok(fourth, 'the fourth channel posted');
  assert.ok(fourth.at - before <= 3000, `waited ${fourth.at - before} ms`);
  // Keep flooding for two more windows: every Twitch limit still holds.
  for (let i = 0; i < 600; i++) {
    if (i % 5 === 0) await flood();
    await step();
  }
  for (const post of posts) {
    const window = posts.filter((other) => other.at > post.at - LIMITS.globalWindow && other.at <= post.at);
    assert.ok(window.length <= LIMITS.globalCount, `${window.length} posts in 30 s`);
    const channel = window.filter((other) => other.channel === post.channel);
    assert.ok(channel.length <= LIMITS.channelCount, `${channel.length} posts in one channel in 30 s`);
    const previous = posts.filter((other) => other.channel === post.channel && other.at < post.at).at(-1);
    if (previous) assert.ok(post.at - previous.at >= LIMITS.channelGap, `posts stay apart: ${post.channel} ${previous.at} ${post.at}`);
  }
});

test('timer nudges fire once per round: halfway and the final ten seconds', async (t) => {
  const store = await tempStore(t);
  const f = fixture();
  f.game.data.settings.chatBot = true;
  let now = 5_000_000;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: () => now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  f.game.begin();
  const step = (ms: number) => {
    f.advance(ms);
    now += ms;
    f.game.tick();
    bot.tick(f.game);
  };
  step(59000);
  assert.equal(bot.status(f.game).recent.length, 1);
  step(2000);
  assert.match(bot.status(f.game).recent[0].text, /^halfway.*0:59.*nobody is baiting yet/i);
  step(2000);
  step(46000);
  assert.equal(bot.status(f.game).recent.length, 2, 'a chat that has not lost gets no struggling nudge');
  step(2000);
  assert.match(bot.status(f.game).recent[0].text, /^(10|ten) seconds/i);
  step(1000);
  assert.equal(bot.status(f.game).recent.length, 3);
});

test('a losing chat gets one struggling nudge three quarters in', async (t) => {
  const store = await tempStore(t);
  const f = fixture();
  f.game.data.settings.chatBot = true;
  let now = 7_000_000;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => null, clock: () => now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  const step = (ms: number) => {
    f.advance(ms);
    now += ms;
    f.game.tick();
    bot.tick(f.game);
  };
  f.game.begin();
  step(f.game.round!.duration + 1);
  step(60000);
  f.game.begin();
  step(61000);
  assert.match(bot.status(f.game).recent[0].text, /^HALFWAY/);
  step(29000);
  const struggling = bot.status(f.game).recent[0].text;
  assert.match(struggling, /0:30 LEFT/);
  assert.ok(shouting(struggling));
  step(5000);
  assert.equal(bot.status(f.game).recent[0].text, struggling, 'once per round');
});

function twitchBot(
  t: { after: (fn: () => Promise<void>) => void },
  respond: (url: string, init: RequestInit | undefined, now: number) => Response | Promise<Response>,
  options: { channelBot?: boolean; botAuthorized?: boolean; botId?: string } = {},
) {
  return (async () => {
    const store = await tempStore(t);
    await store.setCredentials(
      '123',
      credentials(options.channelBot === false ? { scope: ['user:read:chat'] } : {}),
    );
    if (options.botAuthorized !== false)
      await store.setCredentials(
        botKey('999'),
        credentials({ userId: '999', login: 'baitedbot', name: 'BaitedBot', scope: ['user:write:chat', 'user:bot'] }),
      );
    const config = loadConfig({
      TWITCH_CLIENT_ID: 'client-test',
      TWITCH_CLIENT_SECRET: 'secret-test',
      TOKEN_ENCRYPTION_KEY: key,
      ...(options.botId === '' ? {} : { TWITCH_BOT_USER_ID: options.botId ?? '999' }),
    });
    let now = 9_000_000;
    const calls: { url: string; init?: RequestInit }[] = [];
    const bot = new ChatBot({
      config,
      store,
      ready: () => null,
      clock: () => now,
      fetcher: (async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return respond(String(url), init, now);
      }) as typeof fetch,
    });
    const game = new Game(saved());
    game.onEvent = (event) => bot.event(game, event);
    return { bot, game, calls, store, advance: (ms: number) => (now += ms) };
  })();
}
const tokenReply = () => Response.json({ access_token: 'app-token', expires_in: 3600, token_type: 'bearer' });
const sent = (isSent = true, drop: { code: string; message: string } | null = null) =>
  Response.json({ data: [{ message_id: isSent ? 'msg-1' : '', is_sent: isSent, drop_reason: drop }] });

test('a token refresh cannot deliver a queued message that spoils the next card', async (t) => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { release = resolve; });
  const { game, calls, bot } = await twitchBot(t, (url) => url.endsWith('/oauth2/token') ? pending : sent());
  game.begin();
  assert.equal(calls.filter((call) => call.url.endsWith('/oauth2/token')).length, 1);
  game.end('ended');
  game.nextAt = 0;
  game.deckFor = () => [{ target: 'word', acceptedSpellings: [], difficulty: 'medium', blockedClues: ['clue', 'hint'] }];
  game.begin();
  release(tokenReply());
  await flush();
  assert.equal(calls.filter((call) => call.url.endsWith('/helix/chat/messages')).length, 0);
  assert.equal(bot.status(game).recent.length, 0);
  assert.equal(bot.status(game).problem, null);
});

test('Twitch delivery uses an app token, the bot as sender, and refreshes once on 401', async (t) => {
  let posts = 0;
  const { bot, game, calls, advance } = await twitchBot(t, (url) => {
    if (url.endsWith('/oauth2/token')) return tokenReply();
    posts++;
    return posts === 1 ? new Response('', { status: 401 }) : sent();
  });
  const status = bot.status(game);
  assert.equal(status.mode, 'twitch');
  assert.equal(status.name, 'BaitedBot');
  assert.equal(status.channelAllowed, true);
  game.begin();
  await flush();
  const tokens = calls.filter((call) => call.url.endsWith('/oauth2/token'));
  const messages = calls.filter((call) => call.url.endsWith('/helix/chat/messages'));
  assert.equal(tokens.length, 2);
  assert.match(String(tokens[0].init?.body), /grant_type=client_credentials/);
  assert.equal(messages.length, 2);
  const headers = messages[1].init?.headers as Record<string, string>;
  assert.equal(headers['Client-Id'], 'client-test');
  assert.equal(headers.Authorization, 'Bearer app-token');
  const body = JSON.parse(String(messages[1].init?.body));
  assert.equal(body.broadcaster_id, '123');
  assert.equal(body.sender_id, '999');
  assert.match(body.message, /round 1\b/i);
  assert.equal(matches(body.message, game.round!.word), false);
  assert.equal(bot.status(game).recent[0].status, 'sent');
  assert.equal(bot.status(game).problem, null);
  // The cached app token is reused, and a command answer replies to the command.
  bot.chat(game, message('!bait score', { id: 'parent-message' }));
  advance(LIMITS.channelGap);
  bot.tick(game);
  await flush();
  assert.equal(calls.filter((call) => call.url.endsWith('/oauth2/token')).length, 2);
  const reply = calls.filter((call) => call.url.endsWith('/helix/chat/messages')).at(-1)!;
  assert.equal(JSON.parse(String(reply.init?.body)).reply_parent_message_id, 'parent-message');
  assert.match(JSON.parse(String(reply.init?.body)).message, /^(chat's record|scoreboard): 0 won.*0 played/);
});

test('held, refused and rate-limited messages surface in the studio without retry storms', async (t) => {
  let mode: 'held' | 'forbidden' | 'limited' | 'ok' = 'held';
  const { bot, game, calls, advance } = await twitchBot(t, (url, _init, now) => {
    if (url.endsWith('/oauth2/token')) return tokenReply();
    if (mode === 'held') return sent(false, { code: 'automod_held', message: 'Your message is being checked by mods.' });
    if (mode === 'forbidden') return new Response('', { status: 403 });
    if (mode === 'limited')
      return new Response('', { status: 429, headers: { 'Ratelimit-Reset': String(Math.ceil(now / 1000) + 20) } });
    return sent();
  });
  const posts = () => calls.filter((call) => call.url.endsWith('/helix/chat/messages')).length;
  game.begin();
  await flush();
  assert.equal(bot.status(game).recent[0].status, 'dropped');
  assert.match(bot.status(game).problem!, /Twitch held a bot message: Your message is being checked/);

  mode = 'forbidden';
  advance(LIMITS.channelGap);
  game.pause();
  await flush();
  assert.equal(bot.status(game).recent[0].status, 'failed');
  assert.match(bot.status(game).problem!, /refused the bot/);
  const refused = posts();
  advance(LIMITS.channelGap);
  game.resume();
  bot.tick(game);
  await flush();
  assert.equal(posts(), refused, 'a refused channel pauses before trying again');

  mode = 'limited';
  advance(LIMITS.forbiddenPause);
  game.pause();
  await flush();
  assert.match(bot.status(game).problem!, /rate limiting/);
  const limited = posts();
  advance(LIMITS.channelGap);
  bot.tick(game);
  await flush();
  assert.equal(posts(), limited, 'a 429 pauses every channel until the reset');
  mode = 'ok';
  advance(21000);
  game.resume();
  await flush();
  assert.equal(posts(), limited + 1);
  assert.equal(bot.status(game).recent[0].status, 'sent');
  assert.match(bot.status(game).recent[0].text, /^(back on|unpaused)\b.*left/i);
  assert.equal(bot.status(game).problem, null);
});

test('the bot stays silent until it is configured, authorized, allowed and switched on', async (t) => {
  const reply = () => {
    throw new Error('No Twitch request is expected.');
  };
  const unconfigured = await twitchBot(t, reply, { botId: '' });
  assert.equal(unconfigured.bot.status(unconfigured.game).mode, 'unconfigured');
  unconfigured.game.begin();
  const unauthorized = await twitchBot(t, reply, { botAuthorized: false });
  assert.equal(unauthorized.bot.status(unauthorized.game).mode, 'unauthorized');
  unauthorized.game.begin();
  const notAllowed = await twitchBot(t, reply, { channelBot: false });
  assert.equal(notAllowed.bot.status(notAllowed.game).channelAllowed, false);
  notAllowed.game.begin();
  const off = await twitchBot(t, reply);
  off.game.data.settings.chatBot = false;
  off.game.begin();
  off.bot.chat(off.game, message('!bait help'));
  await flush();
  for (const { calls } of [unconfigured, unauthorized, notAllowed, off]) assert.equal(calls.length, 0);
});

test('queued posts are dropped once the bot may no longer post in the channel', async (t) => {
  for (const lose of ['setting', 'grant'] as const) {
    const { bot, game, calls, store, advance } = await twitchBot(t, (url) =>
      url.endsWith('/oauth2/token') ? tokenReply() : sent(),
    );
    const posts = () => calls.filter((call) => call.url.endsWith('/helix/chat/messages')).length;
    game.begin();
    await flush();
    assert.equal(posts(), 1);
    // Inside the per-channel gap, these wait in the queue.
    game.pause();
    bot.chat(game, message('!bait score', { id: 'parent' }));
    if (lose === 'setting') game.data.settings.chatBot = false;
    else await store.setCredentials('123', credentials({ scope: ['user:read:chat'] }));
    advance(LIMITS.channelGap);
    bot.tick(game);
    await flush();
    assert.equal(posts(), 1, `${lose}: nothing queued goes out`);
    // Allowing the bot again does not post what was queued before.
    if (lose === 'setting') game.data.settings.chatBot = true;
    else await store.setCredentials('123', credentials());
    advance(LIMITS.channelGap);
    bot.tick(game);
    await flush();
    assert.equal(posts(), 1, `${lose}: the old queue is gone`);
  }
});

test('moderator commands need the setting, a moderator and the studio readiness', async (t) => {
  const store = await tempStore(t);
  let now = 2_000_000,
    reason: string | null = null;
  const f = fixture();
  f.game.data.settings.chatBot = true;
  const bot = new ChatBot({ config: loadConfig({}), store, ready: () => reason, clock: () => now });
  f.game.onEvent = (event) => bot.event(f.game, event);
  const mod = (text: string) => message(text, { userId: 'mod-1', name: 'ModName', badges: ['moderator'] });
  bot.chat(f.game, mod('!bait start'));
  assert.equal(f.game.phase, 'idle', 'off by default');
  f.game.data.settings.modCommands = true;
  bot.chat(f.game, message('!bait start'));
  assert.equal(f.game.phase, 'idle', 'viewers cannot start rounds');
  reason = "The streamer's microphone is off. Turn it on in the studio first.";
  bot.chat(f.game, mod('!bait start'));
  assert.equal(f.game.phase, 'idle');
  assert.match(bot.status(f.game).recent[0].text, /^@ModName .*The streamer's microphone is off/);
  reason = null;
  bot.chat(f.game, message('!bait start', { userId: 'owner' }));
  assert.equal(f.game.phase, 'active', 'the broadcaster needs no badge');
  bot.chat(f.game, mod('!bait pause'));
  assert.equal(f.game.phase, 'paused');
  bot.chat(f.game, message('!bait resume', { badges: ['lead_moderator'] }));
  assert.equal(f.game.phase, 'active');
  bot.chat(f.game, mod('!bait start'));
  for (let i = 0; i < 4; i++) {
    now += LIMITS.channelGap;
    bot.tick(f.game);
  }
  assert.ok(bot.status(f.game).recent.some((post) => /^@ModName .*Finish the current round first\./.test(post.text)));
  // With announcements off, commands still work but nothing is posted.
  f.game.data.settings.chatBot = false;
  const posted = bot.status(f.game).recent.length;
  bot.chat(f.game, mod('!bait pause'));
  assert.equal(f.game.phase, 'paused');
  now += LIMITS.channelWindow;
  bot.tick(f.game);
  assert.equal(bot.status(f.game).recent.length, posted);
});

test('EventSub hands commands on with badges and drops the bot account’s own messages', () => {
  const game = new Game(saved());
  game.begin();
  const connection = new TwitchConnection(game, {} as TwitchAuth, () => {});
  connection.ignoreUserId = '999';
  const seen: ChatMessage[] = [];
  connection.onMessage = (m) => seen.push(m);
  const notification = (chatter: string, text: string, id: string) => ({
    metadata: {
      message_type: 'notification',
      message_id: id,
      message_timestamp: new Date().toISOString(),
      subscription_type: 'channel.chat.message',
    },
    payload: {
      event: {
        broadcaster_user_id: '123',
        chatter_user_id: chatter,
        chatter_user_name: chatter === '999' ? 'BaitedBot' : 'ModName',
        message_id: `chat-${id}`,
        message: { text },
        badges: [{ set_id: 'moderator', id: '1', info: '' }],
      },
    },
  });
  assert.equal(connection.acceptNotification(notification('999', 'Round 1 is live', 'a')), false);
  assert.equal(game.view('studio').participants, 0, 'bot posts never count as play');
  assert.equal(connection.acceptNotification(notification('456', '!bait pause', 'b')), true);
  assert.deepEqual(seen.map((m) => [m.userId, m.text, m.badges]), [['456', '!bait pause', ['moderator']]]);
  connection.onMessage = () => {
    throw new Error('command failure');
  };
  assert.equal(connection.acceptNotification(notification('457', 'a fair hint', 'c')), true);
});

test('only the configured bot account can be stored as the bot, under its own vault key', async (t) => {
  const store = await tempStore(t);
  const config = loadConfig({
    TWITCH_CLIENT_ID: 'client-test',
    TWITCH_CLIENT_SECRET: 'secret-test',
    TOKEN_ENCRYPTION_KEY: key,
    TWITCH_BOT_USER_ID: '999',
  });
  let user = '999',
    scopes = ['user:write:chat', 'user:bot'];
  const revoked: string[] = [];
  const auth = new TwitchAuth(config, store, (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/revoke')) {
      revoked.push(String(init?.body));
      return new Response('');
    }
    if (String(url).endsWith('/token'))
      return Response.json({ access_token: `at-${user}`, refresh_token: 'rt', expires_in: 3600, scope: scopes });
    if (String(url).endsWith('/validate'))
      return Response.json({ client_id: 'client-test', user_id: user, login: `user${user}`, expires_in: 3600, scopes });
    return Response.json({ data: [{ id: user, login: `user${user}`, display_name: `User${user}` }] });
  }) as typeof fetch);
  const bot = await auth.exchange('code', 'bot');
  assert.equal(bot.userId, '999');
  assert.ok(store.snapshot.vault[botKey('999')]);
  assert.equal(store.snapshot.vault['999'], undefined);
  assert.equal((await auth.validate(botKey('999'))).name, 'User999');
  user = '555';
  await assert.rejects(auth.exchange('code', 'bot'), BotAccountMismatch);
  assert.equal(store.snapshot.vault[botKey('555')], undefined);
  assert.match(revoked.at(-1)!, /token=at-555/);
  // A broadcaster grant cannot stand in for the bot's scopes.
  user = '999';
  scopes = ['user:read:chat'];
  await assert.rejects(auth.exchange('code', 'bot'), AuthRevoked);
  assert.throws(() => loadConfig({ TWITCH_BOT_USER_ID: 'baitedbot' }), /TWITCH_BOT_USER_ID/);
});


test('restarting a recording take drops old announcements even during token refresh', async (t) => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const { game, calls, bot, advance } = await twitchBot(t, url => url.endsWith('/oauth2/token') ? pending : sent());
  game.update({ ...game.data.settings, recordingMode: true });
  game.begin();
  assert.equal(calls.filter(call => call.url.endsWith('/oauth2/token')).length, 1);
  bot.chat(game, message('!bait score'));
  game.restartTake(game.data.recordingTake!.id);
  release(tokenReply()); await flush();
  advance(LIMITS.channelGap); bot.tick(game); await flush();
  assert.equal(calls.filter(call => call.url.endsWith('/helix/chat/messages')).length, 0);
  assert.equal(bot.status(game).recent.length, 0);
});


test('a moderator command sent before a recording reset cannot start the next take', async (t) => {
  const store=await tempStore(t), f=fixture();
  const bot=new ChatBot({config:loadConfig({}),store,ready:()=>null,clock:f.now});
  f.game.update({...f.game.data.settings,recordingMode:true,modCommands:true});
  const oldAt=f.now(); f.advance(1000);
  f.game.restartTake(f.game.data.recordingTake!.id);
  bot.chat(f.game,message('!bait start',{at:oldAt,badges:['moderator']}));
  assert.equal(f.game.phase,'idle');
  f.advance(1);
  bot.chat(f.game,message('!bait start',{at:f.now(),badges:['moderator']}));
  assert.equal(f.game.phase,'active');
  assert.equal(f.game.round!.word,'banana');
});
