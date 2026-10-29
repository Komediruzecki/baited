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
  round: { id: string; epoch: number; segmentAt: number; endsAt: number | null; remaining: number; duration: number; result?: string } | null;
  lease: {id:string;socketId:string;expiresAt:number;sessionId:string} | null;
  ownerSpeech?: {firstAudioAt:number;lastAudioAt:number;samples:number;lastSequence:number};
  chatReceipts: number; history: number; participants: number; sqlChanges: number; outbox: number;
  chatConnected: boolean; connectionRevision: number;
  sockets: {role:string;sessionId?:string;expiresAt:number;generation:number;readyState:number}[];
}
interface FixtureStub {
  bootstrapFixture(): Promise<number>;
  inspectFixture(): Promise<Inspection>;
  reconcileAtFixture(at: number): Promise<Inspection>;
  chatFixture(event: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
  disconnectFixture(): Promise<number>;
  disconnectBatchFixture(payload:Record<string,unknown>): Promise<number>;
  connectionFixture(status:string,revision:unknown): Promise<number>;
  clockFixture(): Promise<number>;
  freezeAtFixture(at: number): Promise<void>;
  ownerMessageAtFixture(at: number, message: Record<string,unknown>): Promise<Inspection>;
  queuedOwnerMessageFixture(receivedAt: number, processedAt: number, message: Record<string,unknown>): Promise<Inspection>;
  closeOwnerAtFixture(at: number, code?: number): Promise<Inspection>;
  enqueueOutboxFixture(at: number, expiresAt: number): Promise<Inspection>;
  flushOutboxAtFixture(at: number): Promise<Inspection>;
  receiptStatsFixture(): Promise<{count:number;indexedCount:number;indexedRowsRead:number}>;
}
let script: string;
const fixtureClocks=new WeakMap<Miniflare,FixtureStub>();

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
          admissionStatus = 200;
          deliveryStatus = 200;
          deliveries = 0;
          heldRole = null;
          authorizeWaiting = 0;
          authorizeGate = null;
          releaseAuthorize = null;
          denyFixture() { this.allowed = false; }
          admissionStatusFixture(status) { this.admissionStatus = status; }
          deliveryFixture(status) { this.deliveryStatus = status; }
          deliveredFixture() { return this.deliveries; }
          holdAuthorizeFixture(role) {
            this.heldRole=role;
            this.authorizeGate=new Promise(resolve=>{this.releaseAuthorize=resolve;});
          }
          authorizeWaitingFixture() { return this.authorizeWaiting; }
          releaseAuthorizeFixture() { this.heldRole=null;this.releaseAuthorize?.();this.releaseAuthorize=null; }
          async fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === '/internal/authorize') {
              const body = await request.json();
              if(this.heldRole===body.role) {this.authorizeWaiting++;await this.authorizeGate;this.authorizeWaiting--;}
              return Response.json({allowed: this.allowed && body.channelId === '123', login: 'komediruzecki7'}, {status:this.admissionStatus});
            }
            if (path === '/internal/room-event') { this.deliveries++; return Response.json({ok: this.deliveryStatus === 200}, {status:this.deliveryStatus}); }
            return new Response('No external provider in this fixture.', {status: 503});
          }
        }
        export class ChannelRoom extends BaseRoom {
          async bootstrapFixture() {
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST', body:JSON.stringify({channelId:'123', login:'komediruzecki7', type:'connection', status:'connected',connectionRevision:1})
            }))).status;
          }
          async inspectFixture() {
            const self = this;
            return {alarm: await this.ctx.storage.getAlarm(), now:self.now, revision:self.revision,
              phase:self.game.phase, mic:self.game.mic, lease:self.pilotState.lease,
              chatConnected:self.pilotState.chatConnected,connectionRevision:self.pilotState.connectionRevision??0,
              ownerSpeech:this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()).find(att=>att?.socketId===self.pilotState.lease?.socketId)?.speech,
              round:self.game.round ? {id:self.game.round.id, epoch:self.game.round.epoch, segmentAt:self.game.round.segmentAt,
                endsAt:self.game.round.endsAt, remaining:self.game.round.remaining, duration:self.game.round.duration, result:self.game.round.result} : null,
              history:self.game.data.history.length,
              participants:self.game.round?.participants.size ?? 0,
              sockets:this.ctx.getWebSockets().map(ws => ({role:ws.deserializeAttachment().identity.role,
                sessionId:ws.deserializeAttachment().identity.sessionId,
                expiresAt:ws.deserializeAttachment().identity.expiresAt,
                generation:ws.deserializeAttachment().identity.generation,readyState:ws.readyState})),
              chatReceipts:this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_chat_receipt').one().n,
              outbox:this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_outbox').one().n,
              sqlChanges:this.ctx.storage.sql.exec('SELECT total_changes() AS n').one().n};
          }
          async reconcileAtFixture(at) {
            const clock = Date.now;
            Date.now = () => at;
            try { await this.serial(() => this.reconcile()); return await this.inspectFixture(); }
            finally { Date.now = clock; }
          }
          clockFixture() { return Date.now(); }
          freezeAtFixture(at) { Date.now = () => at; }
          async ownerMessageAtFixture(at,message) {
            Date.now = () => at;
            const owner=this.ctx.getWebSockets().find(ws=>ws.deserializeAttachment()?.socketId===this.pilotState.lease?.socketId);
            if(!owner) throw new Error('The fixture has no microphone owner.');
            await this.webSocketMessage(owner,JSON.stringify(message));
            return this.inspectFixture();
          }
          async queuedOwnerMessageFixture(receivedAt,processedAt,message) {
            const owner=this.ctx.getWebSockets().find(ws=>ws.deserializeAttachment()?.socketId===this.pilotState.lease?.socketId);
            if(!owner) throw new Error('The fixture has no microphone owner.');
            let entered,release;
            const ready=new Promise(resolve=>{entered=resolve;});
            const gate=new Promise(resolve=>{release=resolve;});
            const blocked=this.serial(async()=>{entered();await gate;});
            await ready;
            Date.now=()=>receivedAt;
            const work=this.webSocketMessage(owner,JSON.stringify(message));
            Date.now=()=>processedAt;
            release();await blocked;await work;
            return this.inspectFixture();
          }
          async closeOwnerAtFixture(at,code=1000) {
            Date.now = () => at;
            const owner=this.ctx.getWebSockets().find(ws=>ws.deserializeAttachment()?.socketId===this.pilotState.lease?.socketId);
            if(!owner) throw new Error('The fixture has no microphone owner.');
            await this.webSocketClose(owner,code);
            return this.inspectFixture();
          }
          async enqueueOutboxFixture(at,expiresAt) {
            Date.now = () => at;
            this.ctx.storage.sql.exec('INSERT INTO pilot_outbox(id,body,retry_at,expires_at) VALUES(?,?,?,?)',
              crypto.randomUUID(),JSON.stringify({channelId:'123',event:{type:'round-start'}}),at,expiresAt);
            await this.schedule();
            return this.inspectFixture();
          }
          async flushOutboxAtFixture(at) {
            Date.now = () => at;
            // A real alarm has already consumed its old schedule when invoked.
            await this.ctx.storage.deleteAlarm();
            await this.alarm();
            return this.inspectFixture();
          }
          receiptStatsFixture() {
            const count=this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_chat_receipt').one().n;
            const cursor=this.ctx.storage.sql.exec('SELECT chat AS n FROM pilot_counts WHERE id=1');
            const indexedCount=cursor.one().n;
            return {count,indexedCount,indexedRowsRead:cursor.rowsRead};
          }
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
          async disconnectBatchFixture(payload) {
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST',body:JSON.stringify({...payload,channelId:'123',type:'disconnect'})
            }))).status;
          }
          async connectionFixture(status,revision) {
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST', body:JSON.stringify({channelId:'123',login:'komediruzecki7',type:'connection',status,connectionRevision:revision})
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
    fixtureClocks.set(mf,stub);
    return { mf, stub };
  } catch (error) { await mf.dispose(); throw error; }
}

