import { DurableObject } from 'cloudflare:workers';
import { BOT_REPLY_COOLDOWN_MS, MOD_COMMANDS, parseCommand } from '../../app/server/chat-copy.js';
import { isBotReplyCommand, type BotReplyCommand } from './chat-commands.js';
import { CardLibraryError, Game, defaults, type GameEvent } from '@baited/game-core';
import { CardLibrary } from '../../app/server/card-library-core.js';
import { archiveInputSchema, selectInputSchema } from '../../app/shared/card-library.js';
import { authenticateRequest, identityIsCurrent, type AuthIdentity, type AuthEnv } from './auth.js';
import { serveApprovedArt, type ApprovedArt } from './art.js';
import { CARD_REQUEST_BYTES, commandSchema, fingerprint, json, LIMITS, PROTOCOL_VERSION, readBounded, type Command, type Receipt } from './protocol.js';
import { RoomStore } from './state-store.js';
import { pilotLimits } from './pilot-policy.js';
import { localTranscript, progressSchema } from '../../app/shared/local-speech.js';
import { z, ZodError } from 'zod';
import type { ControlEnv } from './control-types.js';
import { internalFetch } from './internal-fetch.js';
import { voiceDraftCurrent, voiceDraftWord, VOICE_DRAFT_TTL, type VoiceDraftState, type VoiceDraftRef } from '../../app/server/voice-draft.js';

export interface Env extends AuthEnv, ControlEnv { ROOMS: DurableObjectNamespace; ART: R2Bucket; CONTROL?: DurableObjectNamespace; ASSETS?: Fetcher }
interface Speech { leaseId: string; roundId: string; epoch: number; samples: number; firstAudioAt: number; lastAudioAt: number; lastSequence: number }
type PilotEvent=GameEvent|{type:'bot-settings'}|{type:'chat-command';command:BotReplyCommand;userId:string}|({type:'voice-guess-draft';word:string}&VoiceDraftRef);
interface Attachment { identity: AuthIdentity; lastInputAt: number; lastAuthRefreshAt?:number; sentViewRevision?:number; socketId?: string; microphoneLeases?:string[]; speech?: Speech; inputs?: {at:number;n:number}; audioInputs?:{at:number;tokens:number} }
interface Lease { id:string; sessionId:string; socketId:string; expiresAt:number; lastAudioAt?:number; roundId?:string; epoch?:number }
interface PilotState { operator?:{enabled:boolean;revision:number}; lease:Lease|null; microphoneStopRevision?:number; rates:Record<string,{at:number;n:number}>; chatConnected:boolean; connectionRevision?:number; viewRevisions?:Partial<Record<AuthIdentity['role'],number>>; botReplies?:{channelAt:number;users:Record<string,number>}; voiceDraft?:VoiceDraftState; voiceDraftLease?:string }
const AUDIO_LEASE_REFRESH_MS=10_000;
const eventSchema = z.object({eventId:z.string().min(1).max(200),channelId:z.string().regex(/^[1-9][0-9]{0,24}$/),
  at:z.number().finite(),kind:z.enum(['message','delete','clear-user']),messageId:z.string().min(1).max(200).optional(),
  userId:z.string().regex(/^[1-9][0-9]{0,24}$/),name:z.string().max(40).optional(),text:z.string().max(2000).optional(),
  badges:z.array(z.string().max(40)).max(100).optional()});

