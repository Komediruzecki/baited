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
  room: { id: 'edge-1234', phase: 'active', serverTime: Date.now(), score: {}, settings: {},
    round: { id: 'round-1', epoch: 1 } } as GameView });
function harness() {
  const sockets: Socket[] = [], calls: { url: string; init?: RequestInit }[] = [];
  let bootstrapCount = 0, failState = false;
  const client = new EdgeRoomTransport({ origin: 'https://pilot.example',
    bootstrap: async () => ({ ...bootstrap(), token: `signed.token.${++bootstrapCount}` }),
    socket: (url, protocols) => { const socket = new Socket(url, protocols); sockets.push(socket); return socket as unknown as WebSocket; },
    fetch: (async (url: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return String(url).endsWith('/commands') ? Response.json({ ok: true, revision: 2, generation: 1 })
        : failState ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json(snapshot(2));
    }) as typeof fetch });
  return { client, sockets, calls, failState: () => { failState = true; }, count: () => bootstrapCount };
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
    assert.equal(result.revision, 2); assert.equal(h.calls.length, 2);
    const body = JSON.parse(h.calls[0].init!.body as string);
    assert.equal(body.expectedRevision, 1); assert.equal(body.generation, 1);
    assert.equal(body.action.type, 'pause'); assert.equal(typeof body.id, 'string');
    h.sockets[0].receive(snapshot(1));
    assert.equal((await h.client.state()).revision, 2, 'late snapshots cannot rewind the visible game');
  } finally { h.client.destroy(); }
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
    h.sockets[0].receive({ type: 'auth-refreshed', expiresAt: Date.now() + 300000 });
    assert.equal(h.client.bootstrap?.token, 'signed.token.2');
    assert.equal(speech.readyState, 1);
  } finally { h.client.destroy(); }
});

test('failed refresh after a committed command does not claim a stale success', async () => {
  const h = harness();
  try {
    await ready(h); h.failState();
    await assert.rejects(h.client.command({ type: 'start' }), /action arrived.*result could not be loaded/);
  } finally { h.client.destroy(); }
});

test('the browser fetch receiver is preserved when commands use the native implementation', async () => {
  const original = globalThis.fetch;
  let socket: Socket | undefined;
  globalThis.fetch = async function (this: unknown, url) {
    assert.equal(this, globalThis, 'native browser fetch requires its global receiver');
    return String(url).endsWith('/commands') ? Response.json({ ok: true }) : Response.json(snapshot(2));
  };
  const client = new EdgeRoomTransport({ origin: 'https://pilot.example', bootstrap: async () => bootstrap(),
    socket: (url, protocols) => (socket = new Socket(url, protocols)) as unknown as WebSocket });
  try {
    const initial = client.state(); await flush(); socket!.receive(snapshot()); await initial;
    await client.command({ type: 'pause', roundId: 'round-1', epoch: 1 });
  } finally { client.destroy(); globalThis.fetch = original; }
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