function sign(payload: Record<string, unknown>, secret: string): string {
  const contents = [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${contents}.${createHmac('sha256', Buffer.from(secret, 'base64')).update(contents).digest('base64url')}`;
}
function token(role: 'studio' | 'overlay' | 'viewer' | 'broadcaster' = 'studio', overrides: Record<string, unknown> = {}, at=Date.now()): string {
  const now = Math.floor(at / 1000);
  return role === 'viewer' || role === 'broadcaster'
    ? sign({channel_id:'123', role, opaque_user_id: role === 'viewer' ? 'U456' : 'U123', user_id:role === 'viewer' ? '456' : '123', iat:now, exp:now+300, ...overrides}, EXTENSION_SECRET)
    : sign({iss:'baited-edge-pilot', aud:'baited-edge', channel_id:'123', role, sid:SESSION, sub:'twitch:123', iat:now, exp:now+300, ...overrides}, PILOT_SECRET);
}
async function fixtureToken(mf:Miniflare,role:Parameters<typeof token>[0]='studio',overrides:Record<string,unknown>={}) {
  const clock=fixtureClocks.get(mf);
  assert.ok(clock,'The local fixture must register its Worker clock before issuing credentials.');
  // Gameplay tests freeze/advance workerd independently from the Node host.
  // Mint against the validating clock; production future-iat checks stay strict.
  return token(role,overrides,await clock.clockFixture());
}
async function endpoint(mf: Miniflare, route: string) { return `${(await mf.ready).origin}/v1/rooms/123/${route}`; }
async function state(mf: Miniflare, role: Parameters<typeof token>[0] = 'studio'): Promise<Snapshot> {
  const response = await mf.dispatchFetch(await endpoint(mf, 'state'), {headers:{origin:ORIGIN, authorization:`Bearer ${await fixtureToken(mf,role)}`}});
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as Snapshot;
}
async function send(mf: Miniflare, action: Command['action'], revision: number): Promise<Receipt> {
  const response = await mf.dispatchFetch(await endpoint(mf, 'commands'), {method:'POST',
    headers:{origin:ORIGIN, authorization:`Bearer ${await fixtureToken(mf)}`, 'content-type':'application/json'},
    body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:revision,action})});
  const body = await response.json() as Receipt;
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}
async function connectedStudio(mf: Miniflare, role: Parameters<typeof token>[0] = 'studio', credential?:string) {
  const response = await mf.dispatchFetch(await endpoint(mf, 'socket'), {headers:{
    origin:ORIGIN, upgrade:'websocket', 'sec-websocket-protocol':`baited.v1, baited.auth.${credential??await fixtureToken(mf,role)}`,
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
async function advanceAudio(mf: Miniflare, stub: FixtureStub, milliseconds: number) {
  const first = await stub.inspectFixture();
  assert.ok(first.round && first.lease);
  let current = first;
  // Synthetic metadata only: 500ms of 16kHz samples per local clock step. This
  // exercises the actual owner input guard and avoids real audio/provider calls.
  for(let elapsed=500;elapsed<=milliseconds;elapsed+=500) {
    current=await stub.ownerMessageAtFixture(first.round.segmentAt+elapsed,{type:'speech-audio',
      leaseId:first.lease.id,roundId:first.round.id,epoch:first.round.epoch,samples:elapsed*16});
    assert.equal(current.mic,'listening',`Audio failed at ${elapsed}ms.`);
    if(elapsed%10_000===0) {
      await send(mf,{type:'microphone',armed:true,renew:true,leaseId:first.lease.id,socketId:first.lease.socketId},current.revision);
      current=await stub.inspectFixture();
    }
  }
  return current;
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

async function heldControl(mf:Miniflare) {
  const namespace=await mf.getDurableObjectNamespace('CONTROL');
  return namespace.get(namespace.idFromName('control-v1')) as unknown as {
    holdAuthorizeFixture(role:string):Promise<void>;releaseAuthorizeFixture():Promise<void>;
    authorizeWaitingFixture():Promise<number>;
  };
}
async function waitForHeldAuthorization(control:Awaited<ReturnType<typeof heldControl>>) {
  for(let attempt=0;attempt<100;attempt++) {
    if(await control.authorizeWaitingFixture()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('The mock Control authorization did not enter its deterministic gate.');
}

test('replayed connection status cannot overwrite newer chat state or stop its microphone', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const first=await advanceAudio(mf,stub,500);
    assert.equal(await stub.connectionFixture('connected',3),200);
    const connected=await stub.inspectFixture();
    assert.equal(connected.connectionRevision,3);
    assert.equal(connected.lease!.id,first.lease!.id);
    for(const [status,revision] of [['disconnected',2],['connected',3],['disconnected',3]] as const) {
      assert.equal(await stub.connectionFixture(status,revision),200);
      const unchanged=await stub.inspectFixture();
      assert.equal(unchanged.revision,connected.revision);
      assert.equal(unchanged.sqlChanges,connected.sqlChanges);
      assert.equal(unchanged.connectionRevision,3);
      assert.equal(unchanged.chatConnected,true);
      assert.equal(unchanged.phase,'active');
      assert.equal(unchanged.mic,'listening');
      assert.equal(unchanged.lease!.id,first.lease!.id);
    }
    assert.equal(await stub.connectionFixture('disconnected',4),200);
    const disconnected=await stub.inspectFixture();
    assert.equal(disconnected.chatConnected,false);
    assert.equal(disconnected.lease,null);
    assert.equal(disconnected.phase,'paused');
    assert.equal(await stub.connectionFixture('disconnected',4),200);
    const duplicate=await stub.inspectFixture();
    assert.equal(duplicate.sqlChanges,disconnected.sqlChanges);
    assert.equal(duplicate.revision,disconnected.revision);
    assert.equal(duplicate.connectionRevision,4);
    for(const revision of [undefined,0,-1,1.5,'5',Number.MAX_SAFE_INTEGER+1])
      assert.equal(await stub.connectionFixture('connected',revision),400);
    assert.equal((await stub.inspectFixture()).revision,disconnected.revision);
  } finally {await mf.dispose();}
});

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
    const counts=await stub.receiptStatsFixture();
    assert.equal(counts.count,102);
    assert.equal(counts.indexedCount,counts.count);
    assert.ok(counts.indexedRowsRead<=1,'Capacity checks must read a counter, not the whole receipt table.');
    await stub.flushOutboxAtFixture(Date.now()+600_001);
    assert.equal((await stub.receiptStatsFixture()).indexedCount,0,'Expiry deletes must update the bounded receipt counter.');
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

test('disconnect batches validate atomically and preserve a fresh session outside the captured IDs', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const oldSessions=['retired-studio-session-a','retired-studio-session-b'];
    for(const sid of oldSessions) await connectedStudio(mf,'studio',token('studio',{sid}));
    await connectedStudio(mf,'viewer');
    await start(mf);
    const before=await advanceAudio(mf,stub,500);
    // A malformed later ID must not revoke an earlier valid ID in the batch.
    const invalid=[{}, {sessionIds:[]}, {sessionIds:[oldSessions[0],7]},
      {sessionIds:Array(101).fill(oldSessions[0])}, {sessionIds:['x'.repeat(129)]},
      {sessionIds:[oldSessions[0],'bad session']},
      {sessionId:SESSION,sessionIds:oldSessions}, {sessionIds:'not-an-array'}];
    for(const payload of invalid) {
      assert.equal(await stub.disconnectBatchFixture(payload),400);
      const after=await stub.inspectFixture();
      assert.equal(after.revision,before.revision);
      assert.equal(after.sqlChanges,before.sqlChanges);
      assert.equal(after.lease!.id,before.lease!.id);
      assert.ok(oldSessions.every(sid=>after.sockets.some(socket=>socket.sessionId===sid && socket.readyState===1)));
    }
    // Exercise the full bound, including the largest allowed ID length. The
    // captured sessions predate the healthy owner; unconnected IDs are harmless.
    const batch=[...oldSessions,...Array.from({length:98},(_,i)=>`retired-${i}-`.padEnd(128,'x'))];
    assert.equal(await stub.disconnectBatchFixture({sessionIds:batch}),200);
    const after=await stub.inspectFixture();
    assert.equal(after.revision,before.revision+1,'One batch commits once, rather than once per session.');
    assert.equal(after.phase,'active');
    assert.equal(after.mic,'listening');
    assert.equal(after.lease!.id,before.lease!.id);
    assert.ok(after.sockets.some(socket=>socket.sessionId===SESSION && socket.readyState===1));
    assert.ok(after.sockets.some(socket=>socket.role==='viewer' && socket.readyState===1));
    assert.ok(after.sockets.every(socket=>!oldSessions.includes(socket.sessionId??'') || socket.readyState!==1));
    assert.equal(await stub.disconnectBatchFixture({sessionIds:batch}),200);
    const duplicate=await stub.inspectFixture();
    assert.equal(duplicate.revision,after.revision);
    assert.equal(duplicate.sqlChanges,after.sqlChanges);
    assert.equal(duplicate.lease!.id,before.lease!.id);
    assert.equal(await stub.disconnectBatchFixture({sessionIds:[SESSION,...oldSessions]}),200);
    const revokedOwner=await stub.inspectFixture();
    assert.equal(revokedOwner.revision,after.revision+1);
    assert.equal(revokedOwner.phase,'paused');
    assert.equal(revokedOwner.mic,'off');
    assert.equal(revokedOwner.lease,null);
    assert.ok(revokedOwner.sockets.some(socket=>socket.role==='viewer' && socket.readyState===1));
    assert.ok(revokedOwner.sockets.every(socket=>socket.role!=='studio' || socket.readyState!==1));
  } finally {await mf.dispose();}
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

test('one viewer shares its HTTP and WebSocket refresh budget without spending Studio capacity', {timeout:15_000}, async () => {
  const {mf,stub} = await runtime();
  try {
    // A test-only frozen clock makes the fixed-minute boundary deterministic;
    // fixture credentials use the same clock as request validation.
    await stub.freezeAtFixture(Date.now()+30_000);
    await start(mf);
    const owner=await stub.inspectFixture();
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
    const overflow = await mf.dispatchFetch(await endpoint(mf,'state'),{headers:{origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf,'viewer')}`}});
    assert.equal(overflow.status,429);
    const studio=await state(mf);
    const renewal=await send(mf,{type:'microphone',armed:true,renew:true,leaseId:owner.lease!.id,socketId:owner.lease!.socketId},studio.revision);
    assert.equal(renewal.ok,true);
    assert.equal((await stub.inspectFixture()).mic,'listening');
  } finally { await mf.dispose(); }
});

