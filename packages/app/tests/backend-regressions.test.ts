import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { Store, type Credentials } from '../server/store.js';
import { TwitchAuth, AuthRevoked, AuthSuperseded, TwitchConnection } from '../server/twitch.js';
import { providerTranscript, SpeechBridge } from '../server/speech.js';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { SPEECH_SETTLE_MS } from '../server/game.js';
import { fixture } from './fixtures.js';

const key = 'ab'.repeat(32);
const credentials: Credentials = {
  access_token: 'old-test', refresh_token: 'refresh-test', expiresAt: 0,
  userId: 'owner', login: 'owner', name: 'Owner', scope: ['user:read:chat'],
};
const config = loadConfig({ TWITCH_CLIENT_ID: 'client-test', TOKEN_ENCRYPTION_KEY: key });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

for (const operation of ['revoke', 'invalidate'] as const) {
  test(`a pending refresh cannot restore credentials after ${operation}`, async () => {
    const store = new Store('unused-in-memory', key);
    store.save = async () => {};
    await store.setCredentials('owner', credentials);
    const token = deferred<Response>(), started = deferred<void>(), revoked: string[] = [];
    const auth = new TwitchAuth(config, store, (async (url, init) => {
      if (String(url).endsWith('/token')) { started.resolve(); return token.promise; }
      revoked.push(new URLSearchParams(String(init?.body)).get('token')!);
      return new Response();
    }) as typeof fetch);
    const pending = auth.access('owner').then(() => null, (error: unknown) => error);
    await started.promise;
    await auth[operation]('owner');
    assert.equal(store.credentials('owner'), undefined);
    token.resolve(Response.json({ access_token: 'late-test', refresh_token: 'late-refresh', expires_in: 3600, scope: ['user:read:chat'] }));
    assert.ok(await pending instanceof AuthSuperseded);
    assert.equal(store.credentials('owner'), undefined);
    assert.ok(revoked.includes('late-test'), 'discarded provider credential is revoked too');
  });
}

test('disconnect during a refresh persistence wait cannot authorize its caller', async () => {
  const store = new Store('unused-in-memory', key);
  store.save = async () => {};
  await store.setCredentials('owner', credentials);
  const writing = deferred<void>(), flushed = deferred<void>();
  store.save = () => { writing.resolve(); return flushed.promise; };
  const auth = new TwitchAuth(config, store, (async () => Response.json({
    access_token: 'next-test', refresh_token: 'next-refresh', expires_in: 3600, scope: ['user:read:chat'],
  })) as typeof fetch);
  const pending = auth.access('owner').then(() => null, (error: unknown) => error);
  await writing.promise;
  const invalidated = auth.invalidate('owner');
  flushed.resolve();
  await invalidated;
  assert.ok(await pending instanceof AuthSuperseded);
  assert.equal(store.credentials('owner'), undefined);
});

function providerResult(word: string, confidence = 0.99) {
  return {
    type: 'Results', is_final: true, start: 0, duration: 10,
    channel: { alternatives: [{ transcript: `um ${word}`, confidence: 0.7, words: [
      { word: 'um', start: 0, end: 0.2, confidence: 0.4 },
      { word, start: 9.7, end: 9.9, confidence },
    ] }] },
  };
}
test('a clear target near the end of a long final is judged by its own timing and confidence', () => {
  const f = fixture(); f.game.begin(); f.advance(10000);
  const t = providerTranscript(providerResult(f.game.round!.word), {
    roundId: f.game.round!.id, epoch: f.game.round!.epoch, firstAudioAt: 100000, audioSeconds: 10,
  }, f.now());
  assert.ok(t);
  assert.equal(f.game.transcript(t), true);
  assert.equal(f.game.score.wins, 1);
});
test('a high sentence confidence cannot rescue an uncertain target', () => {
  const f = fixture(); f.game.begin(); f.advance(10000);
  const data = providerResult(f.game.round!.word, 0.79);
  data.channel.alternatives[0].confidence = 0.99;
  const t = providerTranscript(data, {
    roundId: f.game.round!.id, epoch: f.game.round!.epoch, firstAudioAt: 100000, audioSeconds: 10,
  }, f.now());
  assert.ok(t);
  assert.equal(f.game.transcript(t), false);
});
test('provider rejects missing word evidence and malformed word times', () => {
  const binding = { roundId: 'r', epoch: 1, firstAudioAt: 100000, audioSeconds: 10 };
  const data = providerResult('banana');
  data.channel.alternatives[0].words[1].end = 20;
  assert.equal(providerTranscript(data, binding, 110000), null);
  data.channel.alternatives[0].words = [];
  assert.equal(providerTranscript(data, binding, 110000), null);
});

