import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import type { GameView } from '../../app/shared/types.js';
import type { Command, Receipt } from '../src/protocol.js';
import { createLocalOptions } from '../scripts/local-options.mjs';
import { nodeBuiltinGuard } from '../scripts/build.mjs';

// Public synthetic signing material. No provider credentials or outbound access.
const PILOT_SECRET = Buffer.alloc(32, 17).toString('base64');
const EXTENSION_SECRET = Buffer.alloc(32, 29).toString('base64');
const ORIGIN = 'https://pilot.test';
const SESSION = 'fixture-studio-session';
interface Snapshot { type: 'snapshot'; revision: number; generation: number; room: GameView }
interface Inspection {
  alarm: number | null; now: number; revision: number; phase: string; mic: string;
  round: { id: string; segmentAt: number; endsAt: number | null; remaining: number; result?: string } | null;
  lease: unknown; chatReceipts: number; history: number; participants: number;
  sockets: {role:string;expiresAt:number;generation:number;readyState:number}[];
}
interface FixtureStub {
  bootstrapFixture(): Promise<number>;
  inspectFixture(): Promise<Inspection>;
  reconcileAtFixture(at: number): Promise<Inspection>;
  chatFixture(event: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
  disconnectFixture(): Promise<number>;
  freezeAtFixture(at: number): Promise<void>;
}
let script: string;

before(async () => {
  // Only this test bundle exports RPC fixture methods. The production entry and
  // the production room class do not expose a clock override or fake chat route.
  const fixture = await build({
    stdin: {
      contents: `
        import gateway from '../src/index.js';
        import { ChannelRoom as BaseRoom } from '../src/room.js';
        import { DurableObject } from 'cloudflare:workers';
        export default gateway;
        export class MockControl extends DurableObject {
          allowed = true;
          denyFixture() { this.allowed = false; }
          async fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === '/internal/authorize') {
              const body = await request.json();
              return Response.json({allowed: this.allowed && body.channelId === '123', login: 'komediruzecki7'});
            }
            if (path === '/internal/room-event') return Response.json({ok: true});
            return new Response('No external provider in this fixture.', {status: 503});
          }
        }
        export class ChannelRoom extends BaseRoom {
          async bootstrapFixture() {
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST', body:JSON.stringify({channelId:'123', login:'komediruzecki7', type:'connection', status:'connected'})
            }))).status;
          }
          async inspectFixture() {
            const self = this;
            return {alarm: await this.ctx.storage.getAlarm(), now:self.now, revision:self.revision,
              phase:self.game.phase, mic:self.game.mic, lease:self.pilotState.lease,
              round:self.game.round ? {id:self.game.round.id, segmentAt:self.game.round.segmentAt,
                endsAt:self.game.round.endsAt, remaining:self.game.round.remaining, result:self.game.round.result} : null,
              history:self.game.data.history.length,
              participants:self.game.round?.participants.size ?? 0,
              sockets:this.ctx.getWebSockets().map(ws => ({role:ws.deserializeAttachment().identity.role,
                expiresAt:ws.deserializeAttachment().identity.expiresAt,
                generation:ws.deserializeAttachment().identity.generation,readyState:ws.readyState})),
              chatReceipts:this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_chat_receipt').one().n};
          }
          async reconcileAtFixture(at) {
            const clock = Date.now;
            Date.now = () => at;
            try { await this.serial(() => this.reconcile()); return await this.inspectFixture(); }
            finally { Date.now = clock; }
          }
          freezeAtFixture(at) { Date.now = () => at; }
          async chatFixture(event) {
            const response = await this.fetch(new Request('https://room.internal/internal/twitch-chat', {
              method:'POST', body:JSON.stringify(event)
            }));
            return {status:response.status, body:await response.json()};
          }
          async disconnectFixture() {
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST', body:JSON.stringify({channelId:'123',type:'disconnect',sessionId:'fixture-studio-session'})
            }))).status;
          }
        }
      `,
      loader: 'ts', sourcefile: 'pilot-room-inline-fixture.ts',
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    external: ['cloudflare:workers'], plugins: [nodeBuiltinGuard()], write: false,
  });
  script = fixture.outputFiles[0]!.text;
});

async function runtime(bindings: Record<string, string> = {}) {
  const options = createLocalOptions({ port: 0, statePath: false, script, bindings: {
    EDGE_POC_ENABLED: 'false', EDGE_PILOT_ENABLED: 'true', EDGE_LOCAL_FIXTURE_AUTH: 'false',
    EDGE_PILOT_SECRET_B64: PILOT_SECRET, TWITCH_EXTENSION_SECRET_B64: EXTENSION_SECRET,
    EDGE_ALLOWED_ORIGINS: ORIGIN, EDGE_PUBLIC_ORIGIN: ORIGIN,
    ...bindings,
  } });
  const worker = options.workers[0].config;
  worker.env.CONTROL = { type: 'durable-object', worker: worker.name, exportName: 'MockControl' };
  worker.exports.MockControl = { type: 'durable-object', storage: 'sqlite' };
  const mf = new Miniflare(options);
  try {
    const ready = await mf.ready;
    options.port = Number(ready.port);
    worker.env.EDGE_ALLOWED_HOSTS.value = `${ready.host},pilot.test`;
    await mf.setOptions(options);
    const namespace = await mf.getDurableObjectNamespace('ROOMS');
    const stub = namespace.get(namespace.idFromName('channel:123')) as unknown as FixtureStub;
    assert.equal(await stub.bootstrapFixture(), 200);
    return { mf, stub };
  } catch (error) { await mf.dispose(); throw error; }
}

function sign(payload: Record<string, unknown>, secret: string): string {
  const contents = [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${contents}.${createHmac('sha256', Buffer.from(secret, 'base64')).update(contents).digest('base64url')}`;
}
function token(role: 'studio' | 'overlay' | 'viewer' | 'broadcaster' = 'studio', overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return role === 'viewer' || role === 'broadcaster'
    ? sign({channel_id:'123', role, opaque_user_id: role === 'viewer' ? 'U456' : 'U123', user_id:role === 'viewer' ? '456' : '123', iat:now, exp:now+300, ...overrides}, EXTENSION_SECRET)
    : sign({iss:'baited-edge-pilot', aud:'baited-edge', channel_id:'123', role, sid:SESSION, sub:'twitch:123', iat:now, exp:now+300, ...overrides}, PILOT_SECRET);
}
async function endpoint(mf: Miniflare, route: string) { return `${(await mf.ready).origin}/v1/rooms/123/${route}`; }
async function state(mf: Miniflare, role: Parameters<typeof token>[0] = 'studio'): Promise<Snapshot> {
  const response = await mf.dispatchFetch(await endpoint(mf, 'state'), {headers:{origin:ORIGIN, authorization:`Bearer ${token(role)}`}});
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as Snapshot;
}
async function send(mf: Miniflare, action: Command['action'], revision: number): Promise<Receipt> {
  const response = await mf.dispatchFetch(await endpoint(mf, 'commands'), {method:'POST',
    headers:{origin:ORIGIN, authorization:`Bearer ${token()}`, 'content-type':'application/json'},
    body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:revision,action})});
  const body = await response.json() as Receipt;
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
async function connectedStudio(mf: Miniflare, role: Parameters<typeof token>[0] = 'studio', credential = token(role)) {
  const response = await mf.dispatchFetch(await endpoint(mf, 'socket'), {headers:{
    origin:ORIGIN, upgrade:'websocket', 'sec-websocket-protocol':`baited.v1, baited.auth.${credential}`,
  }});
  assert.equal(response.status, 101);
  const ws = response.webSocket!;
  const initial = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local pilot socket did not receive a snapshot.')), 2_000);
    ws.addEventListener('message', (event) => {
      clearTimeout(timer);
      assert.equal(JSON.parse(String(event.data)).type, 'snapshot');
      resolve();
    }, {once:true});
  });
  ws.accept();
  await initial;
  return ws;
}
async function start(mf: Miniflare) {
  const ws = await connectedStudio(mf);
  const initial = await state(mf);
  const mic = await send(mf, {type:'microphone',armed:true,leaseId:randomUUID()}, initial.revision);
  await send(mf, {type:'start'}, mic.revision);
  return ws;
}
function nextSocketEvent(ws: Awaited<ReturnType<typeof connectedStudio>>) {
  return new Promise<{kind:'message'; data:Record<string,unknown>} | {kind:'close'; code:number}>((resolve,reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Expected a local socket response.')); }, 2_000);
    const message = (event: MessageEvent) => {
      cleanup(); resolve({kind:'message',data:JSON.parse(String(event.data))});
    };
    const close = (event: CloseEvent) => { cleanup(); resolve({kind:'close',code:event.code}); };
    const cleanup = () => {clearTimeout(timer); ws.removeEventListener('message',message);ws.removeEventListener('close',close);};
    ws.addEventListener('message',message);ws.addEventListener('close',close);
  });
}

test('pilot arms the first audio deadline at five seconds and pauses before an unattended round can end', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    const active = await stub.inspectFixture();
    assert.equal(active.phase, 'active');
    assert.ok(active.round);
    const noAudioAt = active.round.segmentAt + 5_000;
    assert.equal(active.alarm, noAudioAt, 'A newly started round needs its own five-second audio alarm.');
    const paused = await stub.reconcileAtFixture(noAudioAt + 1);
    assert.equal(paused.phase, 'paused');
    assert.equal(paused.mic, 'error');
    assert.equal(paused.lease, null);
    assert.equal(paused.history, 0);
    assert.equal(paused.round!.remaining, active.round.endsAt! - noAudioAt);
  } finally { await mf.dispose(); }
});

test('a late durable wake respects earlier audio loss instead of awarding an escaped round', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    const active = await stub.inspectFixture();
    assert.ok(active.round?.endsAt);
    // A suspended room wakes after the round would have ended. Audio was lost
    // at +5s, so the authority must stop that clock before applying later time.
    const paused = await stub.reconcileAtFixture(active.round.endsAt + 2_000);
    assert.equal(paused.phase, 'paused');
    assert.equal(paused.history, 0, 'A disconnected microphone cannot earn a round result.');
    assert.equal(paused.round!.id, active.round.id);
    assert.equal(paused.round!.remaining, active.round.endsAt - active.round.segmentAt - 5_000);
  } finally { await mf.dispose(); }
});

test('pilot uses signed viewer identity for a private card and durably deduplicates accepted chat events', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    const viewer = await state(mf, 'viewer');
    assert.equal(typeof viewer.room.round?.target, 'string');
    for (const role of ['studio', 'overlay', 'broadcaster'] as const) {
      const snapshot = await state(mf, role);
      for (const key of ['target','forbiddenClues','cardId','artId','artUrl','ink','example']) {
        assert.equal(key in snapshot.room.round!, false, `${key} must stay private for ${role}.`);
      }
    }
    const event = {eventId:randomUUID(), channelId:'123', at:Date.now(), kind:'message',
      messageId:randomUUID(), userId:'456', name:'fixture-viewer', text:'A curious clue for the streamer.'};
    assert.equal((await stub.chatFixture(event)).status, 200);
    const first = await stub.inspectFixture();
    assert.equal(first.chatReceipts, 1);
    assert.equal((await stub.chatFixture(event)).body.duplicate, true);
    const replayed = await stub.inspectFixture();
    assert.equal(replayed.revision, first.revision, 'A provider retry cannot mutate game state again.');
    assert.equal(replayed.chatReceipts, 1);
  } finally { await mf.dispose(); }
});

test('viewer and secondary Studio sockets cannot revoke the microphone owner by injecting speech', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    const before = await stub.inspectFixture();
    assert.ok(before.lease);
    for (const role of ['viewer', 'studio'] as const) {
      const attacker = await connectedStudio(mf, role);
      const rejected = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Unbound speech input was not rejected.')), 2_000);
        const done = () => { clearTimeout(timer); resolve(); };
        attacker.addEventListener('close', done, {once:true});
        attacker.addEventListener('message', done, {once:true});
      });
      attacker.send(JSON.stringify({type:'speech-audio',leaseId:randomUUID(),roundId:before.round!.id,epoch:1,samples:512}));
      await rejected;
      const after = await stub.inspectFixture();
      assert.equal(after.phase, 'active', `${role} speech must not pause the owner.`);
      assert.equal(after.mic, 'listening');
      assert.deepEqual(after.lease, before.lease);
      assert.equal(after.revision, before.revision, 'Unauthorized speech must not mutate authoritative state.');
    }
  } finally { await mf.dispose(); }
});

test('the default pilot admits exactly 100 chat participants and durably ignores participant 101', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    for (let index=0;index<100;index++) {
      const result = await stub.chatFixture({eventId:`participant-event-${index}`,channelId:'123',at:Date.now(),kind:'message',
        messageId:`participant-message-${index}`,userId:String(1000+index),name:`viewer${index}`,text:'1234567890'});
      assert.deepEqual(result.body,{ok:true});
    }
    const full = await stub.inspectFixture();
    assert.equal(full.participants,100);
    const overflowEvent = {eventId:'participant-overflow',channelId:'123',at:Date.now(),kind:'message',
      messageId:'participant-overflow',userId:'2001',name:'overflow',text:'1234567890'};
    const overflow = await stub.chatFixture(overflowEvent);
    assert.equal(overflow.status,200);
    assert.equal(overflow.body.reason,'pilot_player_limit');
    const after = await stub.inspectFixture();
    assert.equal(after.participants,100);
    assert.equal(after.revision,full.revision);
    assert.equal(after.chatReceipts,101, 'Ignored overflow must also have a bounded durable replay receipt.');
    assert.equal((await stub.chatFixture(overflowEvent)).body.duplicate,true);
    const existing = await stub.chatFixture({eventId:'existing-player-skip',channelId:'123',at:Date.now(),kind:'message',
      messageId:'existing-player-skip',userId:'1000',name:'viewer0',text:'!skip'});
    assert.deepEqual(existing.body,{ok:true});
    assert.equal((await stub.inspectFixture()).participants,100);
  } finally { await mf.dispose(); }
});

test('configured participant and viewer socket caps are enforced while keeping Studio capacity available', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime({EDGE_MAX_PARTICIPANTS:'2',EDGE_MAX_VIEWER_SOCKETS:'2'});
  try {
    await start(mf);
    await connectedStudio(mf,'viewer');
    await connectedStudio(mf,'viewer',token('viewer',{opaque_user_id:'U457',user_id:'457'}));
    const response = await mf.dispatchFetch(await endpoint(mf,'socket'),{headers:{origin:ORIGIN,upgrade:'websocket',
      'sec-websocket-protocol':`baited.v1, baited.auth.${token('viewer',{opaque_user_id:'U458',user_id:'458'})}`}});
    assert.equal(response.status,429);
    await connectedStudio(mf,'overlay');
    for (let index=0;index<3;index++) {
      const result = await stub.chatFixture({eventId:`limited-player-${index}`,channelId:'123',at:Date.now(),kind:'message',
        messageId:`limited-message-${index}`,userId:String(1000+index),name:`viewer${index}`,text:'1234567890'});
      assert.equal(result.body.reason,index===2?'pilot_player_limit':undefined);
    }
    const after = await stub.inspectFixture();
    assert.equal(after.participants,2);
    assert.equal(after.sockets.filter(s=>s.role==='viewer' && s.readyState===1).length,2);
    assert.ok(after.sockets.some(s=>s.role==='overlay' && s.readyState===1));
    assert.ok(after.sockets.some(s=>s.role==='studio' && s.readyState===1));
  } finally { await mf.dispose(); }
});

test('pilot refreshes same-identity credentials but rejects expired tokens and non-schema refresh fields', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    const now = Math.floor(Date.now()/1000);
    const ws = await connectedStudio(mf,'studio',token('studio',{exp:now+60}));
    const refreshed = nextSocketEvent(ws);
    ws.send(JSON.stringify({type:'refresh-auth',token:token('studio',{exp:now+300})}));
    assert.deepEqual(await refreshed,{kind:'message',data:{type:'auth-refreshed',expiresAt:(now+300)*1000}});
    assert.ok((await stub.inspectFixture()).sockets.some(s=>s.role==='studio' && s.expiresAt===(now+300)*1000));
    const expired = nextSocketEvent(ws);
    ws.send(JSON.stringify({type:'refresh-auth',token:token('studio',{iat:now-20,exp:now-1})}));
    assert.deepEqual(await expired,{kind:'close',code:1008});
    const viewer = await connectedStudio(mf,'viewer');
    const malformed = nextSocketEvent(viewer);
    viewer.send(JSON.stringify({type:'refresh-auth',token:token('viewer'),role:'studio'}));
    assert.deepEqual(await malformed,{kind:'close',code:1008});
  } finally { await mf.dispose(); }
});

test('owner session disconnect pauses the live round and invalidates its socket without exposing the card', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    await start(mf);
    const before = await stub.inspectFixture();
    assert.equal(await stub.disconnectFixture(),200);
    const after = await stub.inspectFixture();
    // Inspect the server endpoint: Miniflare's dispatchFetch socket bridge does
    // not flush close frames initiated by a separate fixture RPC reliably.
    assert.ok(after.sockets.every(s=>s.role!=='studio' || s.readyState!==1));
    assert.equal(after.phase,'paused');
    assert.equal(after.mic,'off');
    assert.equal(after.lease,null);
    assert.equal(after.round!.id,before.round!.id);
    assert.equal(after.history,0);
  } finally { await mf.dispose(); }
});

test('refresh rechecks control admission and cannot keep a revoked session authorized', {timeout:15_000}, async () => {
  const {mf} = await runtime();
  try {
    const ws = await connectedStudio(mf);
    const namespace = await mf.getDurableObjectNamespace('CONTROL');
    const control = namespace.get(namespace.idFromName('control-v1')) as unknown as {denyFixture():Promise<void>};
    await control.denyFixture();
    const rejected = nextSocketEvent(ws);
    ws.send(JSON.stringify({type:'refresh-auth',token:token()}));
    assert.deepEqual(await rejected,{kind:'close',code:1008});
  } finally { await mf.dispose(); }
});

test('socket refresh cannot replace a viewer identity with a valid broadcaster credential', {timeout:15_000}, async () => {
  const {mf} = await runtime();
  try {
    const ws = await connectedStudio(mf,'viewer');
    const denied = nextSocketEvent(ws);
    ws.send(JSON.stringify({type:'refresh-auth',token:token('broadcaster')}));
    assert.deepEqual(await denied,{kind:'close',code:1008});
  } finally { await mf.dispose(); }
});

test('WebSocket resync and HTTP state reads share the channel refresh budget', {timeout:15_000}, async () => {
  const {mf,stub} = await runtime();
  try {
    // A test-only frozen clock makes the fixed-minute boundary deterministic.
    // It is ahead of the signing clock, but inside each synthetic token's TTL.
    await stub.freezeAtFixture(Date.now()+30_000);
    const ws = await connectedStudio(mf,'viewer');
    for(let index=0;index<119;index++) await state(mf,'viewer');
    const allowed = nextSocketEvent(ws);
    ws.send('resync');
    const result = await allowed;
    assert.equal(result.kind,'message');
    if(result.kind==='message') assert.equal(result.data.type,'snapshot');
    const denied = nextSocketEvent(ws);
    ws.send('resync');
    assert.deepEqual(await denied,{kind:'close',code:1008});
    const overflow = await mf.dispatchFetch(await endpoint(mf,'state'),{headers:{origin:ORIGIN,authorization:`Bearer ${token('viewer')}`}});
    assert.equal(overflow.status,429);
  } finally { await mf.dispose(); }
});
