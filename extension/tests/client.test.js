import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuntimeConfig, readState, readConfiguration, clockValue, createExtensionClient, connectToTwitch } from '../client.js';

const config = { clientId: 'baitedfixture0001', apiBaseUrl: 'https://game.example' };
const auth = (token = 'first-token') => ({ clientId: config.clientId, channelId: '12345', token });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (value, status = 200) => ({ status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(value) });
const state = () => ({
  version: '0.0.1', configured: true,
  room: {
    phase: 'active', channel: 'streamer', serverTime: 10000,
    round: { id: 'round-1', number: 1, duration: 60000, remaining: 45000, endsAt: 55000, target: 'Pineapple', forbiddenClues: ['Pizza', 'Fruit'] },
    result: null,
  },
});

function harness() {
  let counter = 0;
  const timers = new Map();
  const calls = [];
  const data = [];
  const statuses = [];
  const client = createExtensionClient({
    config, path: '/api/extension/state', parse: readState,
    onData: (value) => data.push(value), onStatus: (value) => statuses.push(value),
    setTimer: (fn, milliseconds) => { const id = ++counter; timers.set(id, { fn, milliseconds }); return id; },
    clearTimer: (id) => timers.delete(id),
    fetchImpl: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })),
  });
  return {
    client, calls, data, statuses,
    delays: () => [...timers.values()].map((t) => t.milliseconds),
    runTimer(milliseconds) {
      const entry = [...timers.entries()].find(([, timer]) => timer.milliseconds === milliseconds);
      assert.ok(entry, `Expected timer for ${milliseconds} ms`);
      timers.delete(entry[0]); entry[1].fn();
    },
  };
}

test('runtime configuration accepts exact HTTPS origins and explicit loopback development', () => {
  assert.deepEqual(readRuntimeConfig(config), { ...config, studioBaseUrl: config.apiBaseUrl });
  assert.equal(readRuntimeConfig({ ...config, apiBaseUrl: 'http://localhost:3443/' }).apiBaseUrl, 'http://localhost:3443');
  for (const apiBaseUrl of ['http://game.example', 'https://game.example/api', 'https://user:secret@game.example', 'https://game.example/?token=bad', 'https://game.example/#secret', 'javascript:alert(1)']) {
    assert.throws(() => readRuntimeConfig({ ...config, apiBaseUrl }));
  }
  assert.throws(() => readRuntimeConfig({ ...config, clientId: '' }));
  assert.throws(() => readRuntimeConfig({ ...config, clientId: 'id/other' }));
  assert.equal(readRuntimeConfig({ ...config, studioBaseUrl: 'http://localhost:3000' }).studioBaseUrl, 'http://localhost:3000');
  assert.throws(() => readRuntimeConfig({ ...config, studioBaseUrl: 'http://nonlocal.example' }));
  assert.throws(() => readRuntimeConfig({ ...config, studioBaseUrl: 'https://game.example/studio' }));
});

test('state parser keeps broadcaster projection secret-free and copies only display fields', () => {
  const value = state();
  delete value.room.round.target;
  delete value.room.round.forbiddenClues;
  value.room.roomId = 'internal-room-id';
  const parsed = readState(value);
  assert.equal(parsed.room.round.target, undefined);
  assert.deepEqual(parsed.room.round.forbiddenClues, []);
  assert.equal(parsed.room.roomId, undefined);
  assert.deepEqual(readState({ version: '0.0.1', configured: false, room: null }), { configured: false, room: null });
});

test('state parser rejects malformed payloads instead of rendering partial state', () => {
  const bad = state(); bad.room.round.remaining = -1;
  assert.throws(() => readState(bad));
  const long = state(); long.room.round.target = 'x'.repeat(121);
  assert.throws(() => readState(long));
  const review = state(); review.room.result = { id: 'result-1', word: 'Pineapple', outcome: 'review' };
  assert.equal(readState(review).room.result.outcome, 'review');
  review.room.result.outcome = 'confirmed-by-client';
  assert.throws(() => readState(review));
  assert.throws(() => readState({ version: '0.0.1', configured: true, room: { phase: 'idle' } }));
});

test('studio URL is restricted to the configured service and exact path', () => {
  const value = { version: '0.0.1', connected: true, channelId: '12345', channelName: 'streamer', studioUrl: 'https://game.example/studio' };
  assert.equal(readConfiguration(value, config.apiBaseUrl).studioUrl, value.studioUrl);
  assert.equal(readConfiguration({ ...value, studioUrl: 'http://localhost:3000/studio' }, 'http://localhost:3000').studioUrl, 'http://localhost:3000/studio');
  for (const studioUrl of ['https://other.example/studio', 'https://game.example/studio?token=bad', 'https://game.example/studio#secret', 'https://game.example/redirect', 'https://user:secret@game.example/studio']) {
    assert.throws(() => readConfiguration({ ...value, studioUrl }, config.apiBaseUrl));
  }
});

test('clock uses milliseconds and server offset, stops at zero, and freezes while paused', () => {
  const room = readState(state()).room;
  assert.deepEqual(clockValue(room, 500000, 501500), { milliseconds: 43500, fraction: 0.725, label: '0:44' });
  assert.equal(clockValue(room, 500000, 600000).label, '0:00');
  room.phase = 'paused'; room.round.endsAt = null;
  assert.equal(clockValue(room, 500000, 600000).label, '0:45');
});

