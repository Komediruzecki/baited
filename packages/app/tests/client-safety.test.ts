import test from 'node:test';
import assert from 'node:assert/strict';
import { WinSoundGate, microphoneReady, MicrophoneLease } from '../client/safety';
import { Microphone } from '../client/microphone';
import type { Result } from '../shared/types';

const result = (id: string, outcome: Result['outcome'] = 'caught'): Result => ({
  id, outcome, number: 1, word: 'banana', elapsed: 8, participants: 2, at: 100,
});

test('sound requires per-visit opt-in and never replays a restored or repeated result', () => {
  const gate = new WinSoundGate();
  assert.equal(gate.receive(result('historical')), false);
  gate.enabled = true;
  assert.equal(gate.receive(result('historical')), false);
  assert.equal(gate.receive(result('new')), true);
  assert.equal(gate.receive(result('new')), false);
  assert.equal(gate.receive(result('escaped', 'escaped')), false);
  gate.enabled = false;
  assert.equal(gate.receive(result('muted')), false);
  gate.enabled = true;
  assert.equal(gate.receive(result('muted')), false);
  const reloaded = new WinSoundGate();
  assert.equal(reloaded.enabled, false);
  reloaded.enabled = true;
  assert.equal(reloaded.receive(result('muted')), false);
});

test('first fresh win after an empty snapshot plays only after opt-in', () => {
  const gate = new WinSoundGate();
  assert.equal(gate.receive(null), false);
  assert.equal(gate.receive(result('silent')), false);
  gate.enabled = true;
  assert.equal(gate.receive(result('fresh')), true);
});

test('starting speech needs configured provider and armed capture, not a circular listening handshake', () => {
  assert.equal(microphoneReady(true, true, 'armed'), true);
  for (const status of ['off', 'connecting', 'listening', 'settling']) {
    assert.equal(microphoneReady(true, true, status), false);
  }
  assert.equal(microphoneReady(false, true, 'armed'), false);
  assert.equal(microphoneReady(true, false, 'armed'), false);
});

