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
  persistedLease: Inspection['lease'];
  microphoneStopRevision?:number;
  persistedMicrophoneStopRevision?:number;
  leaseWrites:number;
  ownerSpeech?: {firstAudioAt:number;lastAudioAt:number;samples:number;lastSequence:number};
  ownerAdmission?: {inputs?:{at:number;n:number};audioInputs?:{at:number;tokens:number}};
  chatReceipts: number; history: number; participants: number; sqlChanges: number; outbox: number;
  chatConnected: boolean; connectionRevision: number;
  sockets: {role:string;sessionId?:string;expiresAt:number;generation:number;readyState:number}[];
}
interface FixtureStub {
  voiceDraftCurrentFixture(ref:Record<string,unknown>):Promise<boolean>;
  operatorFixture(enabled:boolean,revision:number,fail?:boolean):Promise<{status:number;body:unknown}>;
  bootstrapFixture(): Promise<number>;
  inspectFixture(): Promise<Inspection>;
  reconcileAtFixture(at: number): Promise<Inspection>;
  chatFixture(event: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }>;
  recoverChatFixture(event:Record<string,unknown>):Promise<{status:number}>;
  disconnectFixture(): Promise<number>;
  disconnectBatchFixture(payload:Record<string,unknown>): Promise<number>;
  disconnectWithStorageFailureFixture(payload:Record<string,unknown>): Promise<number>;
  connectionFixture(status:string,revision:unknown): Promise<number>;
  clockFixture(): Promise<number>;
  freezeAtFixture(at: number): Promise<void>;
  ownerMessageAtFixture(at: number, message: Record<string,unknown>): Promise<Inspection>;
  queuedOwnerMessageFixture(receivedAt: number, processedAt: number, message: Record<string,unknown>): Promise<Inspection>;
  closeOwnerAtFixture(at: number, code?: number): Promise<Inspection>;
  enqueueOutboxFixture(at: number, expiresAt: number, delay?:number): Promise<Inspection>;
  flushOutboxAtFixture(at: number): Promise<Inspection>;
  receiptStatsFixture(): Promise<{count:number;indexedCount:number;indexedRowsRead:number}>;
  recoverFixture(): Promise<Inspection>;
  recoverAlarmAtFixture(at:number,initialStop?:boolean):Promise<Inspection>;
  failOwnerMessageAtFixture(at:number,message:Record<string,unknown>): Promise<Inspection>;
  failAlarmOwnerMessageAtFixture(at:number,message:Record<string,unknown>): Promise<Inspection>;
  interleaveOwnerAudioFixture(at:number,message:Record<string,unknown>): Promise<Inspection>;
  microphoneCommandFixture(action:Record<string,unknown>,revision:number,recover?:boolean,failAlarm?:boolean):Promise<{status:number;body:Receipt;inspection:Inspection}>;
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
          deliveredEvents = [];
          heldRole = null;
          authorizeWaiting = 0;
          authorizeGate = null;
          releaseAuthorize = null;
          denyFixture() { this.allowed = false; }
          admissionStatusFixture(status) { this.admissionStatus = status; }
          deliveryFixture(status) { this.deliveryStatus = status; }
          deliveredFixture() { return this.deliveries; }
          deliveredEventsFixture() { return this.deliveredEvents; }
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
            if (path === '/internal/room-event') { this.deliveries++; const body=await request.json(); this.deliveredEvents.push({type:body.event?.type,status:this.deliveryStatus}); return Response.json({ok: this.deliveryStatus === 200}, {status:this.deliveryStatus}); }
            return new Response('No external provider in this fixture.', {status: 503});
          }
        }
        export class ChannelRoom extends BaseRoom {
          async voiceDraftCurrentFixture(ref) {
            const response=await this.fetch(new Request('https://room.internal/internal/voice-draft-current',{method:'POST',headers:{'content-type':'application/json'},
              body:JSON.stringify({channelId:'123',ref:{...this.pilotState.voiceDraft?.latest,...ref}})}));
            return response.ok && (await response.json()).current===true;
          }
          failNextSchedule=false;
          interleaveNextSchedule=undefined;
          async schedule(...args) {
            const interleave=this.interleaveNextSchedule;this.interleaveNextSchedule=undefined;
            if(interleave) interleave();
            if(this.failNextSchedule) {this.failNextSchedule=false;throw new Error('fixture_audio_alarm_failure');}
            return super.schedule(...args);
          }
          async bootstrapFixture() {
            this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS fixture_lease_writes(id INTEGER PRIMARY KEY,n INTEGER NOT NULL); INSERT OR IGNORE INTO fixture_lease_writes VALUES(1,0)');
            this.ctx.storage.sql.exec("CREATE TRIGGER IF NOT EXISTS fixture_count_lease_writes AFTER UPDATE ON pilot_state WHEN json_extract(OLD.body,'$.lease.expiresAt') < json_extract(NEW.body,'$.lease.expiresAt') BEGIN UPDATE fixture_lease_writes SET n=n+1 WHERE id=1; END");
            return (await this.fetch(new Request('https://room.internal/internal/control', {
              method:'POST', body:JSON.stringify({channelId:'123', login:'komediruzecki7', type:'connection', status:'connected',connectionRevision:1})
            }))).status;
          }
          async inspectFixture() {
            const self = this;
            return {alarm: await this.ctx.storage.getAlarm(), now:self.now, revision:self.revision,
              phase:self.game.phase, mic:self.game.mic, lease:self.pilotState.lease,
              persistedLease:JSON.parse(this.ctx.storage.sql.exec('SELECT body FROM pilot_state WHERE id=1').one().body).lease,
              microphoneStopRevision:self.pilotState.microphoneStopRevision,
              persistedMicrophoneStopRevision:JSON.parse(this.ctx.storage.sql.exec('SELECT body FROM pilot_state WHERE id=1').one().body).microphoneStopRevision,
              leaseWrites:this.ctx.storage.sql.exec('SELECT n FROM fixture_lease_writes WHERE id=1').one().n,
              chatConnected:self.pilotState.chatConnected,connectionRevision:self.pilotState.connectionRevision??0,
              ownerSpeech:this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()).find(att=>att?.socketId===self.pilotState.lease?.socketId)?.speech,
              ownerAdmission:this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()).filter(att=>att?.socketId===self.pilotState.lease?.socketId)
                .map(att=>({inputs:att.inputs,audioInputs:att.audioInputs}))[0],
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
          async recoverAlarmAtFixture(at,initialStop=false) { Date.now=()=>at;if(initialStop){const state=JSON.parse(this.ctx.storage.sql.exec('SELECT body FROM pilot_state WHERE id=1').one().body);delete state.operator;this.ctx.storage.sql.exec('UPDATE pilot_state SET body=? WHERE id=1',JSON.stringify(state));}const recovered=new ChannelRoom(this.ctx,initialStop?{...this.env,EDGE_OPERATOR_INITIAL_ENABLED:'false'}:this.env);await recovered.alarm();return recovered.inspectFixture(); }
          async recoverFixture() {
            // Reconstruct from the real SQLite checkpoint and hibernation
            // attachments without replacing the production event handlers.
            return new ChannelRoom(this.ctx,this.env).inspectFixture();
          }
          async microphoneCommandFixture(action,expectedRevision,recover=false,failAlarm=false) {
            const target=recover?new ChannelRoom(this.ctx,this.env):this;
            const identity=this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()?.identity).find(identity=>identity?.canControl);
            if(!identity) throw new Error('The fixture has no Studio identity.');
            target.failNextSchedule=failAlarm;
            try {
              const response=await target.fetch(new Request('https://room.internal/commands',{method:'POST',
                headers:{'x-edge-identity':JSON.stringify(identity),'content-type':'application/json'},
                body:JSON.stringify({id:crypto.randomUUID(),generation:target.generation,expectedRevision,action})}));
              return {status:response.status,body:await response.json(),inspection:await target.inspectFixture()};
            } finally {target.failNextSchedule=false;}
          }
          async failOwnerMessageAtFixture(at,message) {
            this.ctx.storage.sql.exec("CREATE TRIGGER fixture_fail_audio_lease BEFORE INSERT ON pilot_state BEGIN SELECT RAISE(ABORT,'fixture_audio_lease_failure'); END");
            try {return await this.ownerMessageAtFixture(at,message);}
            finally {this.ctx.storage.sql.exec('DROP TRIGGER fixture_fail_audio_lease');}
          }
          async failAlarmOwnerMessageAtFixture(at,message) {
            this.failNextSchedule=true;
            try {return await this.ownerMessageAtFixture(at,message);}
            finally {this.failNextSchedule=false;}
          }
          async interleaveOwnerAudioFixture(at,message) {
            Date.now=()=>at;
            const owner=this.ctx.getWebSockets().find(ws=>ws.deserializeAttachment()?.socketId===this.pilotState.lease?.socketId);
            if(!owner) throw new Error('The fixture has no microphone owner.');
            let queued=[];
            // Run real admission handlers before the current renewal publishes
            // its speech attachment. Their mutations queue behind this frame.
            this.interleaveNextSchedule=()=>{
              queued=[this.webSocketMessage(owner,'resync'),this.webSocketMessage(owner,
                JSON.stringify({...message,samples:message.samples+2048}))];
            };
            try {
              await this.webSocketMessage(owner,JSON.stringify(message));
              if(queued.length!==2) throw new Error('The fixture did not interleave renewal.');
              await Promise.all(queued);
              return this.inspectFixture();
            } finally {this.interleaveNextSchedule=undefined;}
          }
          async closeOwnerAtFixture(at,code=1000) {
            Date.now = () => at;
            const owner=this.ctx.getWebSockets().find(ws=>ws.deserializeAttachment()?.socketId===this.pilotState.lease?.socketId);
            if(!owner) throw new Error('The fixture has no microphone owner.');
            await this.webSocketClose(owner,code);
            return this.inspectFixture();
          }
          async enqueueOutboxFixture(at,expiresAt,delay=0) {
            Date.now = () => at;
            this.ctx.storage.sql.exec('INSERT INTO pilot_outbox(id,body,retry_at,expires_at) VALUES(?,?,?,?)',
              crypto.randomUUID(),JSON.stringify({channelId:'123',event:{type:'round-start'}}),at+delay,expiresAt);
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
          async recoverChatFixture(event) { return new ChannelRoom(this.ctx,this.env).chatFixture(event); }
          async chatFixture(event) {
            const response = await this.fetch(new Request('https://room.internal/internal/twitch-chat', {
              method:'POST', body:JSON.stringify(event)
            }));
            return {status:response.status, body:await response.json()};
          }
          async operatorFixture(enabled,revision,fail=false) {
            if(fail)this.ctx.storage.sql.exec("CREATE TRIGGER fixture_fail_operator BEFORE INSERT ON meta BEGIN SELECT RAISE(ABORT,'fixture_operator_failure'); END; CREATE TRIGGER fixture_fail_operator_state BEFORE INSERT ON pilot_state BEGIN SELECT RAISE(ABORT,'fixture_operator_failure'); END");
            try {
              const response=await this.fetch(new Request('https://room.internal/internal/operator',{method:'POST',body:JSON.stringify({channelId:'123',enabled,revision})}));
              return {status:response.status,body:await response.json()};
            } finally {if(fail)this.ctx.storage.sql.exec('DROP TRIGGER fixture_fail_operator; DROP TRIGGER fixture_fail_operator_state');}
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
          async disconnectWithStorageFailureFixture(payload) {
            // Abort the actual SQLite checkpoint, rather than mocking the
            // Room commit method or bypassing its transaction boundary.
            this.ctx.storage.sql.exec("CREATE TRIGGER fixture_fail_checkpoint BEFORE INSERT ON meta BEGIN SELECT RAISE(ABORT,'fixture_checkpoint_failure'); END");
            try {return await this.disconnectBatchFixture(payload);}
            finally {this.ctx.storage.sql.exec('DROP TRIGGER fixture_fail_checkpoint');}
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

async function runtime(bindings: Record<string, string> = {}, bootstrap=true) {
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
    if(bootstrap)assert.equal(await stub.bootstrapFixture(), 200);
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

test('a failed revocation checkpoint still closes captured sockets and preserves the fresh microphone owner', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const retired='retired-before-new-sign-in';
    await connectedStudio(mf,'studio',await fixtureToken(mf,'studio',{sid:retired}));
    await connectedStudio(mf,'viewer');
    await start(mf);
    const before=await advanceAudio(mf,stub,500);
    assert.equal(await stub.disconnectWithStorageFailureFixture({sessionIds:[retired]}),503,
      'The checkpoint failure must remain retryable, not become a success receipt.');
    const after=await stub.inspectFixture();
    assert.equal(after.revision,before.revision,'The failed transaction must not publish its checkpoint.');
    assert.deepEqual(after.lease,before.lease,'Revocation must not reassign or clear the unaffected owner lease.');
    assert.equal(after.mic,'listening');
    assert.equal(after.phase,'active');
    assert.ok(after.sockets.every(socket=>socket.sessionId!==retired || socket.readyState!==1));
    assert.ok(after.sockets.some(socket=>socket.sessionId===SESSION && socket.readyState===1));
    assert.ok(after.sockets.some(socket=>socket.role==='viewer' && socket.readyState===1));
    assert.equal(await stub.disconnectBatchFixture({sessionIds:[retired]}),200);
    const healthy=await stub.ownerMessageAtFixture(before.round!.segmentAt+628,{type:'speech-audio',
      leaseId:before.lease!.id,roundId:before.round!.id,epoch:before.round!.epoch,samples:10_048});
    assert.equal(healthy.lease!.id,before.lease!.id);
    assert.equal(healthy.ownerSpeech!.samples,10_048);
    assert.equal(healthy.mic,'listening');
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

test('the durable alarm confirms native speech catches after 15 seconds exactly once without a browser decision', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const target=(await state(mf,'viewer')).room.round!.target!;
    const active=await advanceAudio(mf,stub,1000);
    const detectedAt=active.round!.segmentAt+1100;
    await stub.ownerMessageAtFixture(detectedAt,{type:'speech-final',leaseId:active.lease!.id,
      roundId:active.round!.id,epoch:active.round!.epoch,sequence:1,line:{id:randomUUID(),
        text:target,isComplete:true,startTime:0,duration:1,
        words:[{text:target,start:0.2,end:0.8,confidence:1}]}});
    const pending=await state(mf);
    assert.equal(pending.room.result?.outcome,'review');
    const confirmAt=detectedAt+15_000;
    assert.equal(pending.room.result?.confirmAt,confirmAt);
    assert.equal(pending.room.score.wins,0);
    assert.equal((await state(mf,'overlay')).room.result?.word,undefined);
    const alarm=(await stub.inspectFixture()).alarm;
    assert.notEqual(alarm,null,'The pending catch must have a durable wake.');
    assert.ok(alarm!<=confirmAt,'A pending catch must wake no later than its confirmation deadline.');

    // Exercise the real alarm handler, including losing microphone liveness
    // while waiting. Confirmation does not depend on a Studio tab or its timer.
    const before=await stub.flushOutboxAtFixture(confirmAt-1);
    assert.equal(before.history,0);
    assert.equal((await state(mf)).room.result?.outcome,'review');
    const confirmed=await stub.flushOutboxAtFixture(confirmAt);
    assert.equal(confirmed.history,1);
    const caught=await state(mf);
    assert.equal(caught.room.result?.outcome,'caught');
    assert.equal(caught.room.result?.at,confirmAt);
    assert.equal(Object.hasOwn(caught.room.result!,'confirmAt'),false);
    assert.equal(caught.room.score.wins,1);
    assert.equal(caught.room.score.streak,1);
    assert.equal((await state(mf,'overlay')).room.result?.word,target);
    const repeated=await stub.flushOutboxAtFixture(confirmAt+1);
    assert.equal(repeated.history,1,'A repeated alarm must not insert or score the catch twice.');

    const latest=await state(mf);
    const undone=await send(mf,{type:'reverse',roundId:active.round!.id},latest.revision);
    assert.equal(undone.ok,true);
    const reversed=await state(mf);
    assert.equal(reversed.room.result?.outcome,'overturned');
    assert.equal(reversed.room.score.wins,0);
    assert.equal(reversed.room.score.streak,0);
    assert.equal(Object.hasOwn(reversed.room.result!,'confirmAt'),false);
  } finally {await mf.dispose();}
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

test('active owner audio refreshes its durable lease without a browser heartbeat and silence still pauses', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const initial=await stub.inspectFixture();
    const startAt=initial.round!.segmentAt;
    let after=initial;
    // Firefox can throttle the 10-second UI heartbeat while its audio worklet
    // continues emitting 128ms capture progress. No microphone commands here.
    for(let index=1;index<=351;index++) {
      after=await stub.ownerMessageAtFixture(startAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
      assert.equal(after.phase,'active',`Valid audio lost its lease at ${index*128}ms.`);
      assert.equal(after.mic,'listening');
    }
    assert.equal(after.revision,initial.revision,'Audio liveness does not publish a game mutation per frame.');
    assert.equal(after.leaseWrites-initial.leaseWrites,4,'Refresh once per 10 seconds, rather than every 128ms audio frame.');
    assert.equal(after.lease!.expiresAt,startAt+316*128+30_000);
    assert.deepEqual(after.persistedLease,after.lease,'The accepted extension must be durable.');
    const recovered=await stub.recoverFixture();
    assert.deepEqual(recovered.lease,after.lease,'Room reconstruction must retain the exact renewed lease.');
    assert.deepEqual(recovered.ownerSpeech,after.ownerSpeech);
    const lastAudioAt=startAt+351*128;
    const beforeGap=await stub.flushOutboxAtFixture(lastAudioAt+2_499);
    assert.equal(beforeGap.phase,'active');
    const slept=await stub.flushOutboxAtFixture(lastAudioAt+2_500);
    assert.equal(slept.phase,'paused','A live lease cannot conceal a silent/sleeping capture.');
    assert.equal(slept.mic,'error');
    assert.equal(slept.lease,null);
    assert.equal(slept.history,0);
    assert.equal(slept.round!.remaining,initial.round!.duration-(lastAudioAt+2_500-startAt));
  } finally {await mf.dispose();}
});

test('paused and stale-round audio cannot refresh a lease, and expired capture cannot rearm itself', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const active=await advanceAudio(mf,stub,1000);
    await send(mf,{type:'pause',roundId:active.round!.id,epoch:active.round!.epoch},active.revision);
    const paused=await stub.inspectFixture();
    const frame={type:'speech-audio',leaseId:paused.lease!.id,roundId:paused.round!.id,
      epoch:paused.round!.epoch,samples:16_000+2048};
    const ignored=await stub.ownerMessageAtFixture(paused.round!.segmentAt+11_000,frame);
    assert.deepEqual(ignored.lease,paused.lease);
    assert.deepEqual(ignored.persistedLease,paused.persistedLease);
    await send(mf,{type:'resume',roundId:paused.round!.id,epoch:paused.round!.epoch},ignored.revision);
    const resumed=await stub.inspectFixture();
    const stale=await stub.ownerMessageAtFixture(resumed.round!.segmentAt+128,frame);
    assert.equal(stale.phase,'active');
    assert.deepEqual(stale.lease,resumed.lease,'An old epoch cannot extend capture authority.');
    await send(mf,{type:'pause',roundId:stale.round!.id,epoch:stale.round!.epoch},stale.revision);
    const expired=await stub.ownerMessageAtFixture(stale.lease!.expiresAt,frame);
    assert.equal(expired.lease,null,'Even correctly bound late audio cannot resurrect an expired lease.');
    assert.equal(expired.persistedLease,null);
    assert.equal(expired.mic,'error');
  } finally {await mf.dispose();}
});

test('unowned audio cannot refresh another session or Studio tab microphone lease', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const secondary=await connectedStudio(mf);
    const otherSession=await connectedStudio(mf,'studio',await fixtureToken(mf,'studio',{sid:'another-studio-session'}));
    const viewer=await connectedStudio(mf,'viewer');
    const initial=await stub.inspectFixture();
    for(let index=1;index<=78;index++) {
      await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
    }
    const before=await stub.inspectFixture();
    const frame={type:'speech-audio',leaseId:initial.lease!.id,roundId:initial.round!.id,
      epoch:initial.round!.epoch,samples:79*2048};
    await stub.freezeAtFixture(initial.round!.segmentAt+79*128);
    for(const attacker of [secondary,otherSession,viewer]) {
      const closed=nextSocketEvent(attacker);
      attacker.send(JSON.stringify(frame));
      assert.deepEqual(await closed,{kind:'close',code:1008});
      const unchanged=await stub.inspectFixture();
      assert.deepEqual(unchanged.lease,before.lease);
      assert.deepEqual(unchanged.persistedLease,before.persistedLease);
      assert.equal(unchanged.leaseWrites,before.leaseWrites);
      assert.equal(unchanged.phase,'active');
    }
    const owner=await stub.ownerMessageAtFixture(initial.round!.segmentAt+79*128,frame);
    assert.equal(owner.leaseWrites,before.leaseWrites+1);
    assert.equal(owner.lease!.expiresAt,initial.round!.segmentAt+79*128+30_000);
  } finally {await mf.dispose();}
});