test('token refresh aborts the old request, ignores its response, and never overlaps requests', async () => {
  const h = harness();
  h.client.authorize(auth());
  assert.equal(h.calls.length, 1);
  h.client.authorize(auth('refreshed-token'));
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve(response(state()));
  await flush();
  assert.equal(h.data.length, 0);
  h.runTimer(0);
  assert.equal(h.calls.length, 2);
  const fresh = h.calls[1];
  assert.equal(fresh.url, 'https://game.example/api/extension/state');
  assert.equal(fresh.options.headers.Authorization, 'Bearer refreshed-token');
  assert.equal(fresh.options.credentials, 'omit');
  assert.equal(fresh.options.redirect, 'error');
  fresh.resolve(response(state())); await flush();
  assert.equal(h.data.length, 1);
  assert.deepEqual(h.delays(), [1000]);
  h.client.destroy();
});

test('hidden panel aborts current request and only resumes when visible', async () => {
  const h = harness(); h.client.authorize(auth());
  h.client.setVisible(false);
  assert.equal(h.calls[0].options.signal.aborted, true);
  h.calls[0].resolve(response(state())); await flush();
  assert.equal(h.data.length, 0);
  assert.deepEqual(h.delays(), []);
  h.client.refresh(); assert.equal(h.calls.length, 1);
  h.client.setVisible(true); assert.equal(h.calls.length, 2);
  h.calls[1].resolve(response(state())); await flush();
  assert.equal(h.data.length, 1);
  h.client.destroy(); assert.deepEqual(h.delays(), []);
});

test('authorization rejection stops automatic requests until a new Helper token arrives', async () => {
  const h = harness(); h.client.authorize(auth());
  h.calls[0].resolve(response({}, 401)); await flush();
  assert.equal(h.statuses.at(-1).kind, 'authorization');
  assert.deepEqual(h.delays(), []);
  h.client.authorize(auth('new-token')); assert.equal(h.calls.length, 2);
  h.calls[1].resolve(response(state())); await flush();
  assert.equal(h.data.length, 1); h.client.destroy();
});

test('network failures back off and successful data resets the polling interval', async () => {
  const h = harness(); h.client.authorize(auth());
  h.calls[0].reject(new Error('private server detail')); await flush();
  assert.equal(h.statuses.at(-1).message, 'Connection interrupted. Retrying…');
  assert.deepEqual(h.delays(), [2000]);
  h.runTimer(2000); h.calls[1].resolve(response({}, 503)); await flush();
  assert.equal(h.statuses.at(-1).message, 'The game service is not ready. Retrying…');
  assert.deepEqual(h.delays(), [4000]);
  h.runTimer(4000); h.calls[2].resolve(response(state())); await flush();
  assert.deepEqual(h.delays(), [1000]); h.client.destroy();
});

test('wrong client ID invalidates previous request and cannot expose its response', async () => {
  const h = harness(); h.client.authorize(auth());
  h.client.authorize({ ...auth(), clientId: 'other-app' });
  h.calls[0].resolve(response(state())); await flush();
  assert.equal(h.data.length, 0);
  assert.equal(h.statuses.at(-1).kind, 'invalid');
  assert.deepEqual(h.delays(), []);
  h.client.refresh(); assert.equal(h.calls.length, 1); h.client.destroy();
});

test('Helper error and page destruction cancel requests and discard later responses', async () => {
  for (const action of ['invalidate', 'destroy']) {
    const h = harness(); h.client.authorize(auth()); h.client[action]();
    h.calls[0].resolve(response(state())); await flush();
    assert.equal(h.data.length, 0); assert.deepEqual(h.delays(), []);
    h.client.refresh(); assert.equal(h.calls.length, 1); h.client.destroy();
  }
});

test('a page restored from the back-forward cache resumes its authorized connection', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const windowMock = new EventTarget();
  const documentMock = new EventTarget(); documentMock.visibilityState = 'visible';
  let authorize;
  windowMock.BAITED_EXTENSION_CONFIG = config;
  windowMock.Twitch = { ext: { onAuthorized: (callback) => { authorize = callback; } } };
  globalThis.window = windowMock; globalThis.document = documentMock;
  const calls = [];
  let client;
  try {
    client = connectToTwitch({
      path: '/api/extension/state', parse: readState, onData() {}, onStatus() {},
      setTimer: () => 1, clearTimer() {},
      fetchImpl: (url, options) => new Promise((resolve) => calls.push({ options, resolve })),
    });
    authorize(auth()); assert.equal(calls.length, 1);
    const hide = new Event('pagehide'); Object.defineProperty(hide, 'persisted', { value: true });
    windowMock.dispatchEvent(hide);
    assert.equal(calls[0].options.signal.aborted, true);
    calls[0].resolve(response(state())); await flush();
    const show = new Event('pageshow'); Object.defineProperty(show, 'persisted', { value: true });
    windowMock.dispatchEvent(show);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.headers.Authorization, 'Bearer first-token');
    calls[1].resolve(response(state())); await flush();
  } finally {
    client?.destroy(); globalThis.window = previousWindow; globalThis.document = previousDocument;
  }
});
