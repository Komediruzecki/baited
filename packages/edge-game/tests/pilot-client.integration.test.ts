import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { EdgeRoomTransport } from '../../app/client/edge-transport.js';
import { createEdgeExtensionClient, readState } from '../../app/extension/client.js';
import { createLocalOptions } from '../scripts/local-options.mjs';
import { nodeBuiltinGuard } from '../scripts/build.mjs';

// Synthetic public keys, no provider connection. Client transport and room
// authority are production code; only OAuth and network plumbing are fixtures.
const ORIGIN = 'https://pilot.test';
const SECRET = Buffer.alloc(32, 17).toString('base64');
const EXTENSION_SECRET = Buffer.alloc(32, 29).toString('base64');
function sign(role: 'studio' | 'overlay' | 'viewer') {
  const now = Math.floor(Date.now() / 1000);
  const payload = role === 'viewer'
    ? { channel_id: '123', role, opaque_user_id: 'U456', user_id: '456', iat: now, exp: now + 300 }
    : { iss: 'baited-edge-pilot', aud: 'baited-edge', channel_id: '123', role,
      sid: 'fixture-studio-session', sub: 'twitch:123', iat: now, exp: now + 300 };
  const parts = [{ alg: 'HS256', typ: 'JWT' }, payload].map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${parts}.${createHmac('sha256', Buffer.from(role === 'viewer' ? EXTENSION_SECRET : SECRET, 'base64')).update(parts).digest('base64url')}`;
}
async function until(condition: () => unknown, message: string) {
  const end = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() >= end) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('real edge clients share one authoritative round with role privacy, speech confirmation and no polling', { timeout: 20_000 }, async () => {
  const bundle = await build({ stdin: { contents: `
    import gateway from '../src/index.js';
    import { ChannelRoom as BaseRoom } from '../src/room.js';
    import { DurableObject } from 'cloudflare:workers';
    export default gateway;
    export class MockControl extends DurableObject {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === '/internal/authorize') return Response.json({allowed:true,login:'komediruzecki7'});
        if (path === '/internal/room-event') return Response.json({ok:true});
        return new Response('No provider in this fixture.', {status:503});
      }
    }
    export class ChannelRoom extends BaseRoom {
      async bootstrapFixture() {
        return (await this.fetch(new Request('https://room.internal/internal/control', {
          method:'POST',body:JSON.stringify({channelId:'123',login:'komediruzecki7',type:'connection',status:'connected'})
        }))).status;
      }
    }
  `, loader: 'ts', sourcefile: 'pilot-client-fixture.ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    external: ['cloudflare:workers'], plugins: [nodeBuiltinGuard()], write: false });
  const options = createLocalOptions({ port: 0, statePath: false, script: bundle.outputFiles[0]!.text, bindings: {
    EDGE_POC_ENABLED: 'false', EDGE_PILOT_ENABLED: 'true', EDGE_LOCAL_FIXTURE_AUTH: 'false',
    EDGE_PILOT_SECRET_B64: SECRET, TWITCH_EXTENSION_SECRET_B64: EXTENSION_SECRET,
    EDGE_ALLOWED_ORIGINS: ORIGIN, EDGE_PUBLIC_ORIGIN: ORIGIN,
  } });
  const worker = options.workers[0].config;
  worker.env.CONTROL = { type: 'durable-object', worker: worker.name, exportName: 'MockControl' };
  worker.exports.MockControl = { type: 'durable-object', storage: 'sqlite' };
  const mf = new Miniflare(options);
  const clients: EdgeRoomTransport[] = [];
  let native: ReturnType<typeof createEdgeExtensionClient> | undefined;
  try {
    const ready = await mf.ready;
    options.port = Number(ready.port);
    worker.env.EDGE_ALLOWED_HOSTS.value = ready.host;
    await mf.setOptions(options);
    const ns = await mf.getDurableObjectNamespace('ROOMS');
    const stub = ns.get(ns.idFromName('channel:123')) as unknown as { bootstrapFixture(): Promise<number> };
    assert.equal(await stub.bootstrapFixture(), 200);
    const calls: string[] = [], frames: string[] = [];
    const route = (url: string) => `${ready.origin}${new URL(url).pathname}`;
    class Socket {
      readyState = 0; bufferedAmount = 0;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number; reason: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      peer?: WebSocket;
      constructor(url: string, protocols: string[]) {
        assert.equal(new URL(url).search, '');
        void mf.dispatchFetch(route(url), { headers: { origin: ORIGIN, upgrade: 'websocket', 'sec-websocket-protocol': protocols.join(', ') } }).then((response) => {
          assert.equal(response.status, 101);
          const peer = response.webSocket!;
          this.peer = peer as unknown as WebSocket;
          peer.addEventListener('message', (event) => this.onmessage?.({ data: String(event.data) }));
          peer.addEventListener('close', (event) => { this.readyState = 3; this.onclose?.({ code: event.code, reason: event.reason }); });
          this.readyState = 1;
          peer.accept();
        }).catch(() => this.onerror?.());
      }
      send(value: string) { frames.push(value); this.peer!.send(value); }
      close(code = 1000, reason = '') { this.readyState = 3; this.peer?.close(code, reason); }
    }
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(new URL(String(input)).pathname);
      return await mf.dispatchFetch(route(String(input)), { ...init,
        headers: { ...Object.fromEntries(new Headers(init?.headers)), origin: ORIGIN } }) as unknown as Response;
    };
    const client = (role: 'studio' | 'overlay') => {
      const value = new EdgeRoomTransport({ origin: ORIGIN,
        bootstrap: async () => ({ channelId: '123', token: sign(role), tokenExpiresAt: Date.now() + 300_000 }),
        fetch: fetchImpl, socket: (url, protocols) => new Socket(url, protocols) as unknown as WebSocket });
      clients.push(value); return value;
    };
    const studio = client('studio'), obs = client('overlay');
    const nativeStates: ReturnType<typeof readState>[] = [];
    const statuses: string[] = [];
    native = createEdgeExtensionClient({ config: { clientId: 'fixture123', apiBaseUrl: ORIGIN, studioBaseUrl: ORIGIN, transport: 'edge' },
      path: '/api/extension/state', parse: readState, onData: (state) => nativeStates.push(state),
      onStatus: (status) => statuses.push(status.kind), WebSocketImpl: Socket });
    native.authorize({ clientId: 'fixture123', channelId: '123', token: sign('viewer') });
    await Promise.all([studio.state(), obs.state()]);
    await until(() => nativeStates.length, 'Native Extension did not receive its initial snapshot.');
    assert.equal(calls.length, 0, 'Initial state is socket-pushed, not fetched or polled.');
    const leaseId = randomUUID();
    await studio.command({ type: 'microphone', armed: true, leaseId, renew: false });
    const started = await studio.command({ type: 'start' });
    const round = started.room!.round!;
    await until(() => nativeStates.at(-1)?.room?.phase === 'active' && obs.current?.room?.phase === 'active', 'Cards did not receive the same active round.');
    const target = nativeStates.at(-1)!.room!.round!.target!;
    assert.equal(typeof target, 'string');
    for (const hidden of [started.room!.round!, obs.current!.room!.round!]) {
      for (const field of ['target', 'forbiddenClues', 'cardId', 'artId', 'artUrl']) assert.equal(field in hidden, false);
    }
    const viewerFrames = nativeStates.length, obsRevision = obs.current!.revision;
    const renewed = await studio.command({ type: 'microphone', armed: true, leaseId, renew: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(renewed.revision > started.revision, 'The lease renewal is durably accepted.');
    assert.equal(nativeStates.length, viewerFrames, 'An unchanged lease renewal does not fan out another viewer snapshot.');
    assert.equal(obs.current!.revision, obsRevision, 'An unchanged lease renewal does not fan out another OBS snapshot.');
    const speech = studio.speechSocket(round.id, round.epoch, leaseId);
    await until(() => speech.readyState === 1, 'Local speech adapter did not bind.');
    await new Promise((resolve) => setTimeout(resolve, 350));
    speech.send(JSON.stringify({ type: 'audio', samples: 4096 }));
    speech.send(JSON.stringify({ type: 'final', sequence: 1, line: {
      id: 'fixture-real-catch', text: target, isComplete: true, startTime: 0.1, duration: 0.1,
      words: [{ text: target, start: 0.1, end: 0.2, confidence: 1 }],
    } }));
    await until(() => studio.current?.room?.result?.outcome === 'review', 'Valid local final did not produce a confirmation.');
    assert.equal(studio.current!.room!.score.wins, 0, 'Recognition cannot award a win before confirmation.');
    await studio.command({ type: 'catch', roundId: round.id, decision: 'confirm' });
    await until(() => obs.current?.room?.score.wins === 1 && nativeStates.at(-1)?.room?.result?.word === target, 'Confirmed result did not reach the viewers and OBS.');
    assert.equal(obs.current!.room!.result!.word, target);
    assert.ok(frames.every((frame) => typeof frame === 'string'));
    assert.deepEqual(frames.map((value) => JSON.parse(value).type), ['speech-audio', 'speech-final']);
    assert.equal(calls.length, 8, 'Only four command receipts and four explicit state reads were used.');
    assert.ok(!statuses.includes('invalid'), 'The native parser accepts real room snapshots.');
  } finally {
    native?.destroy();
    clients.forEach((client) => client.destroy());
    await mf.dispose();
  }
});