test('queued active audio refreshes from receipt time and cannot extend a lease after it expired in the queue', {timeout:15_000}, async () => {
  for(const expiresInQueue of [false,true]) {
    const {mf,stub}=await runtime();
    try {
      await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
      await start(mf);
      const initial=await stub.inspectFixture();
      for(let index=1;index<=78;index++) {
        await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
          roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
      }
      const receivedAt=initial.round!.segmentAt+79*128;
      const processedAt=expiresInQueue?initial.lease!.expiresAt:receivedAt+1000;
      const after=await stub.queuedOwnerMessageFixture(receivedAt,processedAt,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:79*2048});
      if(expiresInQueue) {
        assert.equal(after.lease,null);
        assert.equal(after.persistedLease,null);
        assert.equal(after.mic,'error');
        assert.equal(after.phase,'paused');
        assert.equal(after.leaseWrites,0);
      } else {
        assert.equal(after.lease!.expiresAt,receivedAt+30_000,'Processing delay cannot mint extra capture lifetime.');
        assert.equal(after.phase,'active');
        assert.equal(after.leaseWrites,1);
        assert.deepEqual(after.persistedLease,after.lease);
      }
    } finally {await mf.dispose();}
  }
});

test('malformed current-owner audio at the refresh boundary cannot extend microphone authority', {timeout:15_000}, async () => {
  for(const invalid of ['duplicate','future','malformed'] as const) {
    const {mf,stub}=await runtime();
    try {
      await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
      await start(mf);
      const initial=await stub.inspectFixture();
      for(let index=1;index<=78;index++) {
        await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
          roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
      }
      const before=await stub.inspectFixture();
      assert.equal(before.lease!.expiresAt,initial.lease!.expiresAt);
      const samples=invalid==='duplicate'?78*2048:invalid==='future'?78*2048+8193:'not-samples';
      const rejected=await stub.ownerMessageAtFixture(initial.round!.segmentAt+79*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples});
      assert.equal(rejected.lease,null);
      assert.equal(rejected.persistedLease,null);
      assert.equal(rejected.phase,'paused');
      assert.equal(rejected.mic,'error');
    } finally {await mf.dispose();}
  }
});

