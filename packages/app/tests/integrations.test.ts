import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { Store, seal, unseal, type Credentials } from '../server/store.js';
import { loadConfig } from '../server/config.js';
import { TwitchAuth, TwitchConnection, AuthRevoked, RateLimited } from '../server/twitch.js';
import { providerTranscript, SpeechBridge } from '../server/speech.js';
import { Game, defaults } from '../server/game.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const key = 'ab'.repeat(32);
const credentials: Credentials = {
  access_token: 'access-test',
  refresh_token: 'refresh-test',
  expiresAt: Date.now() + 3600000,
  userId: '123',
  login: 'bait',
  name: 'Bait',
  scope: ['user:read:chat'],
};
const config = loadConfig({
  TWITCH_CLIENT_ID: 'client-test',
  TWITCH_CLIENT_SECRET: 'secret-test',
  TOKEN_ENCRYPTION_KEY: key,
});
function game() {
  return new Game({
    id: 'room',
    owner: '123',
    channel: 'bait',
    mode: 'twitch',
    overlayKey: 'read-only',
    settings: { ...defaults },
    history: [],
    priorWins: 0,
    priorPlayed: 0,
    priorBest: 0,
    leaders: {},
  });
}
class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: unknown[] = [];
  url = '';
  send(data: unknown) {
    this.sent.push(data);
  }
  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
  terminate() {
    this.close();
  }
  message(data: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(data)));
  }
}
function envelope<P>(type: string, payload: P, id = Math.random().toString(), at = Date.now()) {
  return {
    metadata: {
      message_type: type,
      message_id: id,
      message_timestamp: new Date(at).toISOString(),
      subscription_type: 'channel.chat.message',
    },
    payload,
  };
}
const welcome = (id = 'session') =>
  envelope('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } });
const event = (text = 'hello') =>
  envelope(
    'notification',
    {
      event: {
        broadcaster_user_id: '123',
        chatter_user_id: '456',
        chatter_user_name: 'Viewer',
        message_id: 'chat-id',
        message: { text },
      },
    },
    'event-id',
  );

test('encrypted token storage rejects tampering and incorrect keys', () => {
  const value = seal(credentials, key);
  assert.ok(!value.includes('access-test'));
  assert.deepEqual(unseal(value, key), credentials);
  assert.throws(() => unseal(value, 'cd'.repeat(32)));
  const parts = value.split('.');
  parts[2] = Buffer.from('tampered').toString('base64');
  assert.throws(() => unseal(parts.join('.'), key));
});
test('atomic persistence survives concurrent saves and reload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-store-'));
  try {
    const s = new Store(dir, key);
    await s.load();
    await Promise.all([s.setCredentials('123', credentials), s.save(), s.save()]);
    const other = new Store(dir, key);
    await other.load();
    assert.deepEqual(other.credentials('123'), credentials);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Twitch authorization code is exchanged and identity validated server-side', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-auth-'));
  try {
    const store = new Store(dir, key);
    await store.load();
    const calls: string[] = [];
    const auth = new TwitchAuth(config, store, (async (url, options) => {
      calls.push(String(url));
      if (String(url).endsWith('/token')) {
        assert.ok(String(options?.body).includes('grant_type=authorization_code'));
        return Response.json({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: ['user:read:chat'],
        });
      }
      if (String(url).endsWith('/validate'))
        return Response.json({
          client_id: 'client-test',
          user_id: '123',
          login: 'bait',
          expires_in: 3600,
          scopes: ['user:read:chat'],
        });
      return Response.json({ data: [{ id: '123', login: 'bait', display_name: 'Bait' }] });
    }) as typeof fetch);
    const c = await auth.exchange('fake-code');
    assert.equal(c.userId, '123');
    assert.equal(calls.length, 3);
    assert.ok(store.snapshot.vault['123']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('parallel token refresh requests share one refresh and persist rotated tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-refresh-'));
  try {
    const s = new Store(dir, key);
    await s.load();
    await s.setCredentials('123', { ...credentials, expiresAt: 0 });
    let calls = 0;
    const auth = new TwitchAuth(config, s, (async () => {
      calls++;
      await tick();
      return Response.json({
        access_token: 'new',
        refresh_token: 'rotated',
        expires_in: 3600,
        scope: ['user:read:chat'],
      });
    }) as typeof fetch);
    const results = await Promise.all(Array.from({ length: 20 }, () => auth.access('123')));
    assert.equal(calls, 1);
    assert.ok(results.every((c) => c.access_token === 'new'));
    assert.equal(s.credentials('123')!.refresh_token, 'rotated');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('revoked refresh tokens invalidate authorization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-revoked-'));
  try {
    const s = new Store(dir, key);
    await s.load();
    await s.setCredentials('123', { ...credentials, expiresAt: 0 });
    const auth = new TwitchAuth(
      config,
      s,
      (async () => new Response('', { status: 400 })) as typeof fetch,
    );
    await assert.rejects(() => auth.access('123'), AuthRevoked);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Helix handles 401 refresh and rate-limit reset without exposing tokens', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-api-'));
  try {
    const s = new Store(dir, key);
    await s.load();
    await s.setCredentials('123', credentials);
    let calls = 0;
    const auth = new TwitchAuth(config, s, (async (url) => {
      if (String(url).endsWith('/token'))
        return Response.json({
          access_token: 'new',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: ['user:read:chat'],
        });
      calls++;
      return calls === 1 ? new Response('', { status: 401 }) : Response.json({ data: [] });
    }) as typeof fetch);
    await auth.api('123', 'users');
    assert.equal(calls, 2);
    const limited = new TwitchAuth(
      config,
      s,
      (async () =>
        new Response('', {
          status: 429,
          headers: { 'Ratelimit-Reset': String(Math.ceil(Date.now() / 1000) + 5) },
        })) as typeof fetch,
    );
    await assert.rejects(
      () => limited.api('123', 'users'),
      (e) => e instanceof RateLimited && e.delay >= 1000,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
const subscribed = (calls: unknown[]) =>
  calls.map((args) => JSON.parse(String((args as [string, string, RequestInit])[2].body)));
const chatTypes = ['channel.chat.message', 'channel.chat.message_delete', 'channel.chat.clear_user_messages'];
test('EventSub welcome subscribes once; migration retains subscriptions until new welcome', async (t) => {
  const g = game(),
    sockets: FakeSocket[] = [],
    calls: unknown[] = [];
  const auth = {
    api: async (...args: unknown[]) => {
      calls.push(args);
      return Response.json({});
    },
  } as unknown as TwitchAuth;
  const c = new TwitchConnection(
    g,
    auth,
    () => {},
    (url) => {
      const s = new FakeSocket();
      s.url = url;
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  );
  t.after(() => c.stop());
  c.start();
  sockets[0].message(welcome());
  await tick();
  assert.equal(g.connection.status, 'connected');
  assert.deepEqual(subscribed(calls).map((body) => body.type), chatTypes);
  sockets[0].message(
    envelope('session_reconnect', {
      session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=opaque' },
    }),
  );
  await tick();
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].readyState, WebSocket.OPEN);
  assert.ok(sockets[1].url.endsWith('reconnect=opaque'));
  sockets[1].message(welcome('migrated'));
  await tick();
  assert.equal(sockets[0].readyState, WebSocket.CLOSED);
  assert.equal(calls.length, chatTypes.length);
  assert.equal(g.connection.status, 'connected');
});
test('moderator deletes and clears are read as the broadcaster, with the chat scope already granted', async (t) => {
  const g = game(),
    calls: unknown[] = [],
    socket = new FakeSocket();
  const auth = {
    api: async (...args: unknown[]) => {
      calls.push(args);
      return Response.json({});
    },
  } as unknown as TwitchAuth;
  const c = new TwitchConnection(g, auth, () => {}, () => socket as unknown as WebSocket);
  t.after(() => c.stop());
  c.start();
  socket.message(welcome('moderation'));
  await tick();
  for (const body of subscribed(calls)) {
    assert.equal(body.version, '1');
    assert.deepEqual(body.condition, { broadcaster_user_id: '123', user_id: '123' });
    assert.deepEqual(body.transport, { method: 'websocket', session_id: 'moderation' });
  }
});
test('a refused moderation subscription leaves chat connected', async (t) => {
  const g = game(),
    sockets: FakeSocket[] = [];
  g.begin();
  const auth = {
    api: async (_owner: string, _path: string, init: RequestInit) => {
      if (JSON.parse(String(init.body)).type !== 'channel.chat.message')
        throw new Error('Twitch request failed (403). Check authorization and reconnect.');
      return Response.json({});
    },
  } as unknown as TwitchAuth;
  const c = new TwitchConnection(g, auth, () => {}, () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s as unknown as WebSocket;
  });
  t.after(() => c.stop());
  c.start();
  sockets[0].message(welcome());
  await tick();
  await tick();
  assert.equal(g.connection.status, 'connected');
  assert.equal(sockets.length, 1, 'no reconnect');
  assert.equal(sockets[0].readyState, WebSocket.OPEN);
  sockets[0].message(event('a hint after the refusal'));
  await tick();
  assert.equal(g.view('studio').participants, 1);
});
test('EventSub rejects duplicates, stale events, wrong channels and malformed payloads', () => {
  const g = game();
  g.begin();
  const c = new TwitchConnection(g, {} as TwitchAuth, () => {}),
    e = event();
  assert.equal(c.acceptNotification(e), true);
  assert.equal(c.acceptNotification(e), false);
  assert.equal(
    c.acceptNotification({
      ...e,
      metadata: {
        ...e.metadata,
        message_id: 'old',
        message_timestamp: new Date(Date.now() - 20000).toISOString(),
      },
    }),
    false,
  );
  assert.equal(
    c.acceptNotification(
      envelope(
        'notification',
        { event: { ...e.payload.event, broadcaster_user_id: '999' } },
        'wrong',
      ),
    ),
    false,
  );
  assert.equal(c.acceptNotification({ hello: 'invalid' }), false);
  assert.equal(g.view('studio').participants, 1);
});
test('EventSub ignores Shared Chat messages sent from partner channels', () => {
  const g = game();
  g.begin();
  const c = new TwitchConnection(g, {} as TwitchAuth, () => {}),
    seen: string[] = [];
  c.onMessage = (message) => seen.push(message.text);
  const shared = (id: string, source: string | null, text: string) =>
    envelope(
      'notification',
      {
        event: {
          ...event().payload.event,
          chatter_user_id: `chatter-${id}`,
          message_id: `chat-${id}`,
          message: { text },
          source_broadcaster_user_id: source,
          source_message_id: source === null ? null : `source-${id}`,
        },
      },
      `event-${id}`,
    );
  assert.equal(c.acceptNotification(shared('partner', '999', '!skip')), false);
  assert.equal(c.acceptNotification(shared('own', '123', 'cold place')), true);
  assert.equal(c.acceptNotification(shared('solo', null, 'it waddles')), true);
  assert.deepEqual(seen, ['cold place', 'it waddles']);
  assert.equal(g.view('studio').participants, 2);
});
const moderation = (
  type: 'channel.chat.message_delete' | 'channel.chat.clear_user_messages',
  target: string,
  patch: Record<string, unknown> = {},
  id = Math.random().toString(),
  at = Date.now(),
) => {
  const e = envelope(
    'notification',
    {
      event: {
        broadcaster_user_id: '123',
        broadcaster_user_name: 'Bait',
        broadcaster_user_login: 'bait',
        target_user_id: target,
        target_user_name: 'Viewer',
        target_user_login: 'viewer',
        ...patch,
      },
    },
    id,
    at,
  );
  return { ...e, metadata: { ...e.metadata, subscription_type: type } };
};
const chatFrom = (chatter: string, messageId: string, text: string, source: string | null = null) =>
  envelope(
    'notification',
    {
      event: {
        ...event().payload.event,
        chatter_user_id: chatter,
        chatter_user_name: `Viewer${chatter}`,
        message_id: messageId,
        message: { text },
        source_broadcaster_user_id: source,
      },
    },
    `event-${messageId}`,
  );