function liveFixture() {
  const f = fixture(); f.game.data.mode = 'twitch'; f.game.mic = 'listening'; f.game.begin();
  return f;
}
test('live deadline settles a word finished before zero, without revealing it to studio or OBS', () => {
  const f = liveFixture(), r = f.game.round!;
  f.advance(r.duration + 200); f.game.tick();
  assert.equal(f.game.phase, 'settling');
  assert.equal(f.game.view('viewer').round!.settleUntil, r.endsAt + SPEECH_SETTLE_MS);
  for (const role of ['studio', 'overlay'] as const) assert.equal(f.game.view(role).round!.target, undefined);
  assert.throws(() => f.game.begin());
  assert.throws(() => f.game.pause());
  assert.equal(f.game.chat('late', 'viewer', 'Viewer', 'a late hint', f.now()), false);
  const t = f.transcript('ignored sentence average', { confidence: 0.3, words: [{
    text: r.word, confidence: 0.99, capturedAt: r.endsAt - 300, endedAt: r.endsAt - 100,
  }] });
  assert.equal(f.game.transcript(t), true);
  assert.equal(f.game.transcript(t), false);
  assert.equal(f.game.score.wins, 1);
  f.game.reverse();
  assert.equal(f.game.score.wins, 0);
});
test('settling rejects words crossing zero and ends at the fixed grace deadline', () => {
  const f = liveFixture(), r = f.game.round!;
  f.advance(r.duration + 100);
  assert.equal(f.game.transcript(f.transcript(r.word, { words: [{
    text: r.word, confidence: 1, capturedAt: r.endsAt - 100, endedAt: r.endsAt + 50,
  }] })), false);
  assert.equal(f.game.phase, 'settling');
  f.advance(SPEECH_SETTLE_MS - 100);
  assert.equal(f.game.transcript(f.transcript(r.word, { capturedAt: r.endsAt - 100 })), false);
  assert.equal(f.game.result?.outcome, 'escaped');
});
test('an expired epoch and words from before resume cannot win during grace', () => {
  const f = liveFixture(), old = f.transcript();
  f.game.pause(); f.advance(2000); f.game.resume(); f.game.mic = 'listening';
  const r = f.game.round!;
  f.advance(r.remaining + 100);
  assert.equal(f.game.transcript(old), false);
  assert.equal(f.game.transcript(f.transcript(r.word, { capturedAt: r.segmentAt - 1 })), false);
});
test('automatic live rounds do not restart without microphone readiness', () => {
  const f = liveFixture(); f.game.data.settings.auto = true;
  f.game.connection.status = 'connected'; f.game.canRun = () => false;
  f.game.end('skipped'); f.advance(10000); f.game.tick();
  assert.equal(f.game.phase, 'idle');
});

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: unknown[] = [];
  send(data: unknown) { this.sent.push(data); }
  close() { if (this.readyState === WebSocket.CLOSED) return; this.readyState = WebSocket.CLOSED; this.emit('close'); }
}
test('lost speech transport pauses an active round; normal completion keeps its result', () => {
  for (const completed of [false, true]) {
    const f = liveFixture(), client = new FakeSocket(), provider = new FakeSocket();
    const bridge = new SpeechBridge(client as unknown as WebSocket, f.game, 'test-only', () => true, () => {}, () => provider as unknown as WebSocket);
    provider.emit('open');
    if (completed) f.game.transcript(f.transcript());
    client.close();
    assert.equal(f.game.phase, completed ? 'cooldown' : 'paused');
    assert.equal(f.game.result?.outcome, completed ? 'caught' : undefined);
    bridge.close();
  }
});
test('speech settling finalizes once and forwards no PCM after zero', () => {
  const f = liveFixture(), client = new FakeSocket(), provider = new FakeSocket();
  const bridge = new SpeechBridge(client as unknown as WebSocket, f.game, 'test-only', () => true, () => {}, () => provider as unknown as WebSocket);
  provider.emit('open');
  f.advance(f.game.round!.duration); f.game.tick();
  bridge.sync(); bridge.sync();
  client.emit('message', Buffer.alloc(320), true);
  assert.equal(provider.sent.filter((s) => String(s).includes('Finalize')).length, 1);
  assert.equal(provider.sent.filter(Buffer.isBuffer).length, 0);
  f.advance(SPEECH_SETTLE_MS); f.game.tick(); bridge.sync();
  assert.equal(client.readyState, WebSocket.CLOSED);
  assert.equal(f.game.result?.outcome, 'escaped');
});