test('an audio lease renewal storage failure cannot publish uncommitted liveness or sample progress', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const initial=await stub.inspectFixture();
    for(let index=1;index<=78;index++) {
      await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
    }
    const before=await stub.inspectFixture();
    const failed=await stub.failOwnerMessageAtFixture(initial.round!.segmentAt+79*128,{type:'speech-audio',leaseId:initial.lease!.id,
      roundId:initial.round!.id,epoch:initial.round!.epoch,samples:79*2048});
    assert.deepEqual(failed.lease,before.lease);
    assert.deepEqual(failed.persistedLease,before.persistedLease);
    assert.deepEqual(failed.ownerSpeech,before.ownerSpeech,'Failed durable renewal cannot publish accepted sample progress.');
    assert.equal(failed.revision,before.revision);
    const recovered=await stub.recoverFixture();
    assert.deepEqual(recovered.lease,before.lease);
  } finally {await mf.dispose();}
});

test('audio lease renewal preserves admission counters changed before its attachment is published', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const initial=await stub.inspectFixture();
    for(let index=1;index<=78;index++) {
      await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
    }
    const at=initial.round!.segmentAt+79*128;
    const after=await stub.interleaveOwnerAudioFixture(at,{type:'speech-audio',leaseId:initial.lease!.id,
      roundId:initial.round!.id,epoch:initial.round!.epoch,samples:79*2048});
    assert.equal(after.phase,'active');
    assert.equal(after.ownerSpeech!.samples,80*2048,'Both ordered audio frames must be accepted.');
    assert.deepEqual(after.ownerAdmission!.audioInputs,{at,tokens:46},'A durable renewal must not refund an admitted audio token.');
    assert.deepEqual(after.ownerAdmission!.inputs,{at:Math.floor(at/1000),n:1},'Publishing speech must retain a concurrent resync admission.');
    assert.deepEqual(after.persistedLease,after.lease);
  } finally {await mf.dispose();}
});

