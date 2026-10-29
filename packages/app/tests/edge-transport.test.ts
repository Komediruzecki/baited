import test from 'node:test';
import assert from 'node:assert/strict';
import { EdgeRoomTransport, readEdgeBootstrap, readEdgeSnapshot, type EdgeBootstrap, type EdgeSnapshot } from '../client/edge-transport';
import type { GameView } from '../shared/types';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
class Socket {
  readyState = 1; bufferedAmount = 0;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string, readonly protocols: string[]) {}
  send(message: string) { this.sent.push(message); }
  close(code = 1000, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
  receive(frame: unknown) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}
const bootstrap = (): EdgeBootstrap => ({ channelId: '1234', token: 'signed.fixture.token', tokenExpiresAt: Date.now() + 300000 });
const snapshot = (revision = 1): EdgeSnapshot => ({ type: 'snapshot', protocol: 1, revision, generation: 1,
  socketId: '00000000-0000-4000-8000-000000000001',
  room: { id: 'edge-1234', phase: 'active', serverTime: Date.now(), score: {}, settings: {},
    round: { id: 'round-1', epoch: 1 } } as GameView });
function harness(random = () => 1) {
  const sockets: Socket[] = [], calls: { url: string; init?: RequestInit }[] = [];
  const issued: EdgeBootstrap[] = [], signals: AbortSignal[] = [];
  let bootstrapCount = 0, failState = false;
  let bootstrapError: unknown, pendingBootstrap: Promise<EdgeBootstrap> | undefined;
  const client = new EdgeRoomTransport({ origin: 'https://pilot.example', random,
    bootstrap: async (signal) => {
      bootstrapCount++; signals.push(signal!);
      if (bootstrapError) throw bootstrapError;
      if (pendingBootstrap) return pendingBootstrap;
      const value = { ...bootstrap(), token: `signed.token.${bootstrapCount}` }; issued.push(value); return value;
    },
    socket: (url, protocols) => { const socket = new Socket(url, protocols); sockets.push(socket); return socket as unknown as WebSocket; },
    fetch: (async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith('/commands') ? Response.json({ ok: true, revision: 2, generation: 1, ...(failState ? {} : { snapshot: snapshot(2) }) })
        : failState ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json(snapshot(2));
    }) as typeof fetch });
  return { client, sockets, calls, issued, signals, failState: () => { failState = true; }, count: () => bootstrapCount,
    bootstrapError: (error?: unknown) => { bootstrapError = error; },
    pendingBootstrap: (pending: Promise<EdgeBootstrap>) => { pendingBootstrap = pending; } };
}
async function ready(h: ReturnType<typeof harness>) {
  const promise = h.client.state(); await flush(); h.sockets[0].receive(snapshot()); return promise;
}

test('bootstrap rejects expired or malformed credentials before opening a socket', () => {
  assert.equal(readEdgeBootstrap(bootstrap()).channelId, '1234');
  for (const change of [{ tokenExpiresAt: Date.now() - 1 }, { channelId: '../1234' }, { token: 'token in query' }, { token: '' }])
    assert.throws(() => readEdgeBootstrap({ ...bootstrap(), ...change }));
  assert.throws(() => readEdgeSnapshot({ ...snapshot(), revision: -1 }));
});

test('edge uses one socket with credential subprotocol and no snapshot polling', async () => {
  const h = harness();
  try {
    await ready(h);
    await h.client.state(); await h.client.state();
    assert.equal(h.sockets.length, 1); assert.equal(h.calls.length, 0);
    assert.equal(h.sockets[0].url, 'wss://pilot.example/v1/rooms/1234/socket');
    assert.deepEqual(h.sockets[0].protocols, ['baited.v1', 'baited.auth.signed.token.1']);
    assert.equal(new URL(h.sockets[0].url).search, '');
    const result = await h.client.command({ type: 'pause', roundId: 'round-1', epoch: 1 });
    assert.equal(result.revision, 2); assert.equal(h.calls.length, 1);
    const body = JSON.parse(h.calls[0].init!.body as string);
    assert.equal(body.expectedRevision, 1); assert.equal(body.generation, 1);
    assert.equal(body.action.type, 'pause'); assert.equal(typeof body.id, 'string');
    h.sockets[0].receive(snapshot(1));
    assert.equal((await h.client.state()).revision, 2, 'late snapshots cannot rewind the visible game');
  } finally { h.client.destroy(); }
});