test('microphone loss exactly at the deadline cannot throw from pause handling', () => {
  for (const late of [0, SPEECH_SETTLE_MS]) {
    const f = liveFixture(), client = new FakeSocket(), provider = new FakeSocket();
    const bridge = new SpeechBridge(client as unknown as WebSocket, f.game, 'test-only', () => true, () => {}, () => provider as unknown as WebSocket);
    provider.emit('open');
    f.advance(f.game.round!.duration + late);
    assert.doesNotThrow(() => client.close());
    assert.equal(f.game.result?.outcome, 'escaped');
    bridge.close();
  }
});
test('background cleanup at the deadline keeps the timer outcome without throwing', () => {
  const f = fixture(); f.game.begin(); f.advance(f.game.round!.duration);
  assert.equal(f.game.endIfRunning('ended'), false);
  assert.equal(f.game.result?.outcome, 'escaped');
});
test('a mission third word can finish within grace; an earlier late word keeps its win but expires the mission', () => {
  for (const completedBefore of [1, 2]) {
    const f = fixture();
    f.game.data.mode = 'twitch'; f.game.connection.status = 'connected';
    f.game.update({ ...f.game.data.settings, mission: 'three', missionDuration: 60 });
    f.game.begin();
    for (let i = 0; i < completedBefore; i++) {
      f.game.transcript(f.transcript());
      f.advance(10000); f.game.tick();
    }
    f.game.mic = 'listening';
    const r = f.game.round!;
    f.advance(r.endsAt - f.now() + 200);
    assert.equal(f.game.transcript(f.transcript(r.word, { capturedAt: r.endsAt - 100 })), true);
    f.game.tick();
    assert.equal(f.game.mission?.status, completedBefore === 2 ? 'complete' : 'failed');
    assert.equal(f.game.score.wins, completedBefore + 1);
  }
});
test('a sustained audio gap pauses instead of using a drifting provider timeline', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = liveFixture(), client = new FakeSocket(), provider = new FakeSocket();
  const bridge = new SpeechBridge(client as unknown as WebSocket, f.game, 'test-only', () => true, () => {}, () => provider as unknown as WebSocket);
  provider.emit('open'); client.emit('message', Buffer.alloc(3200), true);
  t.mock.timers.tick(2500);
  client.emit('message', Buffer.alloc(3200), true);
  assert.equal(provider.sent.filter(Buffer.isBuffer).length, 1);
  assert.equal(f.game.phase, 'paused');
  bridge.close();
});