test('invalid viewer frame bursts close those viewers while Studio retains its lease and controls', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Date.now()+30_000);
    await start(mf);
    const before=await stub.inspectFixture();
    const viewers=[];
    // Forty signed identities stay below the 100-seat pilot cap while exceeding
    // the mutation queue's capacity if read-only disconnects were serialized.
    for(let index=0;index<40;index++) viewers.push(await connectedStudio(mf,'viewer',
      await fixtureToken(mf,'viewer',{opaque_user_id:`U${1000+index}`,user_id:String(1000+index)})));
    const closed=viewers.map(ws=>nextSocketEvent(ws));
    for(const ws of viewers) for(let index=0;index<8;index++) ws.send('{invalid-json');
    const renewal=await send(mf,{type:'microphone',armed:true,renew:true,leaseId:before.lease!.id,
      socketId:before.lease!.socketId},before.revision);
    assert.equal(renewal.ok,true);
    for(const response of await Promise.all(closed)) {
      assert.equal(response.kind,'close');
      if(response.kind==='close') assert.ok([1008,1013].includes(response.code));
    }
    const after=await stub.inspectFixture();
    assert.equal(after.phase,'active');
    assert.equal(after.mic,'listening');
    assert.equal(after.lease!.id,before.lease!.id);
    await send(mf,{type:'pause',roundId:after.round!.id,epoch:after.round!.epoch},before.revision);
    assert.equal((await stub.inspectFixture()).phase,'paused');
  } finally {await mf.dispose();}
});