test('control refresh coalesces requests and waits for a socket snapshot, without any HTTP GET', async () => {
  const h = harness();
  try {
    await ready(h);
    let settled = false;
    const first = h.client.refresh().then((value) => { settled = true; return value; });
    const second = h.client.refresh(); await flush();
    assert.equal(settled, false);
    assert.deepEqual(h.sockets[0].sent, ['resync']);
    assert.equal(h.calls.length, 0);
    h.sockets[0].receive(snapshot(2));
    assert.equal((await first).revision, 2); assert.equal((await second).revision, 2);
    assert.equal(h.calls.length, 0);
    const again = h.client.refresh(); await flush(); h.sockets[0].receive(snapshot(2));
    assert.equal((await again).revision, 2, 'An unchanged authoritative snapshot also completes a resync.');
  } finally { h.client.destroy(); }
});

test('resync timeout clears the shared waiter, and close or destroy rejects every waiting caller', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness();
  try {
    await ready(h);
    const first = assert.rejects(h.client.refresh(), /update.*has not arrived/);
    const second = assert.rejects(h.client.refresh(), /update.*has not arrived/);
    await flush(); t.mock.timers.tick(10000); await Promise.all([first, second]);
    const next = h.client.refresh(); await flush(); h.sockets[0].receive(snapshot(2)); await next;
    t.mock.timers.tick(10000); assert.equal(h.client.connected, true, 'A completed resync clears its timeout.');
    const closed = assert.rejects(h.client.refresh(), /connection ended/i); await flush();
    h.sockets[0].close(1006, 'Offline'); await closed;
    const reopen = h.client.state(); await flush(); h.sockets[1].receive(snapshot(3)); await reopen;
    const destroyed = assert.rejects(h.client.refresh(), /connection has closed/i); await flush();
    h.client.destroy(); await destroyed;
    assert.equal(h.calls.length, 0);
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});

test('reconnect and credential retry jitter spread attempts inside the exponential bounds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness(() => 0);
  try {
    await ready(h); h.client.subscribe(() => {}, () => {});
    h.bootstrapError(Object.assign(new Error('Temporary'), { status: 503 }));
    t.mock.timers.tick(180000); await flush(); assert.equal(h.count(), 2);
    t.mock.timers.tick(499); await flush(); assert.equal(h.count(), 2);
    h.bootstrapError(); t.mock.timers.tick(1); await flush(); assert.equal(h.count(), 3);
    const renewed = h.issued.at(-1)!;
    h.sockets[0].receive({ type: 'auth-refreshed', expiresAt: renewed.tokenExpiresAt });
    h.sockets[0].close(1006, 'Offline');
    t.mock.timers.tick(499); await flush(); assert.equal(h.sockets.length, 1);
    t.mock.timers.tick(1); await flush(); assert.equal(h.sockets.length, 2);
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});

test('Moonshine sends timing and final text on the authenticated socket, never audio', async () => {
  const h = harness();
  try {
    await ready(h);
    const speech = h.client.speechSocket('round-1', 1, 'lease-1');
    const statuses: unknown[] = [];
    speech.onmessage = (event) => statuses.push(JSON.parse(event.data));
    await flush();
    assert.deepEqual(statuses, [{ type: 'status', status: 'listening' }]);
    speech.send(JSON.stringify({ type: 'audio', samples: 4096 }));
    speech.send(JSON.stringify({ type: 'final', sequence: 1, line: { text: 'hello' } }));
    const frames = h.sockets[0].sent.map((frame) => JSON.parse(frame));
    assert.deepEqual(frames[0], { type: 'speech-audio', samples: 4096, leaseId: 'lease-1', roundId: 'round-1', epoch: 1 });
    assert.equal(frames[1].type, 'speech-final'); assert.equal(frames[1].sequence, 1);
    assert.equal(h.calls.length, 0);
    speech.send(new ArrayBuffer(64));
    assert.equal(speech.readyState, 3);
    assert.equal(h.sockets[0].sent.length, 2, 'audio bytes never leave the browser');
  } finally { h.client.destroy(); }
});

test('socket loss stops the microphone and a new connection never rearms it', async () => {
  const h = harness();
  try {
    await ready(h);
    const speech = h.client.speechSocket('round-1', 1, 'lease-1');
    const errors: unknown[] = [];
    speech.onmessage = (event) => { const frame = JSON.parse(event.data); if (frame.type === 'error') errors.push(frame); };
    await flush(); h.sockets[0].close(1006, 'Network lost');
    assert.equal(speech.readyState, 3); assert.equal(errors.length, 1);
    const next = h.client.state(); await flush(); h.sockets[1].receive(snapshot(2)); await next;
    speech.send(JSON.stringify({ type: 'audio', samples: 4096 }));
    assert.equal(h.sockets[1].sent.length, 0);
  } finally { h.client.destroy(); }
});