test('an audio renewal alarm failure rolls back its lease write before safely pausing capture', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await stub.freezeAtFixture(Math.ceil(Date.now()/1000)*1000);
    await start(mf);
    const initial=await stub.inspectFixture();
    for(let index=1;index<=78;index++) {
      await stub.ownerMessageAtFixture(initial.round!.segmentAt+index*128,{type:'speech-audio',leaseId:initial.lease!.id,
        roundId:initial.round!.id,epoch:initial.round!.epoch,samples:index*2048});
    }
    const before=await stub.inspectFixture();
    const failed=await stub.failAlarmOwnerMessageAtFixture(initial.round!.segmentAt+79*128,{type:'speech-audio',leaseId:initial.lease!.id,
      roundId:initial.round!.id,epoch:initial.round!.epoch,samples:79*2048});
    assert.equal(failed.lease,null);
    assert.equal(failed.persistedLease,null);
    assert.equal(failed.mic,'error');
    assert.equal(failed.phase,'paused');
    assert.equal(failed.leaseWrites,before.leaseWrites,'A failed alarm transaction must roll back its lease extension.');
    assert.equal(failed.history,0);
    const recovered=await stub.recoverFixture();
    assert.equal(recovered.lease,null);
    assert.equal(recovered.phase,'paused');
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

test('a canceled initial microphone arm cannot arrive late and recreate its lease', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await connectedStudio(mf);
    const before=await state(mf), leaseId=randomUUID();
    // The arm was sent first but is delayed on the network. Cancellation is
    // authoritative even if its exact capture has not arrived at the Room yet.
    const stopped=await send(mf,{type:'microphone',armed:false,leaseId},before.revision);
    const response=await mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',
      headers:{origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf)}`,'content-type':'application/json'},
      body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:before.revision,
        action:{type:'microphone',armed:true,leaseId}})});
    assert.equal(response.status,409,'An initial arm sent before cancellation cannot recreate the lease.');
    assert.equal((await response.json() as Receipt).code,'lease_owner');
    const after=await stub.inspectFixture();
    assert.equal(after.lease,null);
    assert.equal(after.mic,'off');
    assert.equal(after.microphoneStopRevision,stopped.revision);
    assert.equal(after.persistedMicrophoneStopRevision,stopped.revision);
  } finally {await mf.dispose();}
});

test('microphone cancellation after arm fences late requests without affecting a replacement lease', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await connectedStudio(mf);
    const before=await state(mf), oldId=randomUUID();
    const armed=await send(mf,{type:'microphone',armed:true,leaseId:oldId},before.revision);
    const stopped=await send(mf,{type:'microphone',armed:false,leaseId:oldId},armed.revision);
    const stale=await stub.microphoneCommandFixture({type:'microphone',armed:true,leaseId:oldId},before.revision);
    assert.equal(stale.status,409);assert.equal(stale.body.code,'lease_owner');
    assert.equal(stale.inspection.lease,null);
    const replacementId=randomUUID();
    const replacement=await send(mf,{type:'microphone',armed:true,leaseId:replacementId},stopped.revision);
    const lateCancel=await stub.microphoneCommandFixture({type:'microphone',armed:false,leaseId:oldId},replacement.revision);
    assert.equal(lateCancel.status,409);assert.equal(lateCancel.body.code,'lease_owner');
    assert.equal(lateCancel.inspection.lease!.id,replacementId);
    assert.equal(lateCancel.inspection.mic,'listening');
    assert.equal(lateCancel.inspection.revision,replacement.revision);
    assert.equal(lateCancel.inspection.microphoneStopRevision,stopped.revision,'A rejected old-ID cancel cannot fence the replacement.');
    assert.equal(lateCancel.inspection.persistedMicrophoneStopRevision,stopped.revision);
  } finally {await mf.dispose();}
});

test('microphone cancellation barrier survives recovery before a delayed initial arm', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await connectedStudio(mf);
    const before=await state(mf), leaseId=randomUUID();
    const stopped=await send(mf,{type:'microphone',armed:false,leaseId},before.revision);
    const recovered=await stub.microphoneCommandFixture({type:'microphone',armed:true,leaseId},before.revision,true);
    assert.equal(recovered.status,409);assert.equal(recovered.body.code,'lease_owner');
    assert.equal(recovered.inspection.lease,null);
    assert.equal(recovered.inspection.microphoneStopRevision,stopped.revision);
    assert.equal(recovered.inspection.persistedMicrophoneStopRevision,stopped.revision);
  } finally {await mf.dispose();}
});

test('microphone arms tolerate unrelated revisions after cancellation and exact-owner renewals keep older-revision support', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await connectedStudio(mf);
    const before=await state(mf), leaseId=randomUUID();
    const stopped=await send(mf,{type:'microphone',armed:false,leaseId:randomUUID()},before.revision);
    await send(mf,{type:'settings',settings:{...before.room.settings,duration:90}},stopped.revision);
    const armed=await send(mf,{type:'microphone',armed:true,leaseId},stopped.revision);
    assert.ok(armed.revision>stopped.revision+1,'The arm is based on a revision older than unrelated settings changes.');
    const renewed=await stub.microphoneCommandFixture({type:'microphone',armed:true,renew:true,leaseId},before.revision);
    assert.equal(renewed.status,200);
    assert.equal(renewed.inspection.lease!.id,leaseId);
    assert.equal(renewed.inspection.microphoneStopRevision,stopped.revision);
  } finally {await mf.dispose();}
});

test('failed microphone cancellation rolls back its lease and durable revision barrier', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    await connectedStudio(mf);
    const before=await state(mf), leaseId=randomUUID();
    const armed=await send(mf,{type:'microphone',armed:true,leaseId},before.revision);
    const failed=await stub.microphoneCommandFixture({type:'microphone',armed:false,leaseId},armed.revision,false,true);
    assert.equal(failed.status,400,'The command handler returns a safe failure when the transaction cannot commit.');
    assert.equal(failed.inspection.lease!.id,leaseId);
    assert.equal(failed.inspection.mic,'listening');
    assert.equal(failed.inspection.microphoneStopRevision,undefined);
    assert.equal(failed.inspection.persistedMicrophoneStopRevision,undefined);
    assert.equal(failed.inspection.revision,armed.revision);
    const recovered=await stub.recoverFixture();
    assert.equal(recovered.lease!.id,leaseId);
    assert.equal(recovered.microphoneStopRevision,undefined);
  } finally {await mf.dispose();}
});

test('microphone dispatch exposes only known actionable failure codes', {timeout:15_000}, async () => {
  const {mf}=await runtime();
  try {
    const before=await state(mf);
    const response=await mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',
      headers:{origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf)}`,'content-type':'application/json'},
      body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:before.revision,
        action:{type:'microphone',armed:true,leaseId:randomUUID()}})});
    assert.equal(response.status,409);
    assert.equal((await response.json() as Receipt).code,'studio_not_connected');
    const unavailable=await mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',
      headers:{origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf)}`,'content-type':'application/json'},
      body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:before.revision,action:{type:'start'}})});
    assert.equal(unavailable.status,409);
    assert.equal((await unavailable.json() as Receipt).code,'action_unavailable');
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


test('operator room stop clears capture and prevents old socket or chat activity after recovery',async()=>{
  const {mf,stub}=await runtime();
  try {
    const initial=await state(mf);
    await send(mf,{type:'settings',settings:{...initial.room.settings,chatBot:false,duration:180}},initial.revision);
    assert.equal((await stub.operatorFixture(false,1)).status,200);
    const stopped=await stub.inspectFixture();assert.equal(stopped.phase,'idle');assert.equal(stopped.lease,null);assert.equal(stopped.outbox,0);
    assert.equal((await stub.chatFixture({eventId:'stopped',channelId:'123',at:Date.now(),kind:'message',userId:'555',text:'clue'})).status,503);
    await stub.recoverFixture();
    assert.equal((await stub.chatFixture({eventId:'stopped2',channelId:'123',at:Date.now(),kind:'message',userId:'555',text:'clue'})).status,503);
    assert.equal((await stub.operatorFixture(true,2)).status,200);
    const enabled=await stub.inspectFixture();assert.equal(enabled.phase,'idle');assert.equal(enabled.lease,null);assert.equal(enabled.chatConnected,false);
    // A delayed old stop must not reverse the later operator decision.
    assert.equal((await stub.operatorFixture(false,1)).status,200);
    assert.equal((await stub.chatFixture({eventId:'after-enable',channelId:'123',at:Date.now(),kind:'message',userId:'555',text:'clue'})).status,200);
    const resumed=await state(mf);assert.equal(resumed.room.settings.chatBot,false);assert.equal(resumed.room.settings.duration,180);
  } finally {await mf.dispose();}
});


test('operator room stop rolls back its outbox and can retry the same revision after storage failure',async()=>{
  const {mf,stub}=await runtime();
  try {
    const now=await stub.clockFixture();await stub.enqueueOutboxFixture(now,now+60000,30000);
    assert.equal((await stub.operatorFixture(false,1,true)).status,503);
    assert.equal((await stub.inspectFixture()).outbox,1);
    assert.equal((await stub.operatorFixture(false,1)).status,200);
    const stopped=await stub.inspectFixture();assert.equal(stopped.outbox,0);assert.equal(stopped.alarm,null);assert.equal(stopped.phase,'idle');
  } finally {await mf.dispose();}
});


test('operator failed checkpoint blocks pending catch settlement through alarms and reconstruction',async()=>{
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const target=(await state(mf,'viewer')).room.round!.target!;
    const active=await advanceAudio(mf,stub,1000);
    const detectedAt=active.round!.segmentAt+1100;
    await stub.ownerMessageAtFixture(detectedAt,{type:'speech-final',leaseId:active.lease!.id,
      roundId:active.round!.id,epoch:active.round!.epoch,sequence:1,line:{id:randomUUID(),
        text:target,isComplete:true,startTime:0,duration:1,
        words:[{text:target,start:0.2,end:0.8,confidence:1}]}});
    assert.equal((await state(mf)).room.result?.outcome,'review');
    assert.equal((await stub.operatorFixture(false,1,true)).status,503);
    const afterAlarm=await stub.flushOutboxAtFixture(detectedAt+16000);
    assert.equal(afterAlarm.history,0,'A failed stop cannot award the pending catch.');assert.equal(afterAlarm.alarm,null);
    const recovered=await stub.recoverAlarmAtFixture(detectedAt+17000);
    assert.equal(recovered.history,0,'The pending stop barrier survives Room reconstruction.');assert.equal(recovered.alarm,null);
    assert.equal((await stub.chatFixture({eventId:'stop-failed',channelId:'123',at:detectedAt+17000,kind:'message',userId:'555',text:'clue'})).status,503);
    assert.equal((await stub.operatorFixture(false,1)).status,200);
    const stopped=await stub.inspectFixture();assert.equal(stopped.history,0);assert.equal(stopped.phase,'idle');assert.equal(stopped.outbox,0);
  } finally {await mf.dispose();}
});


test('operator initial stop blocks existing Room alarms before Control first synchronizes',async()=>{
  const {mf,stub}=await runtime();
  try {
    await start(mf);
    const active=await stub.inspectFixture();
    const recovered=await stub.recoverAlarmAtFixture(active.round!.endsAt!+1000,true);
    assert.equal(recovered.history,0);assert.equal(recovered.alarm,null);
  } finally {await mf.dispose();}
});


test('operator initial migration guard permits newly admitted rooms and later reconstruction',async()=>{
  const {mf,stub}=await runtime({EDGE_OPERATOR_INITIAL_ENABLED:'false'});
  try {
    const studio=await connectedStudio(mf);
    assert.ok(studio);
    await stub.recoverFixture();
    assert.equal((await stub.recoverChatFixture({eventId:'new-room',channelId:'123',at:Date.now(),kind:'message',userId:'555',text:'clue'})).status,200);
  } finally {await mf.dispose();}
});

test('operator uninitialized room rejects a stale enable after a higher failed stop',async()=>{
  const {mf,stub}=await runtime({},false);
  try {
    assert.equal((await stub.operatorFixture(false,3,true)).status,503);
    assert.equal((await stub.operatorFixture(true,2)).status,200);
    assert.equal(await stub.bootstrapFixture(),503);
    assert.equal((await stub.recoverChatFixture({eventId:'uninitialized',channelId:'123',at:Date.now(),kind:'message',userId:'555',text:'clue'})).status,503);
    assert.equal((await stub.operatorFixture(false,3)).status,200);
    assert.equal((await stub.operatorFixture(true,4)).status,200);
    assert.equal(await stub.bootstrapFixture(),200);
  } finally {await mf.dispose();}
});

test('recording take restart is owner-only, revision-fenced and keeps the microphone while dropping stale round inputs', {timeout:15_000}, async () => {
  const {mf, stub} = await runtime();
  try {
    let snapshot = await state(mf);
    await send(mf, {type:'settings',settings:{...snapshot.room.settings,recordingMode:true,difficulty:'hard',mission:'three',callBait:false}}, snapshot.revision);
    await start(mf);
    snapshot = await state(mf);
    const takeId = snapshot.room.recording!.takeId;
    const before = await stub.inspectFixture();
    assert.equal((await state(mf,'viewer')).room.round!.target,'banana');
    assert.equal(snapshot.room.round!.target,undefined);
    assert.equal(snapshot.room.round!.difficulty,'easy');
    assert.equal(snapshot.room.round!.guessEnabled,true);
    assert.equal(snapshot.room.mission,null);
    const sendRaw = async (role:Parameters<typeof token>[0], action:Command['action'], revision:number) => {
      const response = await mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',headers:{origin:ORIGIN,
        authorization:`Bearer ${await fixtureToken(mf,role)}`,'content-type':'application/json'},
        body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:revision,action})});
      return {status:response.status,body:await response.json() as Receipt};
    };
    for (const role of ['viewer','overlay','broadcaster'] as const) {
      const rejected=await sendRaw(role,{type:'restart-take',takeId},snapshot.revision);
      assert.equal(rejected.status,403);
    }
    await send(mf,{type:'pause',roundId:before.round!.id,epoch:before.round!.epoch},snapshot.revision);
    const stale=await sendRaw('studio',{type:'restart-take',takeId},snapshot.revision);
    assert.equal(stale.status,409); assert.equal(stale.body.code,'stale_revision');
    snapshot=await state(mf);
    await send(mf,{type:'restart-take',takeId},snapshot.revision);
    const reset=await state(mf), inspect=await stub.inspectFixture();
    assert.equal(reset.room.phase,'idle'); assert.equal(reset.room.round,null); assert.equal(reset.room.nextAt,null);
    assert.deepEqual(reset.room.score,{wins:0,played:0,streak:0,best:0});
    assert.notEqual(reset.room.recording!.takeId,takeId);
    assert.deepEqual(inspect.lease,before.lease); assert.equal(inspect.mic,'listening');
    const duplicate=await sendRaw('studio',{type:'restart-take',takeId},reset.revision);
    assert.equal(duplicate.status,409); assert.equal(duplicate.body.code,'action_unavailable');
    await send(mf,{type:'start'},reset.revision);
    const fresh=await state(mf);
    assert.equal(fresh.room.round!.number,1);
    assert.notEqual(fresh.room.round!.id,before.round!.id);
    assert.equal((await state(mf,'viewer')).room.round!.target,'banana');
    const oldGuess=await sendRaw('studio',{type:'guess',roundId:before.round!.id,epoch:before.round!.epoch,text:'banana'},fresh.revision);
    assert.equal(oldGuess.status,409);
    await stub.ownerMessageAtFixture(await stub.clockFixture(),{type:'speech-audio',leaseId:before.lease!.id,
      roundId:before.round!.id,epoch:before.round!.epoch,samples:512});
    const recovered=await stub.recoverFixture();
    assert.equal(recovered.round!.id,fresh.room.round!.id);
    assert.equal(recovered.mic,'listening'); assert.equal(recovered.history,0);
    assert.equal((await state(mf)).room.recording!.takeId,reset.room.recording!.takeId);
  } finally {await mf.dispose();}
});


test('recording reset ignores delayed EventSub moderator commands from the previous take', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    let snapshot=await state(mf);
    await send(mf,{type:'settings',settings:{...snapshot.room.settings,recordingMode:true,modCommands:true}},snapshot.revision);
    await start(mf);
    const at=await stub.clockFixture();
    await stub.freezeAtFixture(at+1000);
    snapshot=await state(mf);
    await send(mf,{type:'restart-take',takeId:snapshot.room.recording!.takeId},snapshot.revision);
    const event={eventId:randomUUID(),messageId:randomUUID(),channelId:'123',userId:'456',name:'Moderator',badges:['moderator'],kind:'message',text:'!bait start',at};
    const ignored=await stub.chatFixture(event);
    assert.equal(ignored.status,200); assert.equal(ignored.body.reason,'previous_take');
    assert.equal((await state(mf)).room.phase,'idle');
    await stub.freezeAtFixture(at+1001);
    const fresh=await stub.chatFixture({...event,eventId:randomUUID(),messageId:randomUUID(),at:at+1001});
    assert.equal(fresh.status,200);
    assert.equal((await state(mf)).room.phase,'active');
    assert.equal((await state(mf,'viewer')).room.round!.target,'banana');
  } finally {await mf.dispose();}
});


test('a deferred recording reset is an outbox barrier without blocking gameplay or spinning alarms', {timeout:15_000}, async () => {
  const {mf,stub}=await runtime();
  try {
    const namespace=await mf.getDurableObjectNamespace('CONTROL');
    const control=namespace.get(namespace.idFromName('control-v1')) as unknown as {
      deliveryFixture(status:number):Promise<void>;
      deliveredEventsFixture():Promise<{type:string;status:number}[]>;
    };
    const at=Date.now()+30_000;
    await stub.freezeAtFixture(at);
    await control.deliveryFixture(503);
    let snapshot=await state(mf);
    await send(mf,{type:'settings',settings:{...snapshot.room.settings,recordingMode:true}},snapshot.revision);
    await stub.flushOutboxAtFixture(at);
    assert.deepEqual(await control.deliveredEventsFixture(),[{type:'recording-reset',status:503}]);
    // Gameplay commands remain available while announcements wait for Control.
    await start(mf);
    snapshot=await state(mf);
    assert.equal(snapshot.room.phase,'active');
    assert.equal((await state(mf,'viewer')).room.round!.target,'banana');
    await send(mf,{type:'pause',roundId:snapshot.room.round!.id,epoch:snapshot.room.round!.epoch},snapshot.revision);
    await control.deliveryFixture(200);
    const blocked=await stub.flushOutboxAtFixture(at+1);
    assert.equal(blocked.phase,'paused'); assert.ok(blocked.outbox>=3);
    assert.equal(blocked.alarm,at+15_000,'Due events behind the reset must not schedule immediate repeated alarms.');
    assert.deepEqual(await control.deliveredEventsFixture(),[{type:'recording-reset',status:503}]);
    await stub.flushOutboxAtFixture(at+15_000);
    assert.deepEqual(await control.deliveredEventsFixture(),[
      {type:'recording-reset',status:503},{type:'recording-reset',status:200},
    ]);
    const drained=await stub.flushOutboxAtFixture(at+15_001);
    const events=await control.deliveredEventsFixture();
    assert.deepEqual(events.slice(2),[
      {type:'bot-settings',status:200},{type:'start',status:200},{type:'pause',status:200},
    ]);
    assert.equal(drained.outbox,0);
    assert.equal(drained.phase,'paused');
  } finally {await mf.dispose();}
});


test('voice drafts require the owner microphone and stay fenced to the latest live round', async () => {
  const {mf,stub}=await runtime();
  try {
    const ws=await connectedStudio(mf);let snap=await state(mf);
    await send(mf,{type:'settings',settings:{...snap.room.settings,callBait:true}},snap.revision);
    snap=await state(mf);await send(mf,{type:'microphone',armed:true,leaseId:randomUUID()},snap.revision);
    snap=await state(mf);await send(mf,{type:'start'},snap.revision);snap=await state(mf);
    const r=snap.room.round!,draftId=randomUUID();
    const action:Command['action']={type:'voice-guess-draft',roundId:r.id,epoch:r.epoch,text:'banana',draftId,expiresAt:await stub.clockFixture()+15000};
    const attempt=async(action:Command['action'],role:Parameters<typeof token>[0]='studio')=>mf.dispatchFetch(await endpoint(mf,'commands'),{method:'POST',
      headers:{origin:ORIGIN,authorization:`Bearer ${await fixtureToken(mf,role)}`,'content-type':'application/json'},
      body:JSON.stringify({id:randomUUID(),generation:1,expectedRevision:(await state(mf)).revision,action})});
    assert.equal((await attempt(action,'viewer')).status,403);
    assert.equal((await attempt({...action,epoch:r.epoch+1})).status,409);
    assert.equal((await attempt({...action,text:'two words'})).status,409);
    assert.equal((await attempt({...action,expiresAt:await stub.clockFixture()-1})).status,409);
    assert.equal((await attempt({...action,expiresAt:await stub.clockFixture()+60000})).status,409);
    assert.equal((await attempt(action)).status,200);
    assert.equal(await stub.voiceDraftCurrentFixture({draftId}),true);
    const queued=(await stub.inspectFixture()).outbox;
    assert.equal((await attempt({...action,text:'different'})).status,200);
    assert.equal((await stub.inspectFixture()).outbox,queued,'Same draft UUID cannot enqueue again.');
    const newer=randomUUID();assert.equal((await attempt({...action,draftId:newer,text:'fish'})).status,200);
    assert.equal(await stub.voiceDraftCurrentFixture({draftId}),false);
    assert.equal(await stub.voiceDraftCurrentFixture({draftId:newer}),true);
    await send(mf,{type:'pause',roundId:r.id,epoch:r.epoch},(await state(mf)).revision);
    assert.equal(await stub.voiceDraftCurrentFixture({draftId:newer}),false);
    assert.equal((await attempt({...action,draftId:randomUUID()})).status,409);
    let paused=await state(mf);
    await send(mf,{type:'resume',roundId:r.id,epoch:paused.room.round!.epoch},paused.revision);
    paused=await state(mf);
    const third={...action,epoch:paused.room.round!.epoch,draftId:randomUUID()};
    assert.equal((await attempt(third)).status,200);
    assert.equal((await attempt({...third,draftId:randomUUID()})).status,409,'Three draft limit survives an epoch change.');
    await send(mf,{type:'guess',roundId:r.id,epoch:third.epoch,text:'nottherealword'},(await state(mf)).revision);
    assert.equal(await stub.voiceDraftCurrentFixture({draftId:third.draftId}),false,'Lock-in retires an unpublished draft.');
    assert.equal((await state(mf)).room.history.some(row=>JSON.stringify(row).includes('banana')),false);
    ws.close();
  } finally {await mf.dispose();}
});