test('late owner audio and final transcripts after pause or an old epoch preserve the microphone lease', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const active=await advanceAudio(mf,stub,1_000);
    await send(mf,{type:'pause',roundId:active.round!.id,epoch:active.round!.epoch},active.revision);
    const paused=await stub.inspectFixture();
    assert.equal(paused.phase,'paused');
    for(const type of ['speech-audio','speech-final']) {
      const after=await stub.ownerMessageAtFixture(active.round!.segmentAt+1_150,{type,
        leaseId:active.lease!.id,roundId:active.round!.id,epoch:active.round!.epoch,samples:20_000});
      assert.deepEqual(after.lease,paused.lease);
      assert.equal(after.mic,'listening');
      assert.equal(after.revision,paused.revision,'Stale audio must be a no-op, not a new error checkpoint.');
    }
    await send(mf,{type:'resume',roundId:paused.round!.id,epoch:paused.round!.epoch},paused.revision);
    const resumed=await stub.inspectFixture();
    const afterOldEpoch=await stub.ownerMessageAtFixture(active.round!.segmentAt+1_250,{type:'speech-audio',
      leaseId:active.lease!.id,roundId:active.round!.id,epoch:active.round!.epoch,samples:24_000});
    assert.equal(afterOldEpoch.phase,'active');
    assert.equal(afterOldEpoch.mic,'listening');
    assert.equal(afterOldEpoch.revision,resumed.revision);
    assert.deepEqual(afterOldEpoch.lease,resumed.lease);
  } finally {await mf.dispose();}
});