test('token renewal uses the same room socket and keeps the current microphone binding', async () => {
  const h = harness();
  try {
    await ready(h);
    const speech = h.client.speechSocket('round-1', 1, 'lease-1'); await flush();
    await (h.client as unknown as { renew(): Promise<void> }).renew();
    assert.equal(h.sockets.length, 1);
    assert.deepEqual(JSON.parse(h.sockets[0].sent[0]), { type: 'refresh-auth', token: 'signed.token.2' });
    h.sockets[0].receive({ type: 'auth-refreshed', expiresAt: h.issued.at(-1)!.tokenExpiresAt });
    assert.equal(h.client.bootstrap?.token, 'signed.token.2');
    assert.equal(speech.readyState, 1);
  } finally { h.client.destroy(); }
});

for (const error of [new TypeError('Network failed'), Object.assign(new Error('Service unavailable'), { status: 503 })])
  test(`transient renewal ${error.name}/${'status' in error ? error.status : 'network'} recovers on the same live socket`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
    const h = harness();
    try {
      await ready(h); h.client.subscribe(() => {}, () => {});
      const speech = h.client.speechSocket('round-1', 1, 'lease-1'); await flush();
      h.bootstrapError(error);
      t.mock.timers.tick(180000); await flush();
      assert.equal(h.count(), 2, 'Renew two minutes before expiry.');
      assert.equal(h.sockets[0].readyState, 1); assert.equal(speech.readyState, 1);
      h.bootstrapError();
      t.mock.timers.tick(1000); await flush();
      const renewed = h.issued.at(-1)!;
      assert.equal(h.count(), 3); assert.equal(h.sockets.length, 1);
      assert.equal(JSON.parse(h.sockets[0].sent[0]).token, renewed.token);
      h.sockets[0].receive({ type: 'auth-refreshed', expiresAt: renewed.tokenExpiresAt });
      assert.equal(h.client.bootstrap!.token, renewed.token);
      t.mock.timers.tick(119000); await flush();
      assert.equal(h.sockets[0].readyState, 1, 'Acknowledged renewal replaces the original expiry timer.');
      assert.equal(speech.readyState, 1);
    } finally { h.client.destroy(); t.mock.timers.reset(); }
  });

for (const status of [401, 403, 429]) test(`renewal HTTP ${status} stops unattended retries and closes the microphone`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness();
  try {
    await ready(h); h.client.subscribe(() => {}, () => {});
    const speech = h.client.speechSocket('round-1', 1, 'lease-1'); await flush();
    h.bootstrapError(Object.assign(new Error('Refused'), { status }));
    t.mock.timers.tick(180000); await flush();
    assert.equal(h.sockets[0].readyState, 3); assert.equal(speech.readyState, 3);
    t.mock.timers.tick(600000); await flush();
    assert.equal(h.count(), 2); assert.equal(h.sockets.length, 1);
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});

test('missing renewal acknowledgement reconnects OBS with fresh credentials, without rearming speech', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness();
  try {
    await ready(h); h.client.subscribe(() => {}, () => {});
    const speech = h.client.speechSocket('round-1', 1, 'lease-1'); await flush();
    t.mock.timers.tick(180000); await flush();
    t.mock.timers.tick(8000); await flush();
    assert.equal(h.sockets[0].readyState, 3); assert.equal(speech.readyState, 3);
    t.mock.timers.tick(1000); await flush();
    assert.equal(h.sockets.length, 2); assert.equal(h.count(), 3);
    h.sockets[1].receive(snapshot(2)); await flush();
    assert.equal(h.client.connected, true); assert.equal(speech.readyState, 3);
    assert.equal(h.sockets[1].sent.length, 0, 'Recovery cannot secretly arm the microphone.');
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});

test('renewal outage clears state at credential expiry, then permits only a fresh bootstrap', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness();
  try {
    await ready(h); h.client.subscribe(() => {}, () => {});
    h.bootstrapError(Object.assign(new Error('Temporary'), { status: 503 }));
    t.mock.timers.tick(180000); await flush();
    // Background timers may arrive late. Even a throttled retry must not keep an
    // expired connection or snapshot alive.
    t.mock.timers.tick(120000); await flush();
    assert.equal(h.sockets[0].readyState, 3); assert.equal(h.client.connected, false); assert.equal(h.client.current, undefined);
    h.bootstrapError();
    t.mock.timers.tick(1000); await flush();
    assert.equal(h.sockets.length, 2);
    h.sockets[1].receive(snapshot(3)); await flush();
    assert.equal(h.client.connected, true);
    assert.ok(h.client.bootstrap!.tokenExpiresAt > Date.now());
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});