test('trusted proxy settings reject blanket trust and hop counts', () => {
  for (const value of ['true', '1', '*', '0.0.0.0/0', '::/0', '127.0.0.1/99'])
    assert.throws(() => loadConfig({ TRUSTED_PROXIES: value }));
  assert.deepEqual(loadConfig({ TRUSTED_PROXIES: '127.0.0.1, ::1/128' }).trustedProxies, ['127.0.0.1', '::1/128']);
});
for (const trusted of [false, true]) {
  test(`OAuth limits ${trusted ? 'separate clients behind the configured proxy' : 'ignore forged forwarded client headers'}`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'bait-proxy-'));
    const b = await createBait(loadConfig({ PORT: '0', DATA_DIR: dir, TWITCH_CLIENT_ID: 'test', TWITCH_CLIENT_SECRET: 'test', TOKEN_ENCRYPTION_KEY: key, TRUSTED_PROXIES: trusted ? '127.0.0.1' : '' }));
    await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await b.close(); await rm(dir, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
    for (let i = 0; i < 21; i++) {
      const response = await fetch(`${base}/auth/twitch`, { redirect: 'manual', headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` } });
      assert.equal(response.status, !trusted && i === 20 ? 429 : 302);
    }
    if (trusted) {
      const info = await (await fetch(`${base}/api/session`, { headers: { 'X-Forwarded-For': '198.51.100.1' } })).json();
      assert.equal(info.demoAvailable, false, 'public proxy clients cannot use loopback-only rehearsal');
    }
  });
}

test('live start and resume require a session-owned microphone lease; disarm pauses and blocks auto', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const dir = await mkdtemp(join(tmpdir(), 'bait-mic-'));
  const c = loadConfig({ PORT: '0', DATA_DIR: dir, SPEECH_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'fixture-key' }), b = await createBait(c);
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await b.close(); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  const demo = await fetch(`${base}/api/demo/start`, { method: 'POST', headers: { Origin: c.origin, 'Content-Type': 'application/json' }, body: '{}' });
  const cookie = demo.headers.get('set-cookie')!.split(';')[0], { csrf } = await demo.json();
  const session = b.sessions.get(cookie)!, game = b.rooms.get(session.roomId)!;
  session.mode = 'twitch'; game.data.mode = 'twitch'; game.connection.status = 'connected';
  const streamControl = new AbortController();
  const stream = await fetch(`${base}/api/studio/events`, { headers: { Cookie: cookie }, signal: streamControl.signal });
  const reader = stream.body!.getReader();
  await reader.read();
  t.after(() => { streamControl.abort(); void reader.cancel().catch(() => {}); });
  const leaseId = '11111111-1111-4111-8111-111111111111';
  const post = (path: string, body: object) => fetch(`${base}${path}`, { method: 'POST', headers: { Origin: c.origin, Cookie: cookie, 'x-csrf-token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(path === '/api/studio/microphone' ? { leaseId, ...body } : body) });
  assert.equal((await post('/api/studio/action', { action: 'start' })).status, 409);
  c.speechKey = '';
  assert.equal((await post('/api/studio/microphone', { armed: true })).status, 409);
  c.speechKey = 'fixture-key';
  assert.equal((await post('/api/studio/microphone', { armed: true })).status, 200);
  assert.equal((await post('/api/studio/action', { action: 'start' })).status, 200);
  const otherLease = '22222222-2222-4222-8222-222222222222';
  assert.equal((await post('/api/studio/microphone', { armed: true, leaseId: otherLease })).status, 409);
  const wrongSocket = new WebSocket(`${base.replace('http:', 'ws:')}/api/speech?${new URLSearchParams({ csrf, round: game.round!.id, epoch: String(game.round!.epoch), leaseId: otherLease })}`, { headers: { Cookie: cookie, Origin: c.origin } });
  const deniedSocket = await new Promise<number>((resolve, reject) => {
    wrongSocket.on('unexpected-response', (_request, response) => { response.resume(); resolve(response.statusCode!); wrongSocket.terminate(); });
    wrongSocket.on('open', () => reject(new Error('A competing capture was unexpectedly authorized')));
    wrongSocket.on('error', () => {});
  });
  assert.equal(deniedSocket, 403);
  assert.equal((await post('/api/studio/microphone', { armed: false, leaseId: otherLease })).status, 200);
  assert.equal(game.phase, 'active', 'a competing tab cannot disarm the capture owner');
  assert.equal((await post('/api/studio/microphone', { armed: false })).status, 200);
  assert.equal(game.phase, 'paused');
  assert.equal((await post('/api/studio/microphone', { armed: true, renew: true })).status, 409, 'delayed renewal cannot recreate a disarmed capture');
  assert.equal(game.canRun(), false);
  assert.equal((await post('/api/studio/action', { action: 'resume' })).status, 409);
  assert.equal((await post('/api/studio/microphone', { armed: true })).status, 200);
  assert.equal((await post('/api/studio/action', { action: 'resume' })).status, 200);
  assert.equal(game.canRun(), true);
  t.mock.timers.tick(30001);
  assert.equal(game.canRun(), false);
  assert.equal((await post('/api/studio/microphone', { armed: true, renew: true })).status, 409, 'expired capture must be explicitly enabled again');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(game.phase, 'paused');
  assert.equal((await post('/api/studio/microphone', { armed: true })).status, 200);
  assert.equal((await post('/api/studio/action', { action: 'resume' })).status, 200);
  streamControl.abort();
  await reader.cancel().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal((await post('/api/studio/microphone', { armed: true, renew: true })).status, 409, 'late renew cannot arm after studio stream closes');
  assert.equal((await post('/api/studio/microphone', { armed: true })).status, 409, 'even initial capture needs a live studio connection');
  b.sessions.deleteUser(session.userId);
  assert.equal(game.canRun(), false);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(game.phase, 'paused');
});


test('no initial PCM and a complete capture stall both pause without needing another packet', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  for (const hadAudio of [false, true]) {
    const f = liveFixture(), client = new FakeSocket(), provider = new FakeSocket();
    const bridge = new SpeechBridge(client as unknown as WebSocket, f.game, 'test-only', () => true, () => {}, () => provider as unknown as WebSocket);
    provider.emit('open');
    if (hadAudio) client.emit('message', Buffer.alloc(3200), true);
    t.mock.timers.tick(2001);
    bridge.sync();
    assert.equal(f.game.phase, 'paused');
    assert.equal(client.readyState, WebSocket.CLOSED);
    bridge.close();
  }
});

function authorizedFetcher(pendingRefresh?: ReturnType<typeof deferred<Response>>, onRefresh?: () => void): typeof fetch {
  return (async (url, init) => {
    if (String(url).endsWith('/token')) {
      if (new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token' && pendingRefresh) {
        onRefresh?.(); return pendingRefresh.promise;
      }
      return Response.json({ access_token: 'fresh-auth', refresh_token: 'fresh-refresh', expires_in: 3600, scope: ['user:read:chat'] });
    }
    if (String(url).endsWith('/validate')) return Response.json({ client_id: 'client-test', user_id: 'owner', login: 'owner', expires_in: 3600, scopes: ['user:read:chat'] });
    if (String(url).endsWith('/users')) return Response.json({ data: [{ id: 'owner', login: 'owner', display_name: 'Owner' }] });
    return Response.json({});
  }) as typeof fetch;
}
test('a superseded refresh cannot overwrite or invalidate a newer login', async () => {
  const store = new Store('unused-in-memory', key); store.save = async () => {};
  await store.setCredentials('owner', credentials);
  const pendingRefresh = deferred<Response>(), started = deferred<void>();
  const auth = new TwitchAuth(config, store, authorizedFetcher(pendingRefresh, () => started.resolve()));
  const pending = auth.access('owner').then(() => null, (e: unknown) => e);
  await started.promise;
  await auth.exchange('fresh-code');
  pendingRefresh.resolve(Response.json({ access_token: 'late-test', refresh_token: 'late-refresh', expires_in: 3600, scope: ['user:read:chat'] }));
  assert.ok(await pending instanceof AuthSuperseded);
  assert.equal(store.credentials('owner')?.access_token, 'fresh-auth');
});
for (const stopped of [false, true]) {
  test(`a ${stopped ? 'stopped' : 'superseded'} EventSub welcome cannot invalidate a new login`, async () => {
    const store = new Store('unused-in-memory', key); store.save = async () => {};
    await store.setCredentials('owner', credentials);
    const pendingRefresh = deferred<Response>(), started = deferred<void>();
    const auth = new TwitchAuth(config, store, authorizedFetcher(pendingRefresh, () => started.resolve()));
    const f = liveFixture(), socket = new FakeSocket();
    let invalidations = 0;
    const connection = new TwitchConnection(f.game, auth, () => { invalidations++; }, () => socket as unknown as WebSocket);
    connection.start();
    socket.emit('message', Buffer.from(JSON.stringify({
      metadata: { message_id: 'welcome', message_type: 'session_welcome', message_timestamp: new Date().toISOString() },
      payload: { session: { id: 'fixture-session', keepalive_timeout_seconds: 10 } },
    })));
    await started.promise;
    await auth.exchange('fresh-code');
    if (stopped) connection.stop();
    pendingRefresh.resolve(new Response('', { status: 401 }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(invalidations, 0);
    assert.equal(store.credentials('owner')?.access_token, 'fresh-auth');
    connection.stop();
  });
}
for (const operation of ['validate', 'api'] as const) {
  test(`a delayed ${operation} denial belongs to its old authorization generation`, async () => {
    const store = new Store('unused-in-memory', key); store.save = async () => {};
    await store.setCredentials('owner', { ...credentials, expiresAt: Date.now() + 3600000 });
    const denied = deferred<Response>(), started = deferred<void>(), base = authorizedFetcher();
    const auth = new TwitchAuth(config, store, (async (url, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      if ((operation === 'validate' && headers?.Authorization === 'OAuth old-test') ||
          (operation === 'api' && String(url).endsWith('/eventsub/subscriptions'))) {
        started.resolve(); return denied.promise;
      }
      return base(url, init);
    }) as typeof fetch);
    const task = operation === 'validate' ? auth.validate('owner') : auth.api('owner', 'eventsub/subscriptions');
    const pending = task.then(() => null, (e: unknown) => e);
    await started.promise;
    await auth.exchange('fresh-code');
    denied.resolve(new Response('', { status: 401 }));
    assert.ok(await pending instanceof AuthSuperseded);
    assert.equal(store.credentials('owner')?.access_token, 'fresh-auth');
  });
}