test('audio tail beyond the round deadline preserves the microphone during settlement', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const initial=await state(mf);
    await send(mf,{type:'settings',settings:{...initial.room.settings,duration:30}},initial.revision);
    await start(mf);
    const settling=await advanceAudio(mf,stub,30_000);
    assert.equal(settling.phase,'settling');
    const after=await stub.ownerMessageAtFixture(settling.round!.endsAt!+550,{type:'speech-audio',
      leaseId:settling.lease!.id,roundId:settling.round!.id,epoch:settling.round!.epoch,samples:30_400*16});
    assert.equal(after.phase,'settling');
    assert.equal(after.mic,'listening');
    assert.deepEqual(after.lease,settling.lease);
    assert.equal(after.revision,settling.revision);
  } finally {await mf.dispose();}
});

test('five settling tail frames preserve a crossing final and score only words ending before the buzzer', {timeout:15_000}, async () => {
  for(const targetBeforeBuzzer of [true,false]) {
    const {mf,stub}=await runtime();
    try {
      const initial=await state(mf);
      await send(mf,{type:'settings',settings:{...initial.room.settings,duration:30}},initial.revision);
      await start(mf);
      const target=(await state(mf,'viewer')).room.round!.target!;
      const settling=await advanceAudio(mf,stub,30_000);
      const end=settling.round!.endsAt!;
      const lastLiveAudio=settling.ownerSpeech!.lastAudioAt;
      for(let index=1;index<=5;index++) {
        const tail=await stub.ownerMessageAtFixture(end+index*128+150,{type:'speech-audio',
          leaseId:settling.lease!.id,roundId:settling.round!.id,epoch:settling.round!.epoch,samples:480_000+index*2048});
        assert.equal(tail.mic,'listening');
        assert.equal(tail.lease!.id,settling.lease!.id);
        assert.equal(tail.ownerSpeech!.samples,480_000+index*2048);
        assert.equal(tail.ownerSpeech!.lastAudioAt,lastLiveAudio,'Draining a tail must not extend microphone liveness.');
      }
      const final=await stub.ownerMessageAtFixture(end+800,{type:'speech-final',leaseId:settling.lease!.id,
        roundId:settling.round!.id,epoch:settling.round!.epoch,sequence:1,line:{id:randomUUID(),
          text:targetBeforeBuzzer?`${target} 1234567890`:`1234567890 ${target}`,isComplete:true,startTime:29,duration:1.64,
          words:[{text:targetBeforeBuzzer?target:'1234567890',start:29.8,end:29.95,confidence:1},
            {text:targetBeforeBuzzer?'1234567890':target,start:30.2,end:30.4,confidence:1}]}});
      assert.equal(final.mic,'listening');
      assert.equal(final.lease!.id,settling.lease!.id);
      assert.equal(final.ownerSpeech!.lastSequence,1);
      const result=await state(mf);
      assert.equal(result.room.result?.outcome,targetBeforeBuzzer?'review':undefined);
      if(targetBeforeBuzzer) {
        await send(mf,{type:'catch',roundId:settling.round!.id,decision:'confirm'},result.revision);
        assert.equal((await state(mf)).room.score.wins,1);
      }
      await stub.freezeAtFixture(end+2000);
      const afterSettlement=await state(mf);
      assert.equal(afterSettlement.room.result?.outcome,targetBeforeBuzzer?'caught':'escaped');
      assert.equal(afterSettlement.room.score.wins,targetBeforeBuzzer?1:0);
      assert.equal(afterSettlement.room.mic,'listening');
    } finally {await mf.dispose();}
  }
});

