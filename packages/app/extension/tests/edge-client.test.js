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
  let nextId = 0;
  const client = createEdgeExtensionClient({ config, path: '/api/extension/state', parse: readState,
    onData: (state) => states.push(state), onStatus: (status) => statuses.push(status), WebSocketImpl: Socket,
    setTimer: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimer: (id) => timers.delete(id) });
  return { client, timers, states, statuses };
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

test('hidden or malformed panels close their socket and clear authorization-sensitive UI', () => {
  const h = harness();
  try {
    h.client.authorize(auth()); const socket = Socket.opened[0]; socket.receive(frame());
    h.client.setVisible(false);
    assert.equal(socket.readyState, 3); assert.equal(h.statuses.at(-1).kind, 'authorization');
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
    Socket.opened[2].close(1006, '');
    assert.equal(h.statuses.at(-1).kind, 'unavailable');
    assert.equal(h.timers.size, 0, 'A refused reconnect cannot start another admission loop.');
  } finally { h.client.destroy(); }
});
