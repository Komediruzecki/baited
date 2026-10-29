import { DurableObject } from 'cloudflare:workers';
import { Game, defaults } from '@baited/game-core';
import { identityIsCurrent, type AuthIdentity, type AuthEnv } from './auth.js';
import { serveApprovedArt, type ApprovedArt } from './art.js';
import { commandSchema, fingerprint, json, LIMITS, PROTOCOL_VERSION, readBounded, type Command, type Receipt } from './protocol.js';
import { RoomStore } from './state-store.js';

export interface Env extends AuthEnv { ROOMS: DurableObjectNamespace; ART: R2Bucket }
interface Attachment { identity: AuthIdentity; lastInputAt: number }

/** One channel, one writer. Only the gateway holds a namespace binding. */
export class ChannelRoom extends DurableObject<Env> {
  private store: RoomStore;
  private game: Game | null = null;
  private channel = '';
  private revision = 0;
  private generation = 1;
  private now = Date.now();
  private projections = new Map<AuthIdentity['role'], ReturnType<Game['view']>>();
  private receiptAt: number | null;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

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
    const meta = this.store.metadata(); const checkpoint = this.store.load();
    if (Boolean(meta) !== Boolean(checkpoint)) throw new Error('Inconsistent room checkpoint.');
    if (meta && checkpoint) {
      this.channel = meta.channel; this.revision = meta.revision; this.generation = meta.generation;
      this.game = this.bind(Game.restore(checkpoint, () => this.now));
      if (this.game.data.owner !== this.channel) throw new Error('Room owner mismatch.');
    }
    this.receiptAt = this.store.receiptDeadline();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private bind(game: Game): Game {
    // This P0-P2 proof uses synthetic events only. Live mic leases, OAuth and bot
    // side effects must be implemented before connecting the current Studio.
    game.canRun = () => false;
    game.artFor = () => undefined;
    return game;
  }
  private fresh(channel: string): Game {
    return this.bind(new Game({ id: `edge-${channel}`, owner: channel, channel: `poc-${channel}`,
      mode: 'demo', overlayKey: 'not-an-overlay-capability', settings: { ...defaults, auto: false },
      history: [], priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {} }, () => this.now));
  }
  private current(identity: AuthIdentity): boolean {
    return identityIsCurrent(identity, this.channel, this.generation, this.now);
  }
  private snapshot(role: AuthIdentity['role']) {
    let view = this.projections.get(role);
    if (!view && this.game) { view = this.game.view(role); this.projections.set(role, view); }
    return { type: 'snapshot', protocol: PROTOCOL_VERSION, revision: this.revision,
      ...(role === 'studio' ? { awardBoard: this.game?.awardBoard ?? null } : {}),
      generation: this.generation, room: view ? { ...view, serverTime: this.now,
        mission: view.mission && view.mission.endsAt !== null
          ? { ...view.mission, remaining: Math.max(0, view.mission.endsAt - this.now) } : view.mission,
        round: view.round && view.phase === 'active' && view.round.endsAt !== null
          ? { ...view.round, remaining: Math.max(0, view.round.endsAt - this.now) } : view.round } : null };
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
      let frame = frames.get(att.identity.role);
      if (!frame) { frame = JSON.stringify(this.snapshot(att.identity.role)); frames.set(att.identity.role, frame); }
      try { ws.send(frame); } catch { ws.close(1013, 'Reconnect to catch up.'); }
    }
  }
  private async commit(candidate: Game, nextRevision: number, nextGeneration: number,
    receipt?: { key: string; hash: string; body: Receipt }): Promise<void> {
    let records!: Map<string,string>;
    await this.ctx.storage.transaction(async () => {
      this.store.prune(this.now);
      records = this.store.save(candidate.checkpoint(), candidate.data.owner, nextRevision, nextGeneration);
      if (receipt) this.store.record(receipt.key, receipt.hash, receipt.body, this.now);
      // SQL, receipt and alarm commit together. A crash cannot leave an accepted
      // round without a wake-up; a failed alarm write rolls back the command.
      await this.schedule(candidate, nextGeneration, this.store.receiptDeadline());
    });
    // Publish in-memory state only after the transaction commits. An exception
    // leaves both the durable state and the live authoritative Game untouched.
    this.store.committed(records); this.game = candidate; this.channel = candidate.data.owner;
    this.revision = nextRevision; this.generation = nextGeneration;
    this.receiptAt = this.store.receiptDeadline(); this.projections.clear();
  }
  private async reconcile(): Promise<void> {
    this.now = Date.now(); this.closeStale();
    if (!this.game) return;
    const due = this.game.nextDeadline();
    if (due === null || due > this.now) return;
    const candidate = this.bind(Game.restore(this.game.checkpoint(), () => this.now));
    candidate.advanceTo(this.now, LIMITS.maxTransitions);
    await this.commit(candidate, this.revision + 1, this.generation);
    this.broadcast();
  }
  protected async schedule(game = this.game, generation = this.generation, receiptAt = this.receiptAt): Promise<void> {
    const deadlines = [game?.nextDeadline() ?? null, receiptAt];
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (att && identityIsCurrent(att.identity, game?.data.owner ?? this.channel, generation, Date.now()) && ws.readyState === WebSocket.OPEN) deadlines.push(att.identity.expiresAt);
    }
    const valid = deadlines.filter((n): n is number => n !== null);
    const at = valid.length ? Math.max(Date.now() + 1, Math.min(...valid)) : null;
    const old = await this.ctx.storage.getAlarm();
    if (at === null) { if (old !== null) await this.ctx.storage.deleteAlarm(); }
    // Keep an earlier scheduled wake. Do not write setAlarm on every join/action.
    else if (old === null || old > at) await this.ctx.storage.setAlarm(at);
  }
  private authorizeCommand(identity: AuthIdentity, command: Command): boolean {
    if (identity.authKind === 'twitch-extension') return false;
    if (command.action.type === 'fixture-chat') return identity.role === 'viewer' && identity.stableIdentity;
    return identity.role === 'studio' && identity.canControl;
  }
  private dispatch(game: Game, identity: AuthIdentity, command: Command): void {
    const a = command.action;
    if ('roundId' in a && a.type !== 'award' && game.round?.id !== a.roundId) throw new Error('stale_round');
    if ('epoch' in a && game.round?.epoch !== a.epoch) throw new Error('stale_epoch');
    switch (a.type) {
      case 'start': game.start(); break;
      case 'pause': game.pause(); break;
      case 'resume': game.resume(); break;
      case 'end': game.end('ended'); break;
      case 'catch': game.decideCatch(a.roundId, a.decision); break;
      case 'reverse': game.reverse(); break;
      case 'award': game.award(a.roundId, a.hintId); break;
      case 'guess': game.guess(a.roundId, a.epoch, a.text); break;
      case 'settings':
        if (a.settings.auto || a.settings.chatBot || a.settings.modCommands) throw new Error('poc_feature_disabled');
        game.update(a.settings); break;
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
    if (command.generation !== this.generation || (command.action.type === 'fixture-chat'
      ? command.expectedRevision > this.revision : command.expectedRevision !== this.revision))
      return {status:409,body:{ok:false,code:'stale_revision',revision:this.revision,generation:this.generation}};
    this.store.prune(this.now);
    if (this.store.receiptCount() >= LIMITS.receipts) return {status:429,body:{ok:false,code:'room_busy',revision:this.revision,generation:this.generation}};
    const candidate = this.game ? this.bind(Game.restore(this.game.checkpoint(), () => this.now)) : this.fresh(identity.channelId);
    if (!this.game && command.action.type !== 'start') return {status:409,body:{ok:false,code:'start_room_first',revision:0,generation:this.generation}};
    try { this.dispatch(candidate, identity, command); }
    catch { return {status:409,body:{ok:false,code:'action_unavailable',revision:this.revision,generation:this.generation}}; }
    const generation = this.generation + (command.action.type === 'revoke-connections' ? 1 : 0);
    const body: Receipt = {ok:true,revision:this.revision+1,generation};
    await this.commit(candidate, body.revision, generation, {key,hash,body});
    this.broadcast(); return {status:200,body};
  }
  async fetch(request: Request): Promise<Response> {
    try { return await this.serial(() => this.fetchRequest(request)); }
    catch { return json({error:'This test room is temporarily unavailable. Try again.'},503); }
  }
  private async fetchRequest(request: Request): Promise<Response> {
    // Headers are freshly constructed by the gateway, never copied from callers.
    const identity = JSON.parse(request.headers.get('x-edge-identity') ?? 'null') as AuthIdentity | null;
    if (!identity) return json({error:'Access denied.'},403);
    await this.reconcile();
    if (this.channel && !this.current(identity)) return json({error:'Authorization changed. Reconnect.'},401);
    if (!identityIsCurrent(identity, identity.channelId, this.generation, this.now)) return json({error:'Authorization changed. Reconnect.'},401);
    const path = new URL(request.url).pathname;
    try {
      if (path === '/state' && request.method === 'GET') {
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
        await this.schedule(); return json(result.body,result.status);
      }
      if (path === '/socket' && request.method === 'GET' && request.headers.get('upgrade') === 'websocket') {
        if (!this.game) return json({error:'Start the test room first.'},404);
        const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
        if (sockets.length >= LIMITS.sockets || sockets.filter((ws) => this.attachment(ws)?.identity.subject === identity.subject).length >= LIMITS.socketsPerSubject)
          return json({error:'This test room has reached its connection limit.'},429);
        const pair = new WebSocketPair(); const [client,server] = Object.values(pair);
        const bound = {...identity,generation:this.generation};
        this.ctx.acceptWebSocket(server,[identity.role]);
        server.serializeAttachment({identity:bound,lastInputAt:0} satisfies Attachment);
        await this.schedule(); this.now = Date.now();
        if (!this.current(bound)) {
          server.close(1008,'Authorization expired. Reconnect.');
          return json({error:'Authorization expired. Reconnect.'},401);
        }
        server.send(JSON.stringify(this.snapshot(identity.role)));
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
    try { await this.serial(() => this.handleMessage(ws,message)); }
    catch { ws.close(1013,'Reconnect to catch up.'); }
  }
  private async handleMessage(ws: WebSocket,message: string | ArrayBuffer): Promise<void> {
    await this.reconcile(); const att = this.attachment(ws);
    if (!att || !this.current(att.identity)) {ws.close(1008,'Authorization expired. Reconnect.');return;}
    if (typeof message !== 'string' || new TextEncoder().encode(message).length > LIMITS.commandBytes) {ws.close(1009,'Message too large.');return;}
    // Small per-connection input limit. It is not advertised as an account-wide quota.
    if (this.now-att.lastInputAt < 100) {ws.close(1008,'Too many messages.');return;}
    att.lastInputAt=this.now;ws.serializeAttachment(att);
    try {
      if (message === 'resync') {ws.send(JSON.stringify(this.snapshot(att.identity.role)));await this.schedule();return;}
      const command=commandSchema.parse(JSON.parse(message)); const hash=await fingerprint(JSON.stringify(command));
      await this.reconcile();
      if (!this.current(att.identity)) {ws.close(1008,'Authorization changed. Reconnect.');return;}
      const result=await this.apply(att.identity,command,hash);
      if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'ack',id:command.id,...result.body}));
      await this.schedule();
    } catch {if (ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'error',code:'request_rejected'}));}
  }
  async webSocketClose(ws: WebSocket, code: number): Promise<void> {ws.close(code,'');await this.serial(() => this.schedule());}
  async webSocketError(ws: WebSocket): Promise<void> {ws.close(1011,'Reconnect to catch up.');await this.serial(() => this.schedule());}
  async alarm(): Promise<void> {
    await this.serial(async () => {
      await this.reconcile(); this.store.prune(this.now);
      this.receiptAt=this.store.receiptDeadline(); await this.schedule();
    });
  }
}