test('queued audio anchors on its arrival time rather than the delayed first processing time', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const initial=await stub.inspectFixture();
    for(let index=1;index<=8;index++) {
      const after=await stub.queuedOwnerMessageFixture(initial.round!.segmentAt+index*128,
        initial.round!.segmentAt+1000+(index-1)*25,{type:'speech-audio',leaseId:initial.lease!.id,
          roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
      assert.equal(after.mic,'listening');
      assert.equal(after.phase,'active');
      assert.equal(after.lease!.id,initial.lease!.id);
      assert.equal(after.ownerSpeech!.firstAudioAt,initial.round!.segmentAt);
      assert.equal(after.ownerSpeech!.lastAudioAt,initial.round!.segmentAt+index*128);
    }
  } finally {await mf.dispose();}
});

test('a 1.5 second uplink gap followed by twenty consistent owner audio frames keeps the microphone', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    // Align the segment so all twenty backlog frames hit the same fixed-second
    // window that previously refused frame 17 with permanent close code 1008.
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000+30_500);
    await start(mf);
    const before=await advanceAudio(mf,stub,1000);
    const firstArrival=before.round!.segmentAt+2500;
    assert.equal(firstArrival%1000,0);
    for(let index=1;index<=20;index++) {
      const after=await stub.ownerMessageAtFixture(firstArrival+(index-1)*40,{type:'speech-audio',
        leaseId:before.lease!.id,roundId:before.round!.id,epoch:before.round!.epoch,samples:16_000+index*2048});
      assert.equal(after.mic,'listening',`Buffered audio frame ${index} disarmed the owner.`);
      assert.equal(after.phase,'active');
      assert.equal(after.lease!.id,before.lease!.id);
      assert.equal(after.ownerSpeech!.samples,16_000+index*2048);
      assert.ok(after.sockets.some(socket=>socket.role==='studio'&&socket.readyState===1));
    }
  } finally {await mf.dispose();}
});

test('an excessive owner audio burst closes with a retryable code', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const owner=await start(mf);
    const before=await advanceAudio(mf,stub,1000);
    const arrival=before.round!.segmentAt+2500;
    const frame=(index:number)=>({type:'speech-audio',leaseId:before.lease!.id,
      roundId:before.round!.id,epoch:before.round!.epoch,samples:16_000+index});
    // Small, monotonic sample deltas keep every frame valid while exhausting
    // admission tokens. Sequential delivery isolates the audio bucket from the
    // separate mutation-queue cap, and a frozen clock prevents a refill.
    for(let index=1;index<=48;index++) {
      const after=await stub.ownerMessageAtFixture(arrival,frame(index));
      assert.equal(after.mic,'listening');
      assert.equal(after.ownerSpeech!.samples,16_000+index);
    }
    const closed=nextSocketEvent(owner);
    owner.send(JSON.stringify(frame(49)));
    assert.deepEqual(await closed,{kind:'close',code:1013});
  } finally {await mf.dispose();}
});

test('an arrival-time anchor cannot advance audio faster than real time', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const initial=await stub.inspectFixture();
    const frame=(samples:number)=>({type:'speech-audio',leaseId:initial.lease!.id,
      roundId:initial.round!.id,epoch:initial.round!.epoch,samples});
    await stub.ownerMessageAtFixture(initial.round!.segmentAt+1,frame(8000));
    const rejected=await stub.ownerMessageAtFixture(initial.round!.segmentAt+2,frame(16_000));
    assert.equal(rejected.mic,'error');
    assert.equal(rejected.phase,'paused');
    assert.equal(rejected.lease,null);
    assert.equal(rejected.history,0);
  } finally {await mf.dispose();}
});

test('a retired lease frame on the same Studio socket cannot close its replacement microphone', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const old=await advanceAudio(mf,stub,1000);
    const off=await send(mf,{type:'microphone',armed:false,leaseId:old.lease!.id,socketId:old.lease!.socketId},old.revision);
    const nextLease=randomUUID();
    const armed=await send(mf,{type:'microphone',armed:true,leaseId:nextLease,socketId:old.lease!.socketId},off.revision);
    const paused=await stub.inspectFixture();
    await send(mf,{type:'resume',roundId:paused.round!.id,epoch:paused.round!.epoch},armed.revision);
    const resumed=await stub.inspectFixture();
    for(const type of ['speech-audio','speech-final']) {
      const stale=await stub.ownerMessageAtFixture(resumed.round!.segmentAt+50,{type,leaseId:old.lease!.id,
        roundId:old.round!.id,epoch:old.round!.epoch,samples:18_048});
      assert.equal(stale.phase,'active');
      assert.equal(stale.mic,'listening');
      assert.equal(stale.lease!.id,nextLease);
      assert.equal(stale.revision,resumed.revision);
      assert.ok(stale.sockets.some(socket=>socket.role==='studio'&&socket.readyState===1));
    }
    const healthy=await stub.ownerMessageAtFixture(resumed.round!.segmentAt+128,{type:'speech-audio',leaseId:nextLease,
      roundId:resumed.round!.id,epoch:resumed.round!.epoch,samples:2048});
    assert.equal(healthy.ownerSpeech!.samples,2048);
    assert.equal(healthy.mic,'listening');
  } finally {await mf.dispose();}
});

