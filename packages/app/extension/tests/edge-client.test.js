import test from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeExtensionClient, readRuntimeConfig, readState } from '../client.js';
import { runtimeConfigSource } from '../../scripts/build-extension.mjs';

class Socket {
  static opened = [];
  readyState = 1;
  constructor(url, protocols) { this.url = url; this.protocols = protocols; Socket.opened.push(this); }
  close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
  receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const config = { clientId: 'fixture123', apiBaseUrl: 'https://pilot.example', studioBaseUrl: 'https://pilot.example', transport: 'edge' };
const auth = (token = 'signed.jwt.token') => ({ clientId: 'fixture123', channelId: '1234', token });
const frame = (revision = 1) => ({ type: 'snapshot', protocol: 1, revision, generation: 1, room: {
  channel: 'streamer', phase: 'idle', serverTime: 10000, round: null, result: null,
} });
function harness() {
  Socket.opened = [];
  const timers = new Map(), states = [], statuses = [];
  let nextId = 0, clock = 1000;
  const client = createEdgeExtensionClient({ config, path: '/api/extension/state', parse: readState,
    onData: (state) => states.push(state), onStatus: (status) => statuses.push(status), WebSocketImpl: Socket,
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimer: (id) => timers.delete(id), now: () => clock });
  return { client, timers, states, statuses, advance: (ms) => { clock += ms; } };
}

test('edge transport is an explicit build option and Node remains the default', () => {
  assert.equal(readRuntimeConfig(config).transport, 'edge');
  const { transport, ...node } = config;
  assert.equal(readRuntimeConfig(node).transport, undefined);
  assert.match(runtimeConfigSource(config), /"transport":"edge"/);
  assert.doesNotMatch(runtimeConfigSource(node), /transport/);
  assert.throws(() => readRuntimeConfig({ ...config, transport: 'poll-fast' }));
});

test('native edge panel receives pushed snapshots with no periodic request timer', () => {
  const h = harness();
  try {
    h.client.authorize(auth());
    const socket = Socket.opened[0];
    assert.equal(socket.url, 'wss://pilot.example/v1/rooms/1234/socket');
    assert.deepEqual(socket.protocols, ['baited.v1', 'baited.auth.signed.jwt.token']);
    socket.receive(frame());
    assert.equal(h.states.length, 1); assert.equal(h.timers.size, 0);
    socket.receive(frame(2)); socket.receive(frame(1));
    assert.equal(h.states.length, 2);
    assert.equal(h.statuses.at(-1).kind, 'connected');
  } finally { h.client.destroy(); }
});

test('reauthorization ignores old snapshots and an expired token waits for Twitch', () => {
  const h = harness();
  try {
    h.client.authorize(auth()); const old = Socket.opened[0];
    h.client.authorize(auth('refreshed.jwt.token'));
    old.receive(frame()); assert.equal(h.states.length, 0);
    Socket.opened[1].close(1008, 'Expired');
    assert.equal(h.statuses.at(-1).kind, 'authorization');
    assert.equal(h.timers.size, 0);
  } finally { h.client.destroy(); }
});

test('brief visibility changes retain the socket, while five minutes hidden releases it', () => {
  const h = harness();
  try {
    h.client.authorize(auth()); const socket = Socket.opened[0]; socket.receive(frame());
    h.client.setVisible(false);
    assert.equal(socket.readyState, 1); assert.equal(h.statuses.at(-1).kind, 'authorization');
    const visibleFrames = h.states.length;
    socket.receive(frame(2));
    assert.equal(h.states.length, visibleFrames, 'Hidden snapshots are validated but not rendered.');
    h.client.setVisible(true);
    assert.equal(Socket.opened.length, 1);
    assert.equal(h.states.length, visibleFrames + 1);
    assert.equal(h.statuses.at(-1).kind, 'connected');
    for (let index = 0; index < 100; index++) { h.client.setVisible(false); h.client.setVisible(true); }
    assert.equal(Socket.opened.length, 1, 'One hundred quick switches consume one admission.');
    h.client.setVisible(false);
    const hidden = [...h.timers.entries()][0]; assert.equal(hidden[1].delay, 300000);
    h.advance(hidden[1].delay); h.timers.delete(hidden[0]); hidden[1].callback();
    assert.equal(socket.readyState, 3);
    h.client.setVisible(true); Socket.opened[1].receive({ type: 'snapshot', room: {} });
    assert.equal(h.statuses.at(-1).kind, 'invalid'); assert.equal(Socket.opened[1].readyState, 3);
    assert.equal(h.timers.size, 0);
  } finally { h.client.destroy(); }
});

test('refused pilot admission stops automatically and leaves a visible manual retry', () => {
  const h = harness();
  try {
    h.client.authorize(auth());
    Socket.opened[0].close(1006, ''); // Browser view of a rejected HTTP429 upgrade.
    assert.equal(h.statuses.at(-1).kind, 'unavailable');
    assert.match(h.statuses.at(-1).message, /full or temporarily unavailable/);
    assert.equal(h.timers.size, 0);
    h.client.refresh();
    assert.equal(Socket.opened.length, 2);
    Socket.opened[1].receive(frame());
    Socket.opened[1].close(1006, '');
    const retry = [...h.timers.entries()][0];
    assert.equal(retry[1].delay, 1000);
    h.timers.delete(retry[0]); retry[1].callback();
    Socket.opened[2].close(4429, 'Busy');
    assert.equal(h.statuses.at(-1).kind, 'unavailable');
    assert.equal(h.timers.size, 0, 'An explicit busy refusal cannot start another admission loop.');
  } finally { h.client.destroy(); }
});

test('an established connection retries a temporary outage for at most five minutes', () => {
  const h = harness();
  try {
    h.client.authorize(auth()); Socket.opened[0].receive(frame()); Socket.opened[0].close(1006, '');
    let elapsed = 0, attempts = 0;
    while (h.timers.size) {
      assert.ok(attempts++ < 20, 'Retries must be bounded.');
      const retry = [...h.timers.entries()][0];
      assert.ok(retry[1].delay <= 60000);
      elapsed += retry[1].delay; h.advance(retry[1].delay);
      h.timers.delete(retry[0]); retry[1].callback();
      Socket.opened.at(-1).close(1006, '');
    }
    assert.ok(attempts > 5, 'An established OBS/panel connection should survive more than five short failures.');
    assert.ok(elapsed <= 300000);
    assert.equal(h.statuses.at(-1).kind, 'unavailable');
  } finally { h.client.destroy(); }
});

test('anonymous pilot viewers see sign-in guidance without opening a socket, and logged-in opaque viewers can join', () => {
  const h = harness();
  const token = (opaque) => `header.${Buffer.from(JSON.stringify({ opaque_user_id: opaque, role: 'viewer' })).toString('base64url')}.signature`;
  try {
    h.client.authorize(auth(token('Aanonymous')));
    assert.equal(Socket.opened.length, 0); assert.equal(h.timers.size, 0);
    assert.equal(h.statuses.at(-1).kind, 'signin');
    assert.match(h.statuses.at(-1).message, /Sign in to Twitch/);
    assert.match(h.statuses.at(-1).message, /do not need to share/);
    h.client.authorize(auth(token('Uopaque-viewer')));
    assert.equal(Socket.opened.length, 1);
    Socket.opened[0].receive(frame());
    assert.equal(h.statuses.at(-1).kind, 'connected');
  } finally { h.client.destroy(); }
});