test('EventSub drops a hint that a moderator deletes in this channel', () => {
  const g = game();
  g.begin();
  const c = new TwitchConnection(g, {} as TwitchAuth, () => {});
  assert.equal(c.acceptNotification(chatFrom('456', 'chat-a', 'a fancy outfit')), true);
  assert.equal(c.acceptNotification(chatFrom('789', 'chat-b', 'slides on ice')), true);
  const del = (target: string, messageId: string, patch: Record<string, unknown> = {}, id?: string, at?: number) =>
    moderation('channel.chat.message_delete', target, { message_id: messageId, ...patch }, id, at);
  assert.equal(c.acceptNotification(del('456', 'chat-a', { broadcaster_user_id: '999' })), false);
  assert.equal(c.acceptNotification(del('456', 'chat-a', {}, 'stale', Date.now() - 20000)), false);
  assert.equal(c.acceptNotification(del('456', 'chat-a', { message_id: undefined })), false);
  assert.equal(g.round!.hints.length, 2);
  const deletion = del('456', 'chat-a', {}, 'delete-a');
  assert.equal(c.acceptNotification(deletion), true);
  assert.equal(c.acceptNotification(deletion), false, 'a duplicate is ignored');
  assert.deepEqual(g.round!.hints.map((hint) => hint.text), ['slides on ice']);
});
test('EventSub clears a banned or timed-out chatter and the award they won', () => {
  const g = game();
  g.begin();
  const c = new TwitchConnection(g, {} as TwitchAuth, () => {});
  c.acceptNotification(chatFrom('456', 'chat-a', 'a fancy outfit'));
  c.acceptNotification(chatFrom('789', 'chat-b', 'slides on ice'));
  g.transcript({
    roundId: g.round!.id, epoch: g.round!.epoch, text: g.round!.word, final: true,
    confidence: 0.99, capturedAt: Date.now(), id: 'speech',
  });
  const board = g.awardBoard!;
  g.award(board.roundId, board.candidates.find((hint) => hint.name === 'Viewer456')!.id);
  assert.equal(c.acceptNotification(moderation('channel.chat.clear_user_messages', '456', { broadcaster_user_id: '999' })), false);
  assert.equal(g.result?.award?.name, 'Viewer456');
  assert.equal(c.acceptNotification(moderation('channel.chat.clear_user_messages', '456')), true);
  assert.equal(g.result?.award, undefined);
  assert.deepEqual(g.awardBoard!.candidates.map((hint) => hint.name), ['Viewer789']);
});
test('Shared Chat partners cannot reach this channel’s hints through deletes or clears', () => {
  const g = game();
  g.begin();
  const c = new TwitchConnection(g, {} as TwitchAuth, () => {});
  c.acceptNotification(chatFrom('456', 'chat-own', 'a fancy outfit'));
  assert.equal(c.acceptNotification(chatFrom('321', 'chat-partner', 'from next door', '999')), false);
  // A partner channel's copy of a message has its own ID; only this channel's ID can match.
  assert.equal(c.acceptNotification(moderation('channel.chat.message_delete', '456', { message_id: 'copy-of-chat-own' })), false);
  assert.equal(c.acceptNotification(moderation('channel.chat.clear_user_messages', '321')), false);
  assert.deepEqual(g.round!.hints.map((hint) => hint.text), ['a fancy outfit']);
});
test('EventSub watchdog reconnects after missing keepalive', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = game(),
    sockets: FakeSocket[] = [];
  const c = new TwitchConnection(
    g,
    { api: async () => Response.json({}) } as unknown as TwitchAuth,
    () => {},
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
  );
  t.after(() => c.stop());
  c.start();
  sockets[0].message(welcome());
  await tick();
  t.mock.timers.tick(16000);
  assert.equal(g.connection.status, 'reconnecting');
  t.mock.timers.tick(2000);
  assert.equal(sockets.length, 2);
  sockets[1].message(welcome('restored'));
  await tick();
  assert.equal(g.connection.status, 'connected');
});
test('EventSub revocation stops connection and invalidates owner sessions', async (t) => {
  const g = game(),
    s = new FakeSocket();
  let invalidated = false;
  const c = new TwitchConnection(
    g,
    {} as TwitchAuth,
    () => {
      invalidated = true;
    },
    () => s as unknown as WebSocket,
  );
  t.after(() => c.stop());
  c.start();
  s.message(envelope('revocation', { subscription: { status: 'authorization_revoked' } }));
  await tick();
  assert.equal(invalidated, true);
  assert.equal(g.connection.status, 'error');
  assert.equal(s.readyState, WebSocket.CLOSED);
});
function speechResult(patch: Record<string, unknown> = {}) {
  return {
    type: 'Results',
    is_final: true,
    start: 0,
    duration: 1,
    channel: {
      alternatives: [
        {
          transcript: 'Penguin!',
          confidence: 0.98,
          words: [{ word: 'penguin', start: 0, end: 1, confidence: 0.96 }],
        },
      ],
    },
    ...patch,
  };
}
test('speech adapter accepts final timed words and rejects interim, stale and impossible audio', () => {
  const binding = { roundId: 'r', epoch: 2, firstAudioAt: 100000, audioSeconds: 1 };
  const t = providerTranscript(speechResult(), binding, 101000);
  assert.equal(t?.text, 'Penguin!');
  assert.equal(t?.epoch, 2);
  assert.equal(t?.confidence, 0.98);
  assert.equal(t?.words?.[0].confidence, 0.96);
  assert.equal(providerTranscript(speechResult({ is_final: false }), binding, 101000), null);
  assert.equal(providerTranscript(speechResult({ duration: 10 }), binding, 101000), null);
  assert.equal(providerTranscript(speechResult(), { ...binding, audioSeconds: 10 }, 110000), null);
  assert.equal(providerTranscript({ type: 'Error' }, binding), null);
});
test('speech bridge uses server key, streams binary PCM, detects once and rejects text injection', async (t) => {
  const g = game();
  g.begin();
  const word = g.round!.word,
    client = new FakeSocket(),
    provider = new FakeSocket();
  let url = '',
    header = '';
  const bridge = new SpeechBridge(
    client as unknown as WebSocket,
    g,
    'key-test',
    () => true,
    () => {},
    (u, o) => {
      url = u;
      header = o.headers.Authorization;
      return provider as unknown as WebSocket;
    },
  );
  t.after(() => bridge.close());
  assert.ok(url.includes('encoding=linear16'));
  assert.ok(url.includes('mip_opt_out=true'));
  assert.equal(header, 'Token key-test');
  provider.emit('open');
  client.emit('message', Buffer.from(JSON.stringify({ text: word })), false);
  assert.equal(provider.sent.length, 0);
  client.emit('message', Buffer.alloc(32000), true);
  assert.equal(provider.sent.length, 1);
  provider.message(
    speechResult({
      channel: {
        alternatives: [
          {
            transcript: word,
            confidence: 0.99,
            words: [{ word, start: 0, end: 1, confidence: 0.99 }],
          },
        ],
      },
    }),
  );
  assert.equal(g.score.wins, 1);
  provider.message(speechResult());
  assert.equal(g.score.wins, 1);
  assert.ok(client.sent.every((m) => !String(m).includes('key-test')));
});
test('speech bridge invalidates old round epochs', (t) => {
  const g = game();
  g.begin();
  const bridge = new SpeechBridge(
    new FakeSocket() as unknown as WebSocket,
    g,
    'key',
    () => true,
    () => {},
    () => new FakeSocket() as unknown as WebSocket,
  );
  t.after(() => bridge.close());
  assert.equal(bridge.valid(), true);
  g.pause();
  g.resume();
  assert.equal(bridge.valid(), false);
});
test('production configuration enforces HTTPS and disables development fixtures', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PUBLIC_URL: 'http://example.com' }));
  assert.throws(() => loadConfig({ TOKEN_ENCRYPTION_KEY: 'weak' }));
  assert.throws(() => loadConfig({ PUBLIC_URL: 'https://example.com/path' }));
  const c = loadConfig({
    NODE_ENV: 'production',
    PUBLIC_URL: 'https://example.com',
    ENABLE_DEMO: 'true',
  });
  assert.equal(c.demo, false);
});