test('a stalled viewer authorization refresh leaves the microphone mutation queue available', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  const control=await heldControl(mf);
  try {
    await start(mf);
    const before=await stub.inspectFixture();
    const viewer=await connectedStudio(mf,'viewer');
    await control.holdAuthorizeFixture('viewer');
    const refreshed=nextSocketEvent(viewer);
    viewer.send(JSON.stringify({type:'refresh-auth',token:token('viewer')}));
    await waitForHeldAuthorization(control);
    let timer:ReturnType<typeof setTimeout>|undefined;
    let after:Inspection;
    try {
      after=await Promise.race([advanceAudio(mf,stub,3000),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Viewer refresh blocked live audio behind Control.')),1000);
      })]);
    } finally {clearTimeout(timer);}
    assert.equal(after!.mic,'listening');
    assert.equal(after!.phase,'active');
    assert.equal(after!.lease!.id,before.lease!.id);
    assert.equal(await control.authorizeWaitingFixture(),1);
    await control.releaseAuthorizeFixture();
    const ack=await refreshed;
    assert.equal(ack.kind,'message');
    if(ack.kind==='message') assert.equal(ack.data.type,'auth-refreshed');
    assert.equal((await stub.inspectFixture()).ownerSpeech!.samples,48_000);
  } finally {await control.releaseAuthorizeFixture();await mf.dispose();}
});

test('temporary Control admission failures close refresh sockets with a retryable code', {timeout:15_000}, async () => {
  for(const status of [429,503]) {
    const {mf,stub}=await runtime();
    try {
      await start(mf);
      const viewer=await connectedStudio(mf,'viewer');
      const namespace=await mf.getDurableObjectNamespace('CONTROL');
      const control=namespace.get(namespace.idFromName('control-v1')) as unknown as {admissionStatusFixture(status:number):Promise<void>};
      await control.admissionStatusFixture(status);
      const closed=nextSocketEvent(viewer);
      viewer.send(JSON.stringify({type:'refresh-auth',token:token('viewer')}));
      const event=await closed;
      assert.equal(event.kind,'close');
      if(event.kind==='close') assert.equal(event.code,1013,'A provider outage must not become a permanent authorization refusal.');
      const active=await stub.inspectFixture();
      assert.equal(active.mic,'listening');
      assert.equal(active.phase,'active');
      assert.ok(active.lease);
    } finally {await mf.dispose();}
  }
});

test('generation revocation while viewer admission is pending cannot revive that socket', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  const control=await heldControl(mf);
  try {
    await start(mf);
    const viewer=await connectedStudio(mf,'viewer');
    await control.holdAuthorizeFixture('viewer');
    viewer.send(JSON.stringify({type:'refresh-auth',token:token('viewer')}));
    await waitForHeldAuthorization(control);
    const before=await stub.inspectFixture();
    await send(mf,{type:'revoke-connections'},before.revision);
    await control.releaseAuthorizeFixture();
    // The server endpoint is authoritative; dispatchFetch does not reliably
    // deliver a close frame initiated from a separate test RPC.
    const revoked=await stub.inspectFixture();
    assert.ok(revoked.sockets.every(socket=>socket.readyState!==1));
    assert.ok(revoked.sockets.every(socket=>socket.generation===1));
  } finally {await control.releaseAuthorizeFixture();await mf.dispose();}
});

test('closing an owner socket after sixty seconds pauses at disconnect time instead of rewinding to five seconds', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const active=await advanceAudio(mf,stub,60_000);
    const after=await stub.closeOwnerAtFixture(active.round!.segmentAt+60_150,1006);
    assert.equal(after.phase,'paused');
    assert.equal(after.mic,'error');
    assert.equal(after.lease,null);
    assert.equal(after.history,0);
    assert.equal(after.round!.remaining,59_850);
  } finally {await mf.dispose();}
});