/** One channel, one writer. Only the gateway holds a namespace binding. */
export class ChannelRoom extends DurableObject<Env> {
  private store: RoomStore;
  private cards: CardLibrary;
  private cardsLoaded = false;
  private game: Game | null = null;
  private channel = '';
  private revision = 0;
  private generation = 1;
  private now = Date.now();
  private projections = new Map<AuthIdentity['role'], ReturnType<Game['view']>>();
  private receiptAt: number | null;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private operatorPendingRevision = 0;
  private operatorBlocked() { return this.pilotState.operator?.enabled===false || this.operatorPendingRevision>(this.pilotState.operator?.revision??0); }
  private pilotState: PilotState = {lease:null,rates:{},chatConnected:false};
  private events = new WeakMap<Game, {event:PilotEvent;safeView:ReturnType<Game['view']>}[]>();
  private pilot() { return this.env.EDGE_PILOT_ENABLED === 'true'; }
  private openSockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN); }
  private leaseValid() {
    const lease=this.pilotState.lease;
    return !!lease && lease.expiresAt>this.now && this.openSockets().some(ws => {
      const a=this.attachment(ws); return a?.socketId===lease.socketId && a.identity.sessionId===lease.sessionId && this.current(a.identity);
    });
  }
  private takeRate(state: PilotState, key:string, max:number): boolean {
    const at=Math.floor(this.now/60_000)*60_000;
    for(const [name,bucket] of Object.entries(state.rates)) if(bucket.at!==at) delete state.rates[name];
    if(!state.rates[key] && Object.keys(state.rates).length>=(key.includes(':viewer:')?512:1024)) return false;
    const bucket=state.rates[key]?.at===at ? state.rates[key]! : {at,n:0};
    if (bucket.n>=max) return false;
    bucket.n++;state.rates[key]=bucket;return true;
  }
  private actorRate(identity:AuthIdentity, kind:string) { return `${kind}:${identity.role}:${identity.subject}`; }
  private writePilot(state=this.pilotState) {
    this.ctx.storage.sql.exec('INSERT INTO pilot_state(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',JSON.stringify(state));
  }
  private async control(path:string, body:unknown): Promise<Response> {
    if (!this.env.CONTROL) throw new Error('Control unavailable.');
    return internalFetch(this.env.CONTROL.get(this.env.CONTROL.idFromName('control-v1')),new Request(`https://control.internal${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
  }
  private outboxResetBarrier() {
    return this.ctx.storage.sql.exec<{id:string;body:string;retry_at:number}>(
      "SELECT id,body,retry_at FROM pilot_outbox WHERE json_extract(body,'$.event.type')='recording-reset' ORDER BY rowid LIMIT 1",
    ).toArray()[0];
  }
  private async flushOutbox() {
    if (!this.pilot() || this.operatorBlocked()) return;
    const rows=await this.serial(async()=>{
      this.ctx.storage.sql.exec('DELETE FROM pilot_outbox WHERE expires_at<=?',Date.now());
      // A reset must reach Control before any later event, including while its
      // first delivery is backing off. Only announcements wait; gameplay does not.
      const barrier=this.outboxResetBarrier();
      if(barrier) return barrier.retry_at<=Date.now()?[barrier]:[];
      return this.ctx.storage.sql.exec<{id:string;body:string}>('SELECT id,body FROM pilot_outbox WHERE retry_at<=? ORDER BY rowid LIMIT 8',Date.now()).toArray();
    });
    for (const row of rows) {
      if(this.operatorBlocked()) return;
      // A recording reset may retire rows while a previous delivery awaits Control.
      if(!await this.serial(async()=>this.ctx.storage.sql.exec('SELECT id FROM pilot_outbox WHERE id=?',row.id).toArray().length>0)) continue;
      try {
        const response=await this.control('/internal/room-event',JSON.parse(row.body));
        // Authorization/validation failures cannot recover by replaying this old
        // announcement. A rate limit or temporary outage can, within its TTL.
        if (!response.ok && !(response.status>=400 && response.status<500 && response.status!==429)) throw new Error('Delivery deferred.');
        await this.serial(async()=>{this.ctx.storage.sql.exec('DELETE FROM pilot_outbox WHERE id=?',row.id);});
      } catch { await this.serial(async()=>{this.ctx.storage.sql.exec('UPDATE pilot_outbox SET retry_at=? WHERE id=?',Date.now()+15_000,row.id);}); }
    }
  }

  // Serialize complete operations across async body/digest/R2/storage work. This
  // bounded queue is idle between events and does not keep a sleeping room alive.
  private async serial<T>(operation: () => Promise<T>): Promise<T> {
    if (this.pending >= LIMITS.pendingOperations) throw new Error('room_busy');
    this.pending++;
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    try { return await result; } finally { this.pending--; }
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = new RoomStore(ctx.storage.sql);
    this.cards = new CardLibrary({ read: async () => this.store.cardLibrary(), write: async (body) => this.store.saveCardLibrary(body) });
    // A library that cannot be read keeps rounds on the built-in deck and Cards closed; it is never overwritten.
    void ctx.blockConcurrencyWhile(async () => {
      try { await this.cards.load(); this.cardsLoaded = true; } catch { this.cardsLoaded = false; }
    });
    if (this.pilot() || env.EDGE_OPERATOR_KEY) {
      pilotLimits(env);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS pilot_state(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS pilot_operator_intent(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS pilot_chat_receipt(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS pilot_chat_expiry ON pilot_chat_receipt(expires);
        CREATE TABLE IF NOT EXISTS pilot_outbox(id TEXT PRIMARY KEY,body TEXT NOT NULL,retry_at INTEGER NOT NULL,expires_at INTEGER NOT NULL DEFAULT 0);`);
      const columns=ctx.storage.sql.exec<{name:string}>('PRAGMA table_info(pilot_outbox)').toArray();
      if(!columns.some(column=>column.name==='expires_at')) ctx.storage.sql.exec('ALTER TABLE pilot_outbox ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0');
      ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS pilot_outbox_retry ON pilot_outbox(retry_at); CREATE INDEX IF NOT EXISTS pilot_outbox_expiry ON pilot_outbox(expires_at)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pilot_counts(id INTEGER PRIMARY KEY CHECK(id=1),chat INTEGER NOT NULL)');
      if(!ctx.storage.sql.exec('SELECT id FROM pilot_counts WHERE id=1').toArray().length)
        ctx.storage.sql.exec('INSERT INTO pilot_counts(id,chat) SELECT 1,count(*) FROM pilot_chat_receipt');
      ctx.storage.sql.exec(`
        CREATE TRIGGER IF NOT EXISTS pilot_chat_insert AFTER INSERT ON pilot_chat_receipt BEGIN UPDATE pilot_counts SET chat=chat+1 WHERE id=1; END;
        CREATE TRIGGER IF NOT EXISTS pilot_chat_delete AFTER DELETE ON pilot_chat_receipt BEGIN UPDATE pilot_counts SET chat=chat-1 WHERE id=1; END;`);
      const row=ctx.storage.sql.exec<{body:string}>('SELECT body FROM pilot_state WHERE id=1').toArray()[0];
      if (row) this.pilotState=JSON.parse(row.body);
      this.operatorPendingRevision=ctx.storage.sql.exec<{revision:number}>('SELECT revision FROM pilot_operator_intent WHERE id=1').toArray()[0]?.revision??0;
    }
    const meta = this.store.metadata(); const checkpoint = this.store.load();
    if (Boolean(meta) !== Boolean(checkpoint)) throw new Error('Inconsistent room checkpoint.');
    if(this.pilot() || env.EDGE_OPERATOR_KEY) {
      // Brand-new rooms are admitted only through Control. Mark them explicitly
      // so a later restart cannot mistake them for an unguarded legacy room.
      if(!meta && !this.pilotState.operator) this.pilotState.operator={enabled:true,revision:0};
      if(meta && !this.pilotState.operator && env.EDGE_OPERATOR_INITIAL_ENABLED==='false') this.operatorPendingRevision=Math.max(1,this.operatorPendingRevision);
    }
    if (meta && checkpoint) {
      this.channel = meta.channel; this.revision = meta.revision; this.generation = meta.generation;
      this.game = this.bind(Game.restore(checkpoint, () => this.now));
      if (this.game.data.owner !== this.channel) throw new Error('Room owner mismatch.');
    }
    this.receiptAt = this.store.receiptDeadline();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private bind(game: Game): Game {
    game.canRun = () => this.pilot() && game.mic==='listening' && this.pilotState.chatConnected && this.leaseValid();
    game.artFor = () => undefined; // The edge does not serve card artwork yet.
    const builtin = game.deckFor;
    game.deckFor = (difficulty) => this.cardsLoaded ? this.cards.resolve(game.data.owner, difficulty) : builtin(difficulty);
    const events: {event:PilotEvent;safeView:ReturnType<Game['view']>}[]=[];
    this.events.set(game,events);
    game.onEvent=(event) => events.push({event,safeView:game.view('overlay')});
    return game;
  }
  private fresh(channel: string, login = `poc-${channel}`): Game {
    return this.bind(new Game({ id: `edge-${channel}`, owner: channel, channel: login,
      mode: this.pilot() ? 'twitch' : 'demo', overlayKey: 'not-an-overlay-capability', settings: { ...defaults, auto: false, chatBot: this.pilot() },
      history: [], priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {} }, () => this.now));
  }
  private current(identity: AuthIdentity): boolean {
    return identityIsCurrent(identity, this.channel, this.generation, this.now);
  }
  private snapshot(role: AuthIdentity['role']) {
    let view = this.projections.get(role);
    if (!view && this.game) { view = this.game.view(role); this.projections.set(role, view); }
    return { type: 'snapshot', protocol: PROTOCOL_VERSION, revision: this.revision,
      ...(role === 'studio' ? { awardBoard: this.game?.awardBoard ?? null, deck: this.deck() } : {}),
      generation: this.generation, room: view ? { ...view, serverTime: this.now,
        mission: view.mission && view.mission.endsAt !== null
          ? { ...view.mission, remaining: Math.max(0, view.mission.endsAt - this.now) } : view.mission,
        round: view.round && view.phase === 'active' && view.round.endsAt !== null
          ? { ...view.round, remaining: Math.max(0, view.round.endsAt - this.now) } : view.round } : null };
  }
  private deck() {
    return this.game && this.cardsLoaded ? this.cards.selected(this.game.data.owner, this.game.data.settings.difficulty) : undefined;
  }
  /** Studio's card library. Only the gateway reaches it, after Control checked the session and, for changes, the CSRF token. */
  private async cardRoute(request: Request, path: string): Promise<Response> {
    const channelId = request.headers.get('x-edge-channel-id') ?? '';
    if (!/^[1-9][0-9]{0,24}$/.test(channelId) || (this.channel && this.channel !== channelId)) return json({error:'Access denied.'},403);
    if (!this.cardsLoaded) return json({error:'Your card library is unavailable right now. Rounds use the built-in deck.'},503);
    await this.reconcile();
    const difficulty = this.game?.data.settings.difficulty ?? defaults.difficulty;
    const view = (extra: Record<string, unknown> = {}) => json({ ...this.cards.view(channelId, difficulty), ...extra });
    try {
      if (path === '/internal/cards' && request.method === 'GET') return view();
      if (request.method !== 'POST') return json({error:'Not found.'},404);
      const body: unknown = JSON.parse(await readBounded(request, CARD_REQUEST_BYTES));
      let savedPackId: string | undefined;
      if (path === '/internal/cards/pack') savedPackId = await this.cards.savePack(channelId, body);
      else if (path === '/internal/cards/archive') {
        const input = archiveInputSchema.parse(body);
        await this.cards.archive(channelId, input.id, input.expectedRevision);
      } else if (path === '/internal/cards/select') {
        const input = selectInputSchema.parse(body);
        await this.cards.select(channelId, { mode: input.mode, packId: input.mode === 'builtin' ? null : input.packId ?? null }, input.expectedRevision, difficulty);
      } else return json({error:'Not found.'},404);
      // Studio's next-round summary changes with the deck, not with the game revision.
      this.broadcast();
      return view(savedPackId ? { savedPackId } : {});
    } catch (error) {
      if (error instanceof CardLibraryError) return json({ error: error.message }, error.status);
      if (error instanceof ZodError) return json({ error: 'Check the highlighted card details.',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }, 400);
      if (error instanceof SyntaxError) return json({ error: 'Use a valid JSON request.' }, 400);
      if (error instanceof Error && error.message === 'body_size') return json({ error: 'This pack is too large to save.' }, 413);
      throw error;
    }
  }
  private attachment(ws: WebSocket): Attachment | null {
    try { return ws.deserializeAttachment() as Attachment | null; } catch { return null; }
  }
  private closeStale(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (!att || !this.current(att.identity)) ws.close(1008, 'Authorization expired. Reconnect.');
    }
  }
  private broadcast(): void {
    this.now = Date.now();
    const frames = new Map<AuthIdentity['role'], string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (!att || !this.current(att.identity)) { ws.close(1008, 'Authorization expired. Reconnect.'); continue; }
      if (ws.readyState !== WebSocket.OPEN) continue;
      const viewRevision=this.pilotState.viewRevisions?.[att.identity.role]??this.revision;
      if(this.pilot() && att.identity.role!=='studio' && att.sentViewRevision===viewRevision) continue;
      let frame = frames.get(att.identity.role);
      if (!frame) { frame = JSON.stringify(this.snapshot(att.identity.role)); frames.set(att.identity.role, frame); }
      try { ws.send(frame);att.sentViewRevision=viewRevision;ws.serializeAttachment(att); } catch { ws.close(1013, 'Reconnect to catch up.'); }
    }
  }
  private async commit(candidate: Game, nextRevision: number, nextGeneration: number,
    receipt?: { key: string; hash: string; body: Receipt }, pilotState = this.pilotState, chatId?:string): Promise<void> {
    let records!: Map<string,string>;
    if(this.pilot() || pilotState.operator) {
      // A new private clue changes Studio's award board, not the spectator card.
      // Compare role projections at one clock value and retain small durable
      // delivery revisions so hibernation does not turn every hint into fanout.
      pilotState={...pilotState,viewRevisions:{...this.pilotState.viewRevisions,studio:nextRevision}};
      for(const role of ['viewer','overlay'] as const) {
        const before=this.game?.view(role),after=candidate.view(role);
        if(!before || JSON.stringify(before)!==JSON.stringify(after)) pilotState.viewRevisions![role]=nextRevision;
      }
    }
    await this.ctx.storage.transaction(async () => {
      this.store.prune(this.now);
      records = this.store.save(candidate.checkpoint(), candidate.data.owner, nextRevision, nextGeneration);
      if (receipt) this.store.record(receipt.key, receipt.hash, receipt.body, this.now);
      if (this.pilot() || pilotState.operator) {
        this.writePilot(pilotState);
        if(pilotState.operator && pilotState.operator.revision!==this.pilotState.operator?.revision) {
          this.ctx.storage.sql.exec('DELETE FROM pilot_outbox');
          this.ctx.storage.sql.exec('DELETE FROM pilot_operator_intent WHERE revision<=?',pilotState.operator.revision);
        }
        this.ctx.storage.sql.exec('DELETE FROM pilot_chat_receipt WHERE expires<=?',this.now);
        if (chatId) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO pilot_chat_receipt(id,expires) VALUES(?,?)',chatId,this.now+600_000);
        const pending=this.events.get(candidate)??[];
        // Retain only bounded IDs for retry suppression, never draft text in game history.
        // Any phase/epoch/guess change retires a queued public draft immediately.
        if((this.pilotState.voiceDraft?.latest.expiresAt??0)>this.now) for (const row of this.ctx.storage.sql.exec<{id:string;body:string}>("SELECT id,body FROM pilot_outbox WHERE json_extract(body,'$.event.type')='voice-guess-draft'")) {
          const event=JSON.parse(row.body).event as VoiceDraftRef;
          if(!voiceDraftCurrent(candidate,pilotState.voiceDraft,event,this.now) || !candidate.data.settings.chatBot || !pilotState.chatConnected)
            this.ctx.storage.sql.exec('DELETE FROM pilot_outbox WHERE id=?',row.id);
        }
        if(pending.some(item=>item.event.type==='recording-reset')) this.ctx.storage.sql.exec('DELETE FROM pilot_outbox');
        if (pending.length && (candidate.data.settings.chatBot || pending.some(item=>item.event.type==='bot-settings' || item.event.type==='recording-reset'))) {
          const count=this.ctx.storage.sql.exec<{n:number}>('SELECT count(*) AS n FROM pilot_outbox').one().n;
          // Announcements are best-effort and bounded; never hold gameplay hostage to a chat outage.
          for (const [i,item] of pending.entries()) if (count+i<32) {
            const eventId=`${candidate.data.owner}:${nextRevision}:${i}`;
            this.ctx.storage.sql.exec('INSERT OR IGNORE INTO pilot_outbox(id,body,retry_at,expires_at) VALUES(?,?,?,?)',eventId,
              JSON.stringify({channelId:candidate.data.owner,eventId,...item}),this.now,item.event.type==='voice-guess-draft'?item.event.expiresAt:this.now+60_000);
          }
        }
      }
      // SQL, receipt and alarm commit together. A crash cannot leave an accepted
      // round without a wake-up; a failed alarm write rolls back the command.
      await this.schedule(candidate, nextGeneration, this.store.receiptDeadline(), pilotState);
    });
    // Publish in-memory state only after the transaction commits. An exception
    // leaves both the durable state and the live authoritative Game untouched.
    const newLease=pilotState.lease && pilotState.lease.id!==this.pilotState.lease?.id?pilotState.lease:null;
    this.store.committed(records); this.game = candidate; this.channel = candidate.data.owner;
    this.revision = nextRevision; this.generation = nextGeneration; this.pilotState = pilotState;
    if((pilotState.operator?.revision??0)>=this.operatorPendingRevision) this.operatorPendingRevision=0;
    this.receiptAt = this.store.receiptDeadline(); this.projections.clear();
    if(newLease) {
      for(const ws of this.openSockets()) {
        const att=this.attachment(ws);
        if(att?.socketId!==newLease.socketId || att.identity.sessionId!==newLease.sessionId) continue;
        // Keep only this socket's current and previous committed lease. Delayed
        // audio from a cancelled capture can then be ignored without admitting
        // another socket's microphone frames or closing the healthy Studio.
        att.microphoneLeases=[newLease.id,...(att.microphoneLeases??[])].slice(0,2);
        // A socket disappearing after the durable commit cannot roll back the
        // authoritative lease or leave the live state behind its checkpoint.
        try {ws.serializeAttachment(att);} catch {ws.close(1013,'Reconnect to catch up.');}
      }
    }
  }
  private speechDeadline(game=this.game,pilot=this.pilotState):number|null {
    const lease=pilot.lease;
    if (!lease || !game?.round || game.phase!=='active') return null;
    // The close callback can still read the final attachment even after the
    // socket stops being OPEN. Never rewind a played round to its first-audio grace.
    const a=this.ctx.getWebSockets().map(ws => this.attachment(ws)).find(a => a?.socketId===lease.socketId);
    const speech=a?.speech;
    return speech && speech.roundId===game.round?.id && speech.epoch===game.round.epoch
      ? speech.lastAudioAt+pilotLimits(this.env).speechGapMs
      : lease.roundId===game.round?.id && lease.epoch===game.round.epoch && lease.lastAudioAt
        ? lease.lastAudioAt+pilotLimits(this.env).speechGapMs : game.round!.segmentAt+5_000;
  }
  private async refreshAudioLease(lease:Lease,speech:Speech,receivedAt:number):Promise<void> {
    const lifetime=pilotLimits(this.env).microphoneLeaseMs;
    if(receivedAt<lease.expiresAt-lifetime+AUDIO_LEASE_REFRESH_MS) return;
    // Only validated, currently owned active audio reaches here. Its server
    // arrival time can keep capture alive when background UI timers throttle,
    // but queued audio cannot buy extra time at its later processing time.
    // Persist at the heartbeat cadence, never per audio frame; the 2.5s gap
    // remains independently enforced from the last accepted socket attachment.
    const next=structuredClone(this.pilotState);
    next.lease={...lease,expiresAt:receivedAt+lifetime,lastAudioAt:receivedAt,
      roundId:speech.roundId,epoch:speech.epoch};
    await this.ctx.storage.transaction(async()=>{
      this.writePilot(next);
      await this.schedule(this.game,this.generation,this.receiptAt,next);
    });
    this.pilotState=next;
  }
  private async reconcile(): Promise<void> {
    this.now = Date.now(); this.closeStale();
    if (!this.game || this.operatorBlocked()) return;
    const speechAt=this.pilot()?this.speechDeadline():null;
    const micLost=this.pilot() && this.pilotState.lease && (!this.leaseValid() || (speechAt!==null && speechAt<=this.now));
    const due = this.game.nextDeadline();
    if (!micLost && (due === null || due > this.now)) return;
    const candidate = this.bind(Game.restore(this.game.checkpoint(), () => this.now));
    const pilot=structuredClone(this.pilotState);
    if (micLost) {
      // If the round deadline preceded the lost mic, settle it first. Otherwise
      // pause before advancing so a disconnected browser cannot auto-play rounds.
      const lostAt=Math.min(pilot.lease!.expiresAt,speechAt??this.now);
      const wallNow=this.now;
      this.now=Math.min(lostAt,wallNow);
      try {candidate.advanceTo(this.now,LIMITS.maxTransitions);pilot.lease=null;candidate.mic='error';candidate.pauseIfActive();}
      finally {this.now=wallNow;}
    }
    candidate.advanceTo(this.now, LIMITS.maxTransitions);
    await this.commit(candidate, this.revision + 1, this.generation,undefined,pilot);
    if (micLost) for(const ws of this.openSockets()) if(this.attachment(ws)?.identity.canControl)
      ws.send(JSON.stringify({type:'speech-error',code:'mic_expired',message:'Microphone disconnected. Enable it again and resume.'}));
    this.broadcast();
  }
  protected async schedule(game = this.game, generation = this.generation, receiptAt = this.receiptAt, pilot=this.pilotState): Promise<void> {
    if(pilot.operator?.enabled===false || this.operatorPendingRevision>(pilot.operator?.revision??0)) {await this.ctx.storage.deleteAlarm();return;}
    const deadlines = [game?.nextDeadline() ?? null, receiptAt];
    if (this.pilot()) {
      if (pilot.lease) deadlines.push(pilot.lease.expiresAt,this.speechDeadline(game,pilot));
      const barrier=this.outboxResetBarrier();
      // Younger due rows behind a backed-off reset must not create a hot alarm loop.
      const outbox=barrier?.retry_at??this.ctx.storage.sql.exec<{at:number|null}>('SELECT min(retry_at) AS at FROM pilot_outbox').one().at;
      const outboxExpiry=this.ctx.storage.sql.exec<{at:number|null}>('SELECT min(expires_at) AS at FROM pilot_outbox').one().at;
      const chat=this.ctx.storage.sql.exec<{at:number|null}>('SELECT min(expires) AS at FROM pilot_chat_receipt').one().at;
      deadlines.push(outbox,outboxExpiry,chat);
    }
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (att && identityIsCurrent(att.identity, game?.data.owner ?? this.channel, generation, Date.now()) && ws.readyState === WebSocket.OPEN) deadlines.push(att.identity.expiresAt);
    }
    const valid = deadlines.filter((n): n is number => n !== null);
    const at = valid.length ? Math.max(Date.now() + 1, Math.min(...valid)) : null;
    const old = await this.ctx.storage.getAlarm();
    if (at === null) { if (old !== null) await this.ctx.storage.deleteAlarm(); }
    else if (old === null || old > at) await this.ctx.storage.setAlarm(at);
  }
  private authorizeCommand(identity: AuthIdentity, command: Command): boolean {
    if (identity.authKind === 'twitch-extension') return false;
    if (identity.authKind === 'pilot-session' && command.action.type.startsWith('fixture-')) return false;
    if (command.action.type === 'fixture-chat') return identity.role === 'viewer' && identity.stableIdentity;
    return identity.role === 'studio' && identity.canControl;
  }
  private dispatch(game: Game, identity: AuthIdentity, command: Command, pilot: PilotState): void {
    const a = command.action;
    if ('roundId' in a && a.type !== 'award' && game.round?.id !== a.roundId) throw new Error('stale_round');
    if ('epoch' in a && game.round?.epoch !== a.epoch) throw new Error('stale_epoch');
    switch (a.type) {
      case 'start':
        if (this.pilot() && (!pilot.chatConnected || !this.leaseValid())) throw new Error('stream_not_ready');
        game.begin();break;
      case 'connect':
      case 'disconnect': throw new Error('use_chat_control');
      case 'microphone': {
        if (!this.pilot() || identity.authKind!=='pilot-session' || !identity.sessionId) throw new Error('unsupported');
        const choices=this.openSockets().map(ws=>this.attachment(ws)).filter((item):item is Attachment=>item!==null && item.identity.sessionId===identity.sessionId && item.identity.canControl && this.current(item.identity));
        const socket=a.socketId?choices.find(item=>item.socketId===a.socketId):choices.length===1?choices[0]:undefined;
        if (!socket?.socketId) throw new Error('studio_not_connected');
        const old=pilot.lease;
        if (!a.armed) {
          if (old && (old.id!==a.leaseId || old.sessionId!==identity.sessionId)) throw new Error('lease_owner');
          // A canceled arm may still be in flight before it creates a lease.
          // One durable revision barrier retires all pre-cancel initial arms;
          // ordinary intervening chat revisions and exact-owner renewals remain valid.
          pilot.microphoneStopRevision=this.revision+1;
          pilot.lease=null;game.mic='off';game.pauseIfActive();break;
        }
        if (!a.renew && command.expectedRevision<(pilot.microphoneStopRevision??0)) throw new Error('lease_owner');
        if ((old && old.expiresAt>this.now && (old.id!==a.leaseId || old.sessionId!==identity.sessionId || old.socketId!==socket.socketId)) ||
          (a.renew && (!old || old.expiresAt<=this.now || old.id!==a.leaseId || old.sessionId!==identity.sessionId))) throw new Error('lease_owner');
        pilot.lease={id:a.leaseId,sessionId:identity.sessionId,socketId:socket.socketId,expiresAt:this.now+pilotLimits(this.env).microphoneLeaseMs,
          ...(socket.speech?{lastAudioAt:socket.speech.lastAudioAt,roundId:socket.speech.roundId,epoch:socket.speech.epoch}:{})};
        game.mic='listening';break;
      }
      case 'restart-take': game.restartTake(a.takeId); break;
      case 'reset-chaos-session': game.restartChaosSession(a.sessionId); break;
      case 'skip': game.end('skipped');break;
      case 'pause': game.pause(); break;
      case 'resume': if (this.pilot() && (!pilot.chatConnected || !this.leaseValid())) throw new Error('stream_not_ready');game.resume(); break;
      case 'end': game.end('ended'); break;
      case 'catch': game.decideCatch(a.roundId, a.decision); break;
      case 'reverse': game.reverse(); break;
      case 'award': game.award(a.roundId, a.hintId); break;
      case 'guess': game.guess(a.roundId, a.epoch, a.text); break;
      case 'voice-guess-draft': {
        if(!this.pilot() || identity.authKind!=='pilot-session' || !this.leaseValid() || pilot.lease?.sessionId!==identity.sessionId ||
          game.phase!=='active' || !game.round?.guessEnabled || game.round.guessUsed || !game.data.settings.chatBot || !pilot.chatConnected)
          throw new Error('voice_draft_unavailable');
        if(a.expiresAt<=this.now || a.expiresAt>this.now+VOICE_DRAFT_TTL) throw new Error('voice_draft_expired');
        const word=voiceDraftWord(a.text);
        if(pilot.voiceDraft?.roundId!==a.roundId) pilot.voiceDraft=undefined;
        if(pilot.voiceDraft?.ids.includes(a.draftId)) break;
        if((pilot.voiceDraft?.ids.length??0)>=3 || !this.takeRate(pilot,this.actorRate(identity,'voice-draft'),6)) throw new Error('voice_draft_limit');
        const ref={roundId:a.roundId,epoch:a.epoch,draftId:a.draftId,expiresAt:a.expiresAt};
        pilot.voiceDraft={roundId:a.roundId,ids:[...(pilot.voiceDraft?.ids??[]),a.draftId],latest:ref};
        pilot.voiceDraftLease=pilot.lease!.id;
        this.events.get(game)!.push({event:{type:'voice-guess-draft',word,...ref},safeView:game.view('overlay')});
        break;
      }
      case 'settings':
        if (!this.pilot() && (a.settings.auto || a.settings.chatBot || a.settings.modCommands)) throw new Error('poc_feature_disabled');
        game.update(a.settings);if(this.pilot())this.events.get(game)!.push({event:{type:'bot-settings'},safeView:game.view('overlay')}); break;
      case 'fixture-chat':
        // Scope fixture IDs to the authenticated actor, including safe object keys.
        game.chat(JSON.stringify([identity.subject, command.id]), `fixture:${identity.subject}`,
          identity.subject.slice(0, 40), a.text, this.now); break;
      case 'fixture-transcript':
        game.transcript({ id: command.id, roundId: a.roundId, epoch: a.epoch, text: a.text,
          capturedAt: this.now, final: true, confidence: 1 }, 'confirm'); break;
      case 'revoke-connections': break;
    }
  }
  private async apply(identity: AuthIdentity, command: Command, hash: string): Promise<{ status: number; body: Receipt }> {
    if (!this.authorizeCommand(identity, command)) return {status:403,body:{ok:false,code:'role',revision:this.revision,generation:this.generation}};
    const key = JSON.stringify([identity.subject, command.id]);
    const previous = this.store.receipt(key, this.now);
    if (previous) return previous.fingerprint === hash
      ? {status:200,body:JSON.parse(previous.body)}
      : {status:409,body:{ok:false,code:'id_conflict',revision:this.revision,generation:this.generation}};
    const acceptsOlderRevision=this.pilot() && !['start','settings','restart-take','reset-chaos-session','revoke-connections'].includes(command.action.type);
    if (command.generation !== this.generation || ((command.action.type === 'fixture-chat' || acceptsOlderRevision)
      ? command.expectedRevision > this.revision : command.expectedRevision !== this.revision))
      return {status:409,body:{ok:false,code:'stale_revision',revision:this.revision,generation:this.generation}};
    this.store.prune(this.now);
    if (this.store.receiptCount() >= LIMITS.receipts) return {status:429,body:{ok:false,code:'room_busy',revision:this.revision,generation:this.generation}};
    const candidate = this.game ? this.bind(Game.restore(this.game.checkpoint(), () => this.now)) : this.fresh(identity.channelId);
    if (!this.game && command.action.type !== 'start') return {status:409,body:{ok:false,code:'start_room_first',revision:0,generation:this.generation}};
    const pilot=structuredClone(this.pilotState);
    if (this.pilot() && !this.takeRate(pilot,this.actorRate(identity,'control'),pilotLimits(this.env).controlsPerMinute)) return {status:429,body:{ok:false,code:'rate_limit',revision:this.revision,generation:this.generation}};
    try { this.dispatch(candidate, identity, command, pilot); }
    catch (error) {
      const code=command.action.type==='microphone' && error instanceof Error &&
        (error.message==='lease_owner' || error.message==='studio_not_connected') ? error.message
        : error instanceof CardLibraryError ? 'deck_unplayable' : 'action_unavailable';
      return {status:409,body:{ok:false,code,revision:this.revision,generation:this.generation}};
    }
    const generation = this.generation + (command.action.type === 'revoke-connections' ? 1 : 0);
    const body: Receipt = {ok:true,revision:this.revision+1,generation};
    await this.commit(candidate, body.revision, generation, {key,hash,body},pilot);
    this.broadcast(); return {status:200,body};
  }
  async fetch(request: Request): Promise<Response> {
    if(this.pilot() && this.pending>=8) {
      try {if(JSON.parse(request.headers.get('x-edge-identity')??'null')?.role==='viewer') return json({error:'Please try again shortly.'},503);}catch{return json({error:'Access denied.'},403);}
    }
    try { return await this.serial(() => this.fetchRequest(request)); }
    catch { return json({error:'This test room is temporarily unavailable. Try again.'},503); }
  }
  private async fetchRequest(request: Request): Promise<Response> {
    const internalPath=new URL(request.url).pathname;
    if((this.pilot() || this.env.EDGE_OPERATOR_KEY) && ['/internal/operator','/internal/operator-status'].includes(internalPath)) return this.operatorRoom(request,internalPath);
    if(this.operatorBlocked()) return json({error:'The pilot is stopped.',code:'pilot_stopped'},503);
    if (this.pilot() && internalPath.startsWith('/internal/cards')) return this.cardRoute(request,internalPath);
    if (this.pilot() && internalPath.startsWith('/internal/')) return this.internal(request,internalPath);
    // Headers are freshly constructed by the gateway, never copied from callers.
    const identity = JSON.parse(request.headers.get('x-edge-identity') ?? 'null') as AuthIdentity | null;
    if (!identity) return json({error:'Access denied.'},403);
    if(this.pilot() && identity.role==='viewer' && !identity.stableIdentity) return json({error:'Sign into Twitch to join this pilot.'},401);
    await this.reconcile();
    if (this.channel && !this.current(identity)) return json({error:'Authorization changed. Reconnect.'},401);
    if (!identityIsCurrent(identity, identity.channelId, this.generation, this.now)) return json({error:'Authorization changed. Reconnect.'},401);
    const path = new URL(request.url).pathname;
    if (this.pilot() && !this.game) {
      const login=request.headers.get('x-edge-channel-login');
      if (!login || !/^[a-z0-9_]{1,25}$/.test(login)) return json({error:'Channel not connected.'},409);
      const game=this.fresh(identity.channelId,login);
      game.connection={status:this.pilotState.chatConnected?'connected':'offline',detail:'Twitch chat'};
      await this.commit(game,0,this.generation);
    }
    try {
      if (path === '/state' && request.method === 'GET') {
        if(this.pilot()) {const next=structuredClone(this.pilotState);if(!this.takeRate(next,this.actorRate(identity,'state'),pilotLimits(this.env).stateReadsPerMinute))return json({error:'Too many refreshes.'},429);this.ctx.storage.transactionSync(()=>this.writePilot(next));this.pilotState=next;}
        await this.schedule(); this.now = Date.now();
        if (!identityIsCurrent(identity, identity.channelId, this.generation, this.now))
          return json({error:'Authorization expired. Reconnect.'},401);
        return json(this.snapshot(identity.role),this.game?200:404);
      }
      if (path === '/commands' && request.method === 'POST') {
        const command = commandSchema.parse(JSON.parse(await readBounded(request)));
        const hash = await fingerprint(JSON.stringify(command));
        // Body parsing/hashing awaited; another event may have changed the room.
        await this.reconcile();
        if (!identityIsCurrent(identity, identity.channelId, this.generation, this.now) || (this.channel && !this.current(identity))) return json({error:'Authorization changed. Reconnect.'},401);
        const result = await this.apply(identity,command,hash);
        await this.schedule(); return json({...result.body,snapshot:this.snapshot(identity.role)},result.status);
      }
      if (path === '/socket' && request.method === 'GET' && request.headers.get('upgrade') === 'websocket') {
        if (!this.game) return json({error:'Start the test room first.'},404);
        const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
        const max=this.pilot()?pilotLimits(this.env).viewerSockets+8:LIMITS.sockets;
        if ((this.pilot() && identity.role==='viewer' && sockets.filter(ws=>this.attachment(ws)?.identity.role==='viewer').length>=pilotLimits(this.env).viewerSockets) || sockets.length >= max || sockets.filter((ws) => this.attachment(ws)?.identity.subject === identity.subject).length >= LIMITS.socketsPerSubject)
          return json({error:'This test room has reached its connection limit.'},429);
        if (this.pilot()) {
          const next=structuredClone(this.pilotState);
          if (!this.takeRate(next,this.actorRate(identity,'join'),identity.role==='viewer'?12:pilotLimits(this.env).joinsPerMinute)) return json({error:'Too many reconnects. Try again shortly.'},429);
          this.ctx.storage.transactionSync(()=>this.writePilot(next));this.pilotState=next;
        }
        const pair = new WebSocketPair(); const [client,server] = Object.values(pair);
        const bound = {...identity,generation:this.generation};
        this.ctx.acceptWebSocket(server,[identity.role]);
        const socketId=crypto.randomUUID();
        server.serializeAttachment({identity:bound,lastInputAt:0,socketId,sentViewRevision:this.pilotState.viewRevisions?.[identity.role]??this.revision} satisfies Attachment);
        await this.schedule(); this.now = Date.now();
        if (!this.current(bound)) {
          server.close(1008,'Authorization expired. Reconnect.');
          return json({error:'Authorization expired. Reconnect.'},401);
        }
        server.send(JSON.stringify({...this.snapshot(identity.role),...(identity.canControl?{socketId}:{})}));
        return new Response(null,{status:101,webSocket:client,headers:{'sec-websocket-protocol':'baited.v1','cache-control':'no-store'}});
      }
      if (path.startsWith('/art/') && request.method === 'GET') {
        const bound = {...identity,generation:this.generation};
        return serveApprovedArt(request,bound,path.slice('/art/'.length),this.env.ART,async (who,id) => {
          await this.reconcile();
          if (!this.current(who) || who.role !== 'viewer' || !this.game?.round ||
            !['active','paused','settling'].includes(this.game.phase) || this.game.round.artId !== id) return null;
          return this.store.art(id) as ApprovedArt | null;
        });
      }
      return json({error:'Not found.'},404);
    } catch {
      // Do not echo bodies, tokens, private checkpoints, or schema diagnostics.
      return json({error:'The request could not be accepted.'},400);
    }
  }
  async webSocketMessage(ws: WebSocket,message: string | ArrayBuffer): Promise<void> {
    if(this.operatorBlocked()) {ws.close(1001,'Pilot stopped.');return;}
    const receivedAt=Date.now();
    let refresh:Record<string,unknown>|undefined;
    // Reject bad or excessive input before it occupies the room's mutation queue.
    // Viewers can request a snapshot or renew identity, never issue game commands.
    if(this.pilot()) {
      const att=this.attachment(ws),now=receivedAt;
      if(!att || !identityIsCurrent(att.identity,this.channel,this.generation,now)) {ws.close(1008,'Authorization expired. Reconnect.');return;}
      if(att.identity.role==='viewer' && this.pending>=8) {ws.close(1013,'Reconnect to catch up.');return;}
      if(typeof message!=='string' || new TextEncoder().encode(message).length>LIMITS.commandBytes) {ws.close(1009,'Message too large.');return;}
      let data:Record<string,unknown>|undefined;
      if(message!=='resync') {
        try {data=JSON.parse(message);if(!data || typeof data!=='object')throw new Error();}
        catch {ws.close(1008,'Invalid message.');return;}
        if(!att.identity.canControl && data.type!=='refresh-auth') {ws.close(1008,'Read-only connection.');return;}
      }
      const lease=this.pilotState.lease;
      const ownerAudio=data?.type==='speech-audio' && att.identity.canControl && lease && lease.expiresAt>now &&
        lease.sessionId===att.identity.sessionId && lease.socketId===att.socketId && lease.id===data.leaseId;
      if(ownerAudio) {
        // A brief uplink/browser stall batches otherwise valid 128ms progress
        // frames. Only the exact microphone owner gets a bounded catch-up burst;
        // sample-clock validation still runs on every admitted audio frame.
        const previous=att.audioInputs;
        const tokens=Math.min(48,(previous?.tokens??48)+Math.max(0,now-(previous?.at??now))*16/1000);
        if(tokens<1) {ws.close(1013,'Microphone backlog exceeded. Reconnect.');return;}
        att.audioInputs={at:now,tokens:tokens-1};
      } else {
        const window=Math.floor(now/1000),inputs=att.inputs?.at===window?att.inputs:{at:window,n:0};
        if(++inputs.n>(att.identity.canControl?16:4)) {ws.close(1008,'Too many messages.');return;}
        att.inputs=inputs;
      }
      if(data) {
        if(data.type==='refresh-auth') {
          if(att.lastAuthRefreshAt && now-att.lastAuthRefreshAt<30_000) {ws.close(1008,'Too many authorization refreshes.');return;}
          att.lastAuthRefreshAt=now;
          refresh=data;
        }
      }
      ws.serializeAttachment(att);
      if(refresh) {
        // Signature/admission work may await another object. It must not hold
        // the game queue while the owner continues sending microphone audio.
        try {await this.refreshAuth(ws,att,refresh);}
        catch {if(ws.readyState===WebSocket.OPEN)ws.close(1013,'Authorization temporarily unavailable. Reconnect.');}
        return;
      }
    }
    try { await this.serial(() => this.handleMessage(ws,message,receivedAt)); }
    catch { ws.close(1013,'Reconnect to catch up.'); }
  }
  private async handleMessage(ws: WebSocket,message: string | ArrayBuffer,receivedAt=Date.now()): Promise<void> {
    if(this.operatorBlocked()) {ws.close(1001,'Pilot stopped.');return;}
    await this.reconcile(); const att = this.attachment(ws);
    if (!att || !this.current(att.identity)) {ws.close(1008,'Authorization expired. Reconnect.');return;}
    if (typeof message !== 'string' || new TextEncoder().encode(message).length > LIMITS.commandBytes) {ws.close(1009,'Message too large.');return;}
    // Small per-connection input limit. It is not advertised as an account-wide quota.
    if (!this.pilot() && this.now-att.lastInputAt < 100) {ws.close(1008,'Too many messages.');return;}
    att.lastInputAt=this.now;ws.serializeAttachment(att);
    try {
      if (this.pilot()) {
        if(message!=='resync') {const data=JSON.parse(message);
          if(data.type==='speech-audio'||data.type==='speech-final') {await this.speech(ws,att,data,receivedAt);return;}
        }
      }
      if (message === 'resync') {
        if(this.pilot()) {const next=structuredClone(this.pilotState);if(!this.takeRate(next,this.actorRate(att.identity,'state'),pilotLimits(this.env).stateReadsPerMinute)){ws.close(1008,'Too many refreshes.');return;}this.ctx.storage.transactionSync(()=>this.writePilot(next));this.pilotState=next;}
        ws.send(JSON.stringify({...this.snapshot(att.identity.role),...(att.identity.canControl?{socketId:att.socketId}:{})}));await this.schedule();return;}
      const command=commandSchema.parse(JSON.parse(message)); const hash=await fingerprint(JSON.stringify(command));
      await this.reconcile();
      if (!this.current(att.identity)) {ws.close(1008,'Authorization changed. Reconnect.');return;}
      const result=await this.apply(att.identity,command,hash);
      if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'ack',id:command.id,...result.body}));
      await this.schedule();
    } catch {if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'error',code:'request_rejected'}));}
  }
  private async refreshAuth(ws:WebSocket, att:Attachment, data:unknown) {
    const parsed=z.object({type:z.literal('refresh-auth'),token:z.string().max(4096)}).strict().safeParse(data);
    if(!parsed.success) {ws.close(1008,'Invalid authorization.');return;}
    const origin=this.env.EDGE_PUBLIC_ORIGIN;
    if(!origin) {ws.close(1011,'Unavailable.');return;}
    const checked=await authenticateRequest(new Request(`${origin}/v1/rooms/${this.channel}/socket`,{headers:{
      origin,upgrade:'websocket','sec-websocket-protocol':`baited.v1, baited.auth.${parsed.data.token}`}}),this.env,this.channel);
    if(!checked.ok) {ws.close(1008,'Sign in again.');return;}
    const next=checked.identity;
    if(next.subject!==att.identity.subject || next.role!==att.identity.role || next.authKind!==att.identity.authKind || next.sessionId!==att.identity.sessionId) {
      ws.close(1008,'Identity changed. Reconnect.');return;
    }
    const check=await this.control('/internal/authorize',{channelId:this.channel,sessionId:next.sessionId,role:next.authKind==='twitch-extension'?'viewer':next.role});
    if(check.status===429 || check.status>=500) throw new Error('Admission temporarily unavailable.');
    const body=await check.json() as {allowed?:boolean};
    await this.serial(async()=>{
      await this.reconcile();
      if(ws.readyState!==WebSocket.OPEN) return;
      const current=this.attachment(ws);
      if(!check.ok || !body.allowed || !current || current.socketId!==att.socketId ||
        current.identity.expiresAt!==att.identity.expiresAt || !this.current(att.identity) ||
        !this.current(current.identity) || !identityIsCurrent(next,this.channel,this.generation,this.now)) {
        ws.close(1008,'Sign in again.');return;
      }
      // Preserve progress/input fields changed while admission was in flight.
      current.identity={...next,generation:this.generation};ws.serializeAttachment(current);
      ws.send(JSON.stringify({type:'auth-refreshed',expiresAt:next.expiresAt}));await this.schedule();
    });
  }
  private async speech(ws:WebSocket,att:Attachment,data:Record<string,unknown>,receivedAt:number) {
    const owner=this.pilotState.lease;
    if(!att.identity.canControl || !owner || owner.sessionId!==att.identity.sessionId || owner.socketId!==att.socketId || owner.id!==data.leaseId) {
      if(att.identity.canControl && typeof data.leaseId==='string' && att.microphoneLeases?.includes(data.leaseId)) return;
      ws.close(1008,'This connection does not own the microphone.');return;
    }
    try {
      const lease=this.pilotState.lease;
      if(!lease || !this.leaseValid()) throw new Error('speech_binding');
      // A pause, result, or new epoch can beat audio already in flight. Discard
      // that tail without disarming an otherwise healthy microphone.
      if(!this.game?.round || !['active','settling'].includes(this.game.phase) || data.roundId!==this.game.round.id || data.epoch!==this.game.round.epoch) return;
      let speech=att.speech;
      if(!speech || speech.roundId!==data.roundId || speech.epoch!==data.epoch || speech.leaseId!==data.leaseId)
        speech={leaseId:lease.id,roundId:this.game.round.id,epoch:this.game.round.epoch,samples:0,firstAudioAt:0,lastAudioAt:this.now,lastSequence:0};
      if(data.type==='speech-audio') {
        const parsed=progressSchema.parse({type:'audio',samples:data.samples});
        const delta=parsed.samples-speech.samples;
        if(delta<=0 || delta>8192) throw new Error('speech_timing');
        if(this.game.phase==='settling') {
          // Moonshine drains capture after the buzzer. Keep the bounded sample
          // clock so a final sentence may include that tail, but do not extend
          // microphone liveness or move its established capture anchor. Core
          // scores only matching words that ended strictly before the buzzer.
          if(!speech.firstAudioAt) speech.firstAudioAt=Math.max(this.game.round.segmentAt,receivedAt-parsed.samples/16);
          speech.samples=parsed.samples;
          att.speech=speech;ws.serializeAttachment(att);await this.schedule();return;
        }
        const observedStart=receivedAt-parsed.samples/16;
        speech.firstAudioAt=Math.max(this.game.round.segmentAt,speech.firstAudioAt?Math.min(speech.firstAudioAt,observedStart):observedStart);
        const drift=receivedAt-speech.firstAudioAt-parsed.samples/16;
        if(drift < -500 || drift>2000) throw new Error('speech_timing');
        speech.samples=parsed.samples;speech.lastAudioAt=receivedAt;
        await this.refreshAudioLease(lease,speech,receivedAt);
        // Admission can update its counters while durable renewal awaits.
        // Publish only accepted speech onto the latest attachment, never the
        // older input/auth metadata captured at the start of this operation.
        const current=this.attachment(ws);
        if(!current || current.socketId!==lease.socketId || current.identity.sessionId!==lease.sessionId) throw new Error('speech_binding');
        current.speech=speech;ws.serializeAttachment(current);await this.schedule();return;
      }
      const transcript=localTranscript({type:'final',sequence:data.sequence,line:data.line},
        {...speech,audioSeconds:speech.samples/16000},this.now);
      if(!transcript) throw new Error('speech_timing');
      const candidate=this.bind(Game.restore(this.game.checkpoint(),()=>this.now));
      candidate.transcript(transcript,'confirm');
      // Commit before accepting the sequence. A failed durable write cannot turn
      // a retry into a lost catch. Transcript IDs are also deduped by Game.
      await this.commit(candidate,this.revision+1,this.generation);
      speech.lastSequence++;att.speech=speech;ws.serializeAttachment(att);this.broadcast();
    } catch {
      const candidate=this.game && this.bind(Game.restore(this.game.checkpoint(),()=>this.now));
      if(candidate && this.pilotState.lease?.sessionId===att.identity.sessionId) {
        const pilot=structuredClone(this.pilotState);pilot.lease=null;candidate.mic='error';candidate.pauseIfActive();
        await this.commit(candidate,this.revision+1,this.generation,undefined,pilot);this.broadcast();
      }
      ws.send(JSON.stringify({type:'speech-error',code:'speech_rejected',message:'Microphone timing was interrupted. Enable it again and resume.'}));
    }
  }
  private ignoreChat(eventId:string,pilot:PilotState,reason:string):Response {
    this.ctx.storage.transactionSync(()=>{
      this.ctx.storage.sql.exec('DELETE FROM pilot_chat_receipt WHERE expires<=?',this.now);
      if(this.ctx.storage.sql.exec<{n:number}>('SELECT chat AS n FROM pilot_counts WHERE id=1').one().n<12_000)
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO pilot_chat_receipt(id,expires) VALUES(?,?)',eventId,this.now+600_000);
      this.writePilot(pilot);
    });
    this.pilotState=pilot;
    return json({ok:true,ignored:true,reason});
  }
  private async operatorRoom(request:Request,path:string):Promise<Response> {
    if(request.method!=='POST' || new URL(request.url).origin!=='https://room.internal') return json({error:'Access denied.'},403);
    const input=JSON.parse(await readBounded(request)) as Record<string,unknown>;
    if(typeof input.channelId!=='string' || !/^[1-9][0-9]{0,24}$/.test(input.channelId) || (this.channel && this.channel!==input.channelId)) return json({error:'Access denied.'},403);
    if(path==='/internal/operator-status') {
      const sockets=this.openSockets().map(ws=>this.attachment(ws)?.identity.role);
      return json({available:true,phase:this.game?.phase??'idle',viewerSockets:sockets.filter(r=>r==='viewer').length,
        studioSockets:sockets.filter(r=>r==='studio').length,overlaySockets:sockets.filter(r=>r==='overlay').length,
        participants:this.game?.round?.participants.size??0});
    }
    if(typeof input.enabled!=='boolean' || !Number.isSafeInteger(input.revision) || Number(input.revision)<1) return json({error:'Invalid operator state.'},400);
    const revision=Number(input.revision);
    if(revision<=(this.pilotState.operator?.revision??0) || revision<this.operatorPendingRevision) return json({ok:true});
    // Record a durable barrier before the larger game checkpoint. If that
    // checkpoint fails, socket close/alarm callbacks and reconstruction must
    // not settle the unfinished round while Control retries this same revision.
    this.operatorPendingRevision=Math.max(this.operatorPendingRevision,revision);
    const pilot=structuredClone(this.pilotState);
    pilot.operator={enabled:input.enabled,revision};pilot.lease=null;pilot.chatConnected=false;
    const candidate=this.game?this.bind(Game.restore(this.game.checkpoint(),()=>this.now)):null;
    if(candidate) {
      // A service stop abandons the unfinished round without adding a score or
      // allowing an expired pending catch to settle when the service reopens.
      candidate.phase='idle';candidate.round=null;candidate.result=null;candidate.nextAt=null;candidate.mission=null;
      candidate.mic='off';candidate.connection={status:'offline',detail:'The pilot was stopped. Connect chat and your microphone to play again.'};
    }
    try {
      this.ctx.storage.sql.exec('INSERT INTO pilot_operator_intent(id,revision) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET revision=max(revision,excluded.revision)',revision);
      if(candidate) await this.commit(candidate,this.revision+1,this.generation+1,undefined,pilot);
      else {
        await this.ctx.storage.transaction(async()=>{this.writePilot(pilot);this.ctx.storage.sql.exec('DELETE FROM pilot_outbox');this.ctx.storage.sql.exec('DELETE FROM pilot_operator_intent WHERE revision<=?',revision);await this.ctx.storage.deleteAlarm();});
        this.pilotState=pilot;if(revision>=this.operatorPendingRevision)this.operatorPendingRevision=0;
      }
    } finally {
      // Fail closed even if checkpointing is unavailable. Control retains a
      // durable retry intent, and its admission gate already rejects new joins.
      for(const ws of this.openSockets()) try {ws.close(1001,'Pilot stopped.');}catch{/* already closed */}
    }
    return json({ok:true});
  }
  private async internal(request:Request,path:string):Promise<Response> {
    if(request.method!=='POST') return json({error:'Not found.'},404);
    const data=JSON.parse(await readBounded(request,path==='/internal/control'?16_384:LIMITS.commandBytes)) as Record<string,unknown>;
    if(typeof data.channelId!=='string' || !/^[1-9][0-9]{0,24}$/.test(data.channelId) || (this.channel && this.channel!==data.channelId)) return json({error:'Access denied.'},403);
    let disconnectedSessions:Set<string>|undefined;
    if(path==='/internal/control' && data.type==='disconnect') {
      const hasSingle=data.sessionId!==undefined,hasBatch=data.sessionIds!==undefined;
      const ids=hasSingle?[data.sessionId]:data.sessionIds;
      if(hasSingle===hasBatch || !Array.isArray(ids) || ids.length<1 || ids.length>100 ||
        !ids.every(id=>typeof id==='string' && /^[A-Za-z0-9:_-]{1,128}$/.test(id))) return json({error:'Invalid sessions.'},400);
      disconnectedSessions=new Set(ids as string[]);
    }
    await this.reconcile();
    if(path==='/internal/voice-draft-current') {
      const ref=data.ref as VoiceDraftRef|undefined;
      return json({current:!!ref && voiceDraftCurrent(this.game,this.pilotState.voiceDraft,ref,this.now) &&
        !!this.game?.data.settings.chatBot && this.pilotState.chatConnected && this.leaseValid() && this.pilotState.voiceDraftLease===this.pilotState.lease?.id});
    }
    if(path==='/internal/control') {
      const channel=data.channelId;
      if(!this.game && (typeof data.login!=='string' || !/^[a-z0-9_]{1,25}$/.test(data.login))) return json({error:'Not connected.'},409);
      const candidate=this.game?this.bind(Game.restore(this.game.checkpoint(),()=>this.now)):this.fresh(channel,String(data.login));
      const pilot=structuredClone(this.pilotState);
      let revokedSockets:WebSocket[]=[];
      if(data.type==='connection') {
        if(data.status!=='connected' && data.status!=='disconnected') return json({error:'Invalid state.'},400);
        if(!Number.isSafeInteger(data.connectionRevision) || Number(data.connectionRevision)<1) return json({error:'Invalid connection revision.'},400);
        // Control repeats its latest committed status during bootstrap. An old
        // delayed push or duplicate must not pause a newly reconnected game.
        if(Number(data.connectionRevision)<=(pilot.connectionRevision??0)) return json({ok:true});
        pilot.connectionRevision=Number(data.connectionRevision);
        pilot.chatConnected=data.status==='connected';
        candidate.connection={status:pilot.chatConnected?'connected':'offline',detail:pilot.chatConnected?'Twitch chat connected.':'Twitch chat disconnected. Reconnect before playing.'};
        if(!pilot.chatConnected) {pilot.lease=null;candidate.mic='off';candidate.pauseIfActive();}
      } else if(data.type==='disconnect') {
        // These are the sessions captured when Control committed revocation.
        // A delayed batch cannot revoke a new sign-in on the same channel.
        revokedSockets=this.openSockets().filter(ws=>disconnectedSessions!.has(this.attachment(ws)?.identity.sessionId??''));
        const revokeLease=!!pilot.lease && disconnectedSessions!.has(pilot.lease.sessionId);
        if(!revokedSockets.length && !revokeLease) return json({ok:true});
        if(revokeLease) {pilot.lease=null;candidate.mic='off';candidate.pauseIfActive();}
      } else return json({error:'Not found.'},404);
      try {await this.commit(candidate,this.revision+1,this.generation,undefined,pilot);}
      finally {
        // Control already revoked these exact sessions. A checkpoint outage must
        // not leave their existing sockets usable until capability expiry.
        for(const ws of revokedSockets) try {ws.close(1008,'Signed out.');}catch{/* already closed */}
      }
      this.broadcast();return json({ok:true});
    }
    if(path!=='/internal/twitch-chat') return json({error:'Not found.'},404);
    const event=eventSchema.parse(data);
    if(!this.game) return json({ok:true,ignored:true});
    if(event.kind==='message' && this.game.data.settings.recordingMode && this.game.data.recordingTake &&
      event.at <= (this.game.data.recordingTake.startedAt??0)) return json({ok:true,ignored:true,reason:'previous_take'});
    const command=event.kind==='message' ? parseCommand(event.text??'') : null;
    const botCommand=isBotReplyCommand(command);
    const modCommand=command!==null && MOD_COMMANDS.has(command) && this.game.data.settings.modCommands &&
      (event.userId===this.channel || (event.badges??[]).some(b=>['moderator','broadcaster'].includes(b)));
    // Ordinary chat outside a running round has no gameplay effect and needs
    // neither a room checkpoint nor a receipt. Control deduplicates delivery.
    if(event.kind==='message' && this.game.phase!=='active' && !botCommand && !modCommand) return json({ok:true,ignored:true,reason:'room_idle'});
    const prior=this.ctx.storage.sql.exec('SELECT id FROM pilot_chat_receipt WHERE id=? AND expires>?',event.eventId,this.now).toArray();
    if(prior.length) return json({ok:true,duplicate:true});
    // Twitch delivers the whole channel chat; overflow remains normal Twitch chat
    // but is not admitted to this pilot's game. No fee or quota is per viewer.
    const pilot=structuredClone(this.pilotState);
    const candidate=this.bind(Game.restore(this.game.checkpoint(),()=>this.now));
    if(event.kind==='message') {
      if(!this.takeRate(pilot,'chat',pilotLimits(this.env).chatPerMinute)) return this.ignoreChat(event.eventId,pilot,'pilot_chat_rate');
      const participants=candidate.round?.participants;
      if(!modCommand && !botCommand && participants && !participants.has(event.userId) && participants.size>=pilotLimits(this.env).participants) {
        return this.ignoreChat(event.eventId,pilot,'pilot_player_limit');
      }
      const badges=event.badges??[];
      const isMod=event.userId===this.channel || badges.some(b=>['moderator','broadcaster'].includes(b));
      if(candidate.data.settings.modCommands && isMod && command!==null && MOD_COMMANDS.has(command) && this.now-event.at<=15_000 && event.at<=this.now+2000) {
        try {
          if(command==='pause') candidate.pause();
          else if(pilot.chatConnected && this.leaseValid()) {if(command==='start')candidate.begin();else candidate.resume();}
        } catch { /* A stale moderator command cannot override the current phase. */ }
      } else if(isBotReplyCommand(command) && this.now-event.at<=15_000 && event.at<=this.now+2000) {
        // Cooldowns belong before the durable outbox. A user cannot fill the
        // shared bot queue with replies that will be discarded later anyway.
        const replies=pilot.botReplies??{channelAt:0,users:{}};
        for(const [user,at] of Object.entries(replies.users)) if(this.now-at>=BOT_REPLY_COOLDOWN_MS) delete replies.users[user];
        if(candidate.data.settings.chatBot && this.now-replies.channelAt>=BOT_REPLY_COOLDOWN_MS &&
          (!replies.users[event.userId] || this.now-replies.users[event.userId]!>=BOT_REPLY_COOLDOWN_MS)) {
          replies.channelAt=this.now;replies.users[event.userId]=this.now;pilot.botReplies=replies;
          this.events.get(candidate)!.push({event:{type:'chat-command',command,userId:event.userId},safeView:candidate.view('overlay')});
        }
      } else candidate.chat(event.messageId??event.eventId,event.userId,event.name??event.userId,event.text??'',event.at);
    } else if(event.kind==='delete') candidate.dropMessage(event.messageId??'',event.userId);
    else candidate.dropChatter(event.userId);
    // Bound durable transport dedupe separately from browser command receipts.
    this.ctx.storage.sql.exec('DELETE FROM pilot_chat_receipt WHERE expires<=?',this.now);
    if(this.ctx.storage.sql.exec<{n:number}>('SELECT chat AS n FROM pilot_counts WHERE id=1').one().n>=12_000) return json({ok:true,ignored:true,reason:'pilot_capacity'});
    if(JSON.stringify(candidate.checkpoint())===JSON.stringify(this.game.checkpoint()) && !this.events.get(candidate)?.length)
      return this.ignoreChat(event.eventId,pilot,'no_change');
    await this.commit(candidate,this.revision+1,this.generation,undefined,pilot,event.eventId);this.broadcast();
    return json({ok:true});
  }
  private rememberClosedSpeech(ws:WebSocket) {
    if(this.operatorBlocked()) return;
    const att=this.attachment(ws),lease=this.pilotState.lease;
    if(lease && att?.socketId===lease.socketId && att.speech) {
      lease.lastAudioAt=att.speech.lastAudioAt;lease.roundId=att.speech.roundId;lease.epoch=att.speech.epoch;
      this.writePilot();
    }
  }
  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    if(this.pilot() && this.attachment(ws)?.socketId!==this.pilotState.lease?.socketId) {
      try {ws.close([1005,1006,1015].includes(code)?1000:code,'');}catch{/* already closed */}
      // A viewer disconnect cannot change gameplay. The existing expiry alarm
      // will clean up scheduling without placing a disconnect wave in the queue.
      return;
    }
    await this.serial(async()=>{
      this.rememberClosedSpeech(ws);
      // Reserved receive-only close codes cannot be sent back to the peer.
      try {ws.close([1005,1006,1015].includes(code)?1000:code,'');} catch { /* already closed */ }
      await this.reconcile();await this.schedule();
    });
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    if(this.pilot() && this.attachment(ws)?.socketId!==this.pilotState.lease?.socketId) {
      try{ws.close(1011,'Reconnect to catch up.');}catch{/* already closed */}return;
    }
    await this.serial(async()=>{this.rememberClosedSpeech(ws);try{ws.close(1011,'Reconnect to catch up.');}catch{/* already closed */}await this.reconcile();await this.schedule();});
  }
  async alarm(): Promise<void> {
    await this.serial(async () => {
      await this.reconcile(); this.store.prune(this.now);
      if(this.pilot()) this.ctx.storage.sql.exec('DELETE FROM pilot_chat_receipt WHERE expires<=?',this.now);
      this.receiptAt=this.store.receiptDeadline();
    });
    await this.flushOutbox();
    await this.serial(()=>this.schedule());
  }
}