function microphoneHarness() {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };
  const track = { onended: null as (() => void) | null, stopped: 0, stop() { this.stopped++; } };
  const stream = { getTracks: () => [track] };
  const node = () => ({ connect() {}, disconnect() {} });
  const posts: { enabled: boolean; generation: number }[] = [];
  let port: { onmessage?: (e: { data: { buffer: ArrayBuffer; generation: number } }) => void; postMessage: (v: { enabled: boolean; generation: number }) => void };
  class FakeContext {
    audioWorklet = { addModule: async () => {} };
    destination = {};
    resume = async () => {};
    close = async () => {};
    createMediaStreamSource = node;
    createGain = () => ({ ...node(), gain: { value: 1 } });
  }
  class FakeWorklet {
    port = port = { postMessage: (v) => posts.push(v) };
    disconnect() {}
    connect() {}
  }
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    sent: ArrayBuffer[] = [];
    closed = false;
    onmessage?: (event: { data: string }) => void;
    onclose?: ((event: { code: number; reason: string }) => void) | null;
    onerror?: (() => void) | null;
    constructor(readonly url: URL) { sockets.push(this); }
    send(buffer: ArrayBuffer) { this.sent.push(buffer); }
    close() { this.closed = true; }
    status(status: string) { this.onmessage?.({ data: JSON.stringify({ type: 'status', status }) }); }
  }
  const device = { getUserMedia: async () => stream };
  replace('navigator', { mediaDevices: device });
  replace('AudioContext', FakeContext);
  replace('AudioWorkletNode', FakeWorklet);
  replace('WebSocket', FakeSocket);
  replace('location', { href: 'http://localhost:3317', protocol: 'http:' });
  const statuses: string[] = [], errors: string[] = [];
  const mic = new Microphone((v) => statuses.push(v), () => {}, (v) => errors.push(v), 'deepgram');
  return {
    mic, sockets, track, device, stream, statuses, errors, posts,
    emit() {
      port.onmessage?.({ data: { buffer: new Int16Array([123, 456]).buffer, generation: posts.at(-1)!.generation } });
    },
    restore() {
      mic.stop();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('settling stops PCM but preserves the socket, even if listening status arrives late', async () => {
  const h = microphoneHarness();
  try {
    assert.equal(await h.mic.enable(), true);
    h.mic.connect('round', 1, 'csrf', 'capture-id');
    const socket = h.sockets[0];
    assert.equal(socket.url.searchParams.get('leaseId'), 'capture-id');
    socket.status('listening');
    h.emit();
    assert.equal(socket.sent.length, 1);
    h.mic.suspend();
    socket.status('listening');
    h.emit();
    assert.equal(socket.sent.length, 1);
    assert.equal(socket.closed, false);
    assert.equal(h.statuses.at(-1), 'settling');
    assert.equal(h.posts.at(-1)?.enabled, false);
  } finally { h.restore(); }
});

test('backpressure stops capture and reports failure instead of silently dropping audio', async () => {
  const h = microphoneHarness();
  try {
    await h.mic.enable();
    h.mic.connect('round', 1, 'csrf', 'capture-id');
    const socket = h.sockets[0];
    socket.status('listening');
    socket.bufferedAmount = 64000;
    h.emit();
    assert.equal(socket.sent.length, 0);
    assert.equal(socket.closed, true);
    assert.equal(h.track.stopped, 1);
    assert.equal(h.statuses.at(-1), 'off');
    assert.match(h.errors[0], /could not keep up/);
  } finally { h.restore(); }
});

test('a cancelled microphone permission request releases its eventual stream', async () => {
  const h = microphoneHarness();
  try {
    let resolve!: (stream: typeof h.stream) => void;
    h.device.getUserMedia = () => new Promise((r) => { resolve = r; });
    const enabling = h.mic.enable();
    h.mic.stop();
    resolve(h.stream);
    assert.equal(await enabling, false);
    assert.equal(h.track.stopped, 1);
    assert.ok(!h.statuses.includes('armed'));
  } finally { h.restore(); }
});

test('unexpected speech closure stops the microphone and reports a recoverable error', async () => {
  const h = microphoneHarness();
  try {
    await h.mic.enable();
    h.mic.connect('round', 1, 'csrf', 'capture-id');
    h.sockets[0].onclose?.({ code: 1006, reason: '' });
    assert.equal(h.track.stopped, 1);
    assert.equal(h.statuses.at(-1), 'off');
    assert.match(h.errors[0], /Enable the microphone again/);
  } finally { h.restore(); }
});

test('late permission rejection from a cancelled capture does not report against a new capture', async () => {
  const h = microphoneHarness();
  const nextStatuses: string[] = [], nextErrors: string[] = [];
  const next = new Microphone((s) => nextStatuses.push(s), () => {}, (e) => nextErrors.push(e), 'deepgram');
  try {
    let reject!: (error: Error) => void;
    h.device.getUserMedia = () => new Promise((_, r) => { reject = r; });
    const pending = h.mic.enable();
    h.mic.stop();
    h.device.getUserMedia = async () => h.stream;
    assert.equal(await next.enable(), true);
    reject(new Error('old permission request failed'));
    assert.equal(await pending, false);
    assert.deepEqual(h.errors, []);
    assert.deepEqual(nextErrors, []);
    assert.equal(nextStatuses.at(-1), 'armed');
    assert.equal(next.enabled, true);
  } finally { next.stop(); h.restore(); }
});

test('a delayed arm response compensates only its cancelled capture lease', async () => {
  let current: string | null = null;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const requests: { armed: boolean; leaseId: string; renew?: boolean }[] = [];
  const update = async (body: { armed: boolean; leaseId: string; renew?: boolean }) => {
    requests.push(body);
    if (body.armed) {
      assert.ok(!current || current === body.leaseId);
      current = body.leaseId;
      if (body.leaseId === 'old') await delayed;
    } else if (current === body.leaseId) current = null;
  };
  const old = new MicrophoneLease('old', update);
  const pending = old.arm();
  await old.cancel();
  const next = new MicrophoneLease('next', update);
  assert.equal(await next.arm(), true);
  release();
  assert.equal(await pending, false);
  assert.equal(current, 'next');
  assert.equal(old.active, false);
  assert.equal(next.active, true);
  assert.deepEqual(requests.at(-1), { armed: false, leaseId: 'old' });
});

test('a deferred renewal cannot revive a cancelled capture or fail the next capture', async () => {
  let reject!: (error: Error) => void;
  const requests: { armed: boolean; leaseId: string; renew?: boolean }[] = [];
  const old = new MicrophoneLease('old', async (body) => {
    requests.push(body);
    if (body.renew) await new Promise<void>((_, r) => { reject = r; });
  });
  await old.arm();
  const renewal = old.renew();
  await old.cancel();
  const next = new MicrophoneLease('next', async () => {});
  await next.arm();
  reject(new Error('lease has been disarmed'));
  assert.equal(await renewal, false);
  assert.equal(await old.renew(), false);
  assert.equal(next.active, true);
  assert.deepEqual(requests, [
    { armed: true, leaseId: 'old' },
    { armed: true, leaseId: 'old', renew: true },
    { armed: false, leaseId: 'old' },
  ]);
});