test('destroy aborts an in-flight renewal and a late bootstrap cannot resurrect its socket', async () => {
  const h = harness();
  try {
    await ready(h);
    let finish!: (value: EdgeBootstrap) => void;
    h.pendingBootstrap(new Promise((resolve) => { finish = resolve; }));
    const pending = (h.client as unknown as { renew(): Promise<void> }).renew(); await flush();
    const signal = h.signals.at(-1)!; assert.equal(signal.aborted, false);
    h.client.destroy(); assert.equal(signal.aborted, true);
    finish(bootstrap()); await pending;
    assert.equal(h.sockets[0].sent.length, 0); assert.equal(h.sockets.length, 1);
    assert.equal(h.client.current, undefined);
  } finally { h.client.destroy(); }
});

test('a receipt without the authoritative projection does not claim a stale success or issue a state GET', async () => {
  const h = harness();
  try {
    await ready(h); h.failState();
    await assert.rejects(h.client.command({ type: 'start' }), /action arrived.*result could not be loaded/);
    assert.equal(h.calls.length, 1);
  } finally { h.client.destroy(); }
});

test('the browser fetch receiver is preserved when commands use the native implementation', async () => {
  const original = globalThis.fetch;
  let socket: Socket | undefined;
  globalThis.fetch = async function (this: unknown, url) {
    assert.equal(this, globalThis, 'native browser fetch requires its global receiver');
    return String(url).endsWith('/commands') ? Response.json({ ok: true, snapshot: snapshot(2) }) : Response.json(snapshot(2));
  };
  const client = new EdgeRoomTransport({ origin: 'https://pilot.example', bootstrap: async () => bootstrap(),
    socket: (url, protocols) => (socket = new Socket(url, protocols)) as unknown as WebSocket });
  try {
    const initial = client.state(); await flush(); socket!.receive(snapshot()); await initial;
    await client.command({ type: 'pause', roundId: 'round-1', epoch: 1 });
  } finally { client.destroy(); globalThis.fetch = original; }
});

test('microphone commands bind the current tab socket and cannot choose another socket', async () => {
  const h = harness();
  try {
    await ready(h);
    await h.client.command({ type: 'microphone', armed: true, leaseId: 'lease-1', socketId: 'another-tab' });
    assert.equal(JSON.parse(h.calls[0].init!.body as string).action.socketId, snapshot().socketId);
    h.sockets[0].close(1006, '');
    const pending = h.client.state(); await flush();
    h.sockets[1].receive({ ...snapshot(3), socketId: '00000000-0000-4000-8000-000000000002' }); await pending;
    await h.client.command({ type: 'microphone', armed: true, leaseId: 'lease-2' });
    assert.equal(JSON.parse(h.calls[1].init!.body as string).action.socketId, '00000000-0000-4000-8000-000000000002');
    assert.equal(h.calls.length, 2);
  } finally { h.client.destroy(); }
});

test('a missing socket binding prevents microphone control before any request', async () => {
  const h = harness();
  try {
    const pending = h.client.state(); await flush();
    const { socketId: _ignored, ...frame } = snapshot(); h.sockets[0].receive(frame); await pending;
    await assert.rejects(h.client.command({ type: 'microphone', armed: true }), /Studio connection needs to refresh/);
    assert.equal(h.calls.length, 0);
  } finally { h.client.destroy(); }
});

test('refused initial admission stops automatic retries even with a subscriber', async () => {
  const h = harness();
  try {
    const failures: boolean[] = [];
    h.client.subscribe(() => {}, (lost) => failures.push(lost));
    const initial = h.client.state(); await flush();
    const rejected = assert.rejects(initial, /full or temporarily unavailable/);
    h.sockets[0].close(1006, ''); await rejected; await flush();
    assert.ok(failures.includes(true));
    assert.equal(h.sockets.length, 1);
    assert.equal((h.client as unknown as { retryTimer?: unknown }).retryTimer, undefined);
  } finally { h.client.destroy(); }
});

test('established transport retries a temporary outage for five minutes, but stops on explicit refusal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const h = harness();
  try {
    await ready(h); h.client.subscribe(() => {}, () => {});
    h.sockets[0].close(1006, '');
    for (const [index, delay] of [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000].entries()) {
      t.mock.timers.tick(delay); await flush();
      assert.equal(h.sockets.length, index + 2);
      h.sockets.at(-1)!.close(1006, ''); await flush();
    }
    const exhausted = h.sockets.length;
    t.mock.timers.tick(300000); await flush();
    assert.equal(h.sockets.length, exhausted);
    const manual = h.client.state(); await flush(); h.sockets.at(-1)!.receive(snapshot(4)); await manual;
    h.sockets.at(-1)!.close(4408, 'Full');
    t.mock.timers.tick(300000); await flush();
    assert.equal(h.sockets.length, exhausted + 1, 'Explicit capacity refusal waits for a manual retry.');
  } finally { h.client.destroy(); t.mock.timers.reset(); }
});