test('a round-scoped pause survives unrelated chat revisions while a stale epoch remains rejected', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const snapshot=await stub.inspectFixture();
    await stub.freezeAtFixture(snapshot.now);
    for(let index=0;index<10;index++) await stub.chatFixture({eventId:`race-${index}`,channelId:'123',at:snapshot.now,kind:'message',
      messageId:`race-message-${index}`,userId:String(1000+index),name:`viewer${index}`,text:'1234567890'});
    assert.ok((await stub.inspectFixture()).revision>snapshot.revision);
    // Reproduce the CI race deliberately: the host crosses a whole second while
    // workerd remains frozen. Its host-minted JWT must still fail production
    // future-iat validation, while the shared fixture helper uses workerd time.
    await new Promise(resolve=>setTimeout(resolve,1100));
    assert.ok(Math.floor(Date.now()/1000)>Math.floor(snapshot.now/1000));
    const futureIssued=await mf.dispatchFetch(await endpoint(mf,'state'),{headers:{
      origin:ORIGIN,authorization:`Bearer ${token()}`}});
    assert.equal(futureIssued.status,401,'Future-issued credentials must not become valid to make a fixture pass.');
    await send(mf,{type:'pause',roundId:snapshot.round!.id,epoch:snapshot.round!.epoch},snapshot.revision);
    assert.equal((await stub.inspectFixture()).phase,'paused');
    const invalid=await mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',headers:{
      origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf)}`,'content-type':'application/json'},body:JSON.stringify({id:randomUUID(),
      generation:1,expectedRevision:snapshot.revision,action:{type:'resume',roundId:snapshot.round!.id,epoch:snapshot.round!.epoch}})});
    assert.equal(invalid.status,409,'Relaxed revisions must not let a previous round epoch resume.');
    assert.equal((await stub.inspectFixture()).phase,'paused');
  } finally {await mf.dispose();}
});

test('ordinary chat while idle causes neither Room SQLite writes nor revision or alarm changes', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const before=await stub.inspectFixture();
    assert.equal(before.phase,'idle');
    for(let index=0;index<20;index++) {
      const response=await stub.chatFixture({eventId:`idle-${index}`,channelId:'123',at:Date.now(),kind:'message',
        messageId:`idle-message-${index}`,userId:String(1000+index),name:`viewer${index}`,text:'1234567890'});
      assert.equal(response.body.reason,'room_idle');
    }
    const after=await stub.inspectFixture();
    assert.equal(after.sqlChanges,before.sqlChanges);
    assert.equal(after.revision,before.revision);
    assert.equal(after.chatReceipts,0);
    assert.equal(after.alarm,before.alarm);
  } finally {await mf.dispose();}
});

test('permanent outbox failure is dropped and temporary failure expires without a repeating alarm', {timeout:15_000}, async () => {
  for(const status of [403,503]) {
    const {mf,stub}=await runtime();
    try {
      const namespace=await mf.getDurableObjectNamespace('CONTROL');
      const control=namespace.get(namespace.idFromName('control-v1')) as unknown as {
        deliveryFixture(status:number):Promise<void>;deliveredFixture():Promise<number>};
      await control.deliveryFixture(status);
      const now=Date.now()+30_000;
      assert.equal((await stub.enqueueOutboxFixture(now,now+60_000)).outbox,1);
      const attempted=await stub.flushOutboxAtFixture(now);
      assert.equal(await control.deliveredFixture(),1);
      if(status===403) {
        assert.equal(attempted.outbox,0);
        assert.equal(attempted.alarm,null);
      } else {
        assert.equal(attempted.outbox,1);
        assert.equal(attempted.alarm,now+15_000);
        const expired=await stub.flushOutboxAtFixture(now+60_001);
        assert.equal(expired.outbox,0);
        assert.equal(expired.alarm,null);
        assert.equal(await control.deliveredFixture(),1,'Expired announcements must not call Control again.');
      }
    } finally {await mf.dispose();}
  }
});

test('anonymous Extension viewers cannot fill pilot socket seats', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const anonymous=token('viewer',{opaque_user_id:'Aanonymous',user_id:undefined});
    const response=await mf.dispatchFetch(await endpoint(mf,'socket'),{headers:{origin:ORIGIN,upgrade:'websocket',
      'sec-websocket-protocol':`baited.v1, baited.auth.${anonymous}`}});
    assert.equal(response.status,401);
    await start(mf);
    await connectedStudio(mf,'viewer');
    assert.equal((await stub.inspectFixture()).sockets.filter(s=>s.role==='viewer'&&s.readyState===1).length,1);
  } finally {await mf.dispose();}
});

test('chat-command cooldowns preserve outbox capacity for a round event', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const clock=Date.now()+30_000;
    await stub.freezeAtFixture(clock);
    const initial=await state(mf);
    await send(mf,{type:'settings',settings:{...initial.room.settings,chatBot:true}},initial.revision);
    await start(mf);
    const command=(index:number)=>({eventId:`help-${index}`,channelId:'123',at:clock,kind:'message',
      messageId:`help-message-${index}`,userId:String(1000+index),name:`viewer${index}`,text:'!bait help'});
    assert.equal((await stub.chatFixture(command(0))).status,200);
    const first=await stub.inspectFixture();
    for(let index=1;index<=40;index++) {
      const result=await stub.chatFixture(command(index));
      assert.equal(result.body.reason,'no_change');
    }
    const quiet=await stub.inspectFixture();
    assert.equal(quiet.outbox,first.outbox,'Reply spam must not consume all 32 durable outbox slots.');
    assert.equal(quiet.revision,first.revision);
    await send(mf,{type:'pause',roundId:quiet.round!.id,epoch:quiet.round!.epoch},quiet.revision);
    const paused=await stub.inspectFixture();
    assert.equal(paused.phase,'paused');
    assert.equal(paused.outbox,quiet.outbox+1,'The real round event still has an outbox slot.');
  } finally {await mf.dispose();}
});
