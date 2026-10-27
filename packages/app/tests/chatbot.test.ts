import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game, defaults, matches, type GameEvent, type SavedGame } from '../server/game.js';
import { words } from '../server/words.js';
import { Store, type Credentials } from '../server/store.js';
import { loadConfig } from '../server/config.js';
import { ChatBot, LIMITS } from '../server/chatbot.js';
import {
  eventAnnouncement,
  finalAnnouncement,
  halfwayAnnouncement,
  helpText,
  parseCommand,
  scoreText,
  streakText,
  topText,
} from '../server/chat-copy.js';
import {
  AuthRevoked,
  BotAccountMismatch,
  TwitchAuth,
  TwitchConnection,
  botKey,
  type ChatMessage,
} from '../server/twitch.js';
import { fixture } from './fixtures.js';

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
  for (const name of ['start', 'pause', 'resume'] as const) assert.equal(parseCommand(`!bait ${name}`), name);
  for (const text of ['!bait nonsense', '!baited', '!bait start now', 'hello !bait', '!skip', 'bait help'])
    assert.equal(parseCommand(text), null, text);
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
      texts.push(halfwayAnnouncement(view())!.text, finalAnnouncement().text, helpText());
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
  assert.match(texts.at(-1)!, new RegExp(`Baited! The streamer said ${word.toUpperCase()} after`));
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
  assert.match(texts.at(-1)!, new RegExp(`The word was ${word.toUpperCase()}`));
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
  assert.match(recent()[0].text, /Round 1 is live: 2:00 on the clock/);
  // Within the per-channel gap, state changes coalesce to the latest one.
  f.game.pause();
  f.game.resume();
  f.game.pause();
  bot.tick(f.game);
  assert.equal(recent().length, 1);
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, 2);
  assert.match(recent()[0].text, /Round paused/);
  now += LIMITS.channelGap;
  bot.tick(f.game);
  assert.equal(recent().length, 2);
  // At most channelCount posts per window, however many keys are waiting.
  for (const text of ['!bait help', '!bait score', '!bait top']) bot.chat(f.game, message(text));
  // The same command again inside its cooldown gets no second answer.
  bot.chat(f.game, message('!bait help'));
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
  assert.equal(recent().filter((post) => post.text.startsWith('baited:')).length, 1);
  assert.ok(recent().every((post) => !matches(post.text, f.game.round!.word)));
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
  assert.match(bot.status(f.game).recent[0].text, /^⏳ Halfway: 0:59 left and nobody is baiting yet\./);
  step(2000);
  step(46000);
  assert.equal(bot.status(f.game).recent.length, 2);
  step(2000);
  assert.match(bot.status(f.game).recent[0].text, /10 seconds left/);
  step(1000);
  assert.equal(bot.status(f.game).recent.length, 3);
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
  assert.match(body.message, /Round 1 is live/);
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
  assert.match(JSON.parse(String(reply.init?.body)).message, /^Chat has 0 wins in 0 rounds/);
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
  assert.match(bot.status(game).recent[0].text, /Back on/);
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
  assert.match(bot.status(f.game).recent[0].text, /^@ModName The streamer's microphone is off/);
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
  assert.ok(bot.status(f.game).recent.some((post) => /^@ModName Finish the current round first\./.test(post.text)));
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
  assert.equal(connection.acceptNotification(notification('999', '🎣 Round 1 is live', 'a')), false);
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
