import type { AwardBoard, GameView, Studio } from '../shared/types';
import { retryDelay } from './retry';

export interface EdgeBootstrap {
  channelId: string;
  token: string;
  tokenExpiresAt: number;
  csrf?: string;
  overlayUrl?: string;
  viewerUrl?: string;
  user?: { id: string; login: string; name: string };
  bot?: { configured: boolean; authorized: boolean; channelAllowed: boolean; name?: string; canAuthorize?: boolean };
}
export interface EdgeSnapshot {
  type: 'snapshot'; protocol: 1; revision: number; generation: number;
  room: GameView | null; awardBoard?: AwardBoard | null;
  socketId?: string;
}
type Listener = { state: (snapshot: EdgeSnapshot) => void; error: (lost: boolean) => void };
export interface SpeechSocket {
  readyState: number; bufferedAmount: number;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  send(value: string | ArrayBuffer): void;
  close(): void;
}
type Options = {
  origin: string;
  bootstrap: (signal?: AbortSignal) => Promise<EdgeBootstrap>;
  fetch?: typeof fetch;
  socket?: (url: string, protocols: string[]) => WebSocket;
  random?: () => number;
};
const messages: Record<string, string> = {
  stale_revision: 'The round changed before that action arrived. Check its state and try again.',
  action_unavailable: 'That action is not available in this round.',
  room_busy: 'The game is busy. Try again in a moment.',
  microphone_required: 'Enable your microphone before starting the round.',
  pilot_full: 'All pilot places are in use. Try again when a game finishes.',
  rate_limited: 'Too many actions arrived together. Wait a moment and try again.',
  lease_owner: 'This microphone session ended or moved to another Studio tab. Enable it again here.',
  studio_not_connected: 'Studio is disconnected. Wait for it to reconnect, then enable your microphone again.',
};
const speechMessages: Record<string, string> = {
  mic_expired: 'This microphone session ended. Enable your microphone again, then resume the round.',
  speech_rejected: 'The audio timing was interrupted. Enable your microphone again, then resume the round.',
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
/** Cancel one caller's wait without canceling a connection shared by other callers. */
function waitForSignal<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException('The request was canceled.', 'AbortError'));
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('The request was canceled.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
  });
  return Promise.race([pending, cancelled]).finally(() => signal.removeEventListener('abort', abort));
}
export function readEdgeBootstrap(value: unknown): EdgeBootstrap {
  if (!record(value) || typeof value.channelId !== 'string' || !/^[1-9][0-9]{0,24}$/.test(value.channelId) ||
      typeof value.token !== 'string' || value.token.length > 4096 || !/^[A-Za-z0-9_.-]+$/.test(value.token) ||
      typeof value.tokenExpiresAt !== 'number' || !Number.isFinite(value.tokenExpiresAt) || value.tokenExpiresAt <= Date.now())
    throw new Error('Your session needs a fresh sign-in. Reload Studio to continue.');
  return value as unknown as EdgeBootstrap;
}
export function readEdgeSnapshot(value: unknown): EdgeSnapshot {
  if (!record(value) || value.type !== 'snapshot' || value.protocol !== 1 ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !Number.isSafeInteger(value.generation) || (value.generation as number) < 1 ||
      (value.socketId !== undefined && (typeof value.socketId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.socketId))) ||
      !(value.room === null || (record(value.room) && typeof value.room.serverTime === 'number' &&
        typeof value.room.phase === 'string' && record(value.room.score) && record(value.room.settings))))
    throw new Error('The round could not be read. Reconnect to continue.');
  return value as unknown as EdgeSnapshot;
}

/** A single room connection owns snapshots, microphone frames and short-lived auth. */
export class EdgeRoomTransport {
  private credentials: EdgeBootstrap | undefined;
  private socket: WebSocket | undefined;
  private boundSocketId: string | undefined;
  private snapshot: EdgeSnapshot | undefined;
  private listeners = new Set<Listener>();
  private speech: { socket: SpeechSocket; leaseId: string; roundId: string; epoch: number } | undefined;
  private connecting: Promise<void> | undefined;
  private renewTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private bootstrapAbort: AbortController | undefined;
  private pendingCredentials: EdgeBootstrap | undefined;
  private resync: { promise: Promise<EdgeSnapshot>; resolve: (snapshot: EdgeSnapshot) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  private renewing = false;
  private renewalFailures = 0;
  private failures = 0;
  private connectedOnce = false;
  private retryUntil = 0;
  private stopped = false;
  private operations: Promise<unknown> = Promise.resolve();
  private voiceDraftOperations: Promise<unknown> = Promise.resolve();
  private fetch: typeof fetch;
  constructor(private options: Options) { this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis); }
  get bootstrap() { return this.credentials; }
  get current() { return this.snapshot; }
  get connected() { return this.socket?.readyState === 1 && !!this.snapshot && !!this.credentials && this.credentials.tokenExpiresAt > Date.now(); }
  private report(lost: boolean) { for (const listener of this.listeners) listener.error(lost); }
  private scheduleRetry() {
    if (!this.connectedOnce || this.stopped || !this.listeners.size || this.retryTimer !== undefined) return;
    if (!this.retryUntil) this.retryUntil = Date.now() + 300000;
    const delay = retryDelay(this.failures++, 60000, this.options.random);
    if (Date.now() + delay <= this.retryUntil)
      this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.ensure().catch(() => this.report(true)); }, delay);
  }
  private accept(snapshot: EdgeSnapshot) {
    if (this.snapshot?.generation === snapshot.generation && snapshot.revision < this.snapshot.revision) return;
    if (this.snapshot && this.snapshot.generation !== snapshot.generation)
      this.stopSpeech('The game session changed. Enable the microphone again.');
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener.state(snapshot);
    this.report(this.socket?.readyState !== 1);
  }
  subscribe(state: Listener['state'], error: Listener['error']) {
    const listener = { state, error }; this.listeners.add(listener);
    if (this.snapshot && this.connected) state(this.snapshot);
    void this.ensure().catch(() => error(true));
    return () => { this.listeners.delete(listener); };
  }
  async ensure() {
    if (this.stopped) throw new Error('The connection has closed. Reload to reconnect.');
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().catch((error) => {
      if (![401, 403, 429].includes(error?.status) && !error?.refused) this.scheduleRetry();
      throw error;
    }).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private async credentialsFromServer() {
    this.bootstrapAbort?.abort();
    const controller = new AbortController();
    this.bootstrapAbort = controller;
    try { return readEdgeBootstrap(await this.options.bootstrap(controller.signal)); }
    finally { if (this.bootstrapAbort === controller) this.bootstrapAbort = undefined; }
  }
  private async open() {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    const credentials = await this.credentialsFromServer();
    if (this.stopped) return;
    if (this.credentials && this.credentials.channelId !== credentials.channelId)
      throw Object.assign(new Error('The signed-in channel changed. Reload Studio.'), { refused: true });
    this.credentials = credentials;
    this.snapshot = undefined;
    this.boundSocketId = undefined;
    const url = new URL(`/v1/rooms/${credentials.channelId}/socket`, this.options.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = (this.options.socket ?? ((address, protocols) => new WebSocket(address, protocols)))(url.href,
      ['baited.v1', `baited.auth.${credentials.token}`]);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let initialized = false;
      this.connectTimer = setTimeout(() => { socket.close(4000, 'Connection timed out.'); reject(new Error('The game did not connect. Try again.')); }, 10000);
      socket.onmessage = (event) => {
        if (this.socket !== socket || this.stopped) return;
        try {
          if (typeof event.data !== 'string' || event.data.length > 262144) throw new Error('Invalid response.');
          const frame = JSON.parse(event.data);
          if (frame.type !== 'auth-refreshed' && this.credentials!.tokenExpiresAt <= Date.now()) {
            socket.close(4000, 'Session expired. Reconnecting.'); return;
          }
          if (frame.type === 'snapshot') {
            const snapshot = readEdgeSnapshot(frame);
            if (snapshot.socketId) this.boundSocketId = snapshot.socketId;
            this.accept(snapshot);
            this.finishResync();
            if (!initialized) { initialized = true; this.connectedOnce = true; this.retryUntil = 0; this.failures = 0; clearTimeout(this.connectTimer); this.scheduleRenewal(); resolve(); }
          } else if (frame.type === 'auth-refreshed' && this.pendingCredentials) {
            // A delayed acknowledgement for an earlier renewal cannot validate
            // a different token. Expiry is the server's signed JWT boundary.
            if (frame.expiresAt !== this.pendingCredentials.tokenExpiresAt || frame.expiresAt <= Date.now()) return;
            clearTimeout(this.refreshTimer);
            this.credentials = this.pendingCredentials; this.pendingCredentials = undefined; this.renewalFailures = 0; this.scheduleRenewal();
          } else if (frame.type === 'speech-error' || frame.type === 'error') {
            const code = typeof frame.code === 'string' && Object.hasOwn(speechMessages, frame.code) ? frame.code : undefined;
            this.stopSpeech(code ? speechMessages[code] : 'The microphone connection was rejected. Enable it again.', code);
          }
        } catch { this.stopSpeech('The game connection could not be read. Enable the microphone again.'); socket.close(4000, 'Invalid response.'); }
      };
      socket.onerror = () => { if (this.socket === socket) this.report(true); };
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.boundSocketId = undefined;
        this.snapshot = undefined;
        this.finishResync(new Error('The connection ended before its update arrived. Reconnect to continue.'));
        clearTimeout(this.connectTimer); clearTimeout(this.renewTimer); clearTimeout(this.refreshTimer); clearTimeout(this.expiryTimer);
        this.bootstrapAbort?.abort();
        this.pendingCredentials = undefined;
        this.stopSpeech('The connection ended. Reconnect, then enable your microphone again.');
        this.report(true);
        // An expired socket is closed before reconnecting with a fresh bootstrap.
        // Revocation before expiry and explicit capacity refusals never auto-retry.
        const expired = !!this.credentials && this.credentials.tokenExpiresAt <= Date.now();
        const refusal = [4001, 4408, 4429].includes(event.code) || !expired && event.code === 1008;
        if (!initialized) reject(Object.assign(new Error('This pilot may be full or temporarily unavailable. Try again later.'), { refused: refusal }));
        if (!refusal) this.scheduleRetry();
      };
    });
  }
  private scheduleRenewal() {
    clearTimeout(this.renewTimer); clearTimeout(this.expiryTimer);
    if (!this.credentials || this.stopped) return;
    const socket = this.socket, remaining = this.credentials.tokenExpiresAt - Date.now();
    // Five-minute credentials renew at three minutes, leaving two minutes for
    // network recovery and background-tab timer throttling.
    this.renewTimer = setTimeout(() => { void this.renew(); }, Math.max(1000, Math.min(180000, remaining - 120000)));
    this.expiryTimer = setTimeout(() => {
      if (!this.stopped && socket === this.socket) socket?.close(4000, 'Session expired. Reconnecting.');
    }, Math.max(0, remaining));
  }
  private retryRenewal(socket: WebSocket) {
    if (this.stopped || socket !== this.socket || socket.readyState !== 1) return;
    if (!this.credentials || this.credentials.tokenExpiresAt <= Date.now()) { socket.close(4000, 'Session expired. Reconnecting.'); return; }
    const delay = retryDelay(this.renewalFailures++, 30000, this.options.random);
    clearTimeout(this.renewTimer);
    this.renewTimer = setTimeout(() => { void this.renew(); }, delay);
  }
  private async renew() {
    const socket = this.socket;
    if (this.stopped || this.renewing || this.pendingCredentials || !socket || socket.readyState !== 1) return;
    this.renewing = true;
    clearTimeout(this.renewTimer);
    try {
      const credentials = await this.credentialsFromServer();
      if (this.stopped || socket !== this.socket) return;
      if (socket.readyState !== 1) return;
      if (credentials.channelId !== this.credentials?.channelId) { socket.close(4001, 'Session changed.'); return; }
      this.pendingCredentials = credentials;
      socket.send(JSON.stringify({ type: 'refresh-auth', token: credentials.token }));
      // An uncertain acknowledgement is a transport failure, not revocation.
      // Reopen with fresh credentials instead of resending inside the server's
      // thirty-second auth-refresh rate limit. The microphone stays fail-closed.
      this.refreshTimer = setTimeout(() => {
        if (socket === this.socket) socket.close(4000, 'Sign-in renewal timed out. Reconnecting.');
      }, 8000);
    } catch (error) {
      if (this.stopped || socket !== this.socket) return;
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) socket.close(4001, 'Sign in again.');
      else if (status === 429) socket.close(4429, 'The pilot is busy. Try again later.');
      else this.retryRenewal(socket);
    } finally { this.renewing = false; }
  }
  async state(signal?: AbortSignal): Promise<EdgeSnapshot> {
    if (signal?.aborted) throw new DOMException('The request was canceled.', 'AbortError');
    await waitForSignal(this.ensure(), signal);
    if (!this.snapshot) throw new Error('The round has not connected yet.');
    return this.snapshot;
  }
  private finishResync(error?: Error) {
    const pending = this.resync;
    if (!pending) return;
    this.resync = undefined;
    clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else if (this.snapshot) pending.resolve(this.snapshot);
  }
  /** Refresh after a control-plane mutation over the already authenticated socket. */
  async refresh(): Promise<EdgeSnapshot> {
    await this.ensure();
    if (this.resync) return this.resync.promise;
    let resolve!: (snapshot: EdgeSnapshot) => void, reject!: (error: Error) => void;
    const promise = new Promise<EdgeSnapshot>((yes, no) => { resolve = yes; reject = no; });
    this.resync = { promise, resolve, reject, timer: setTimeout(() => {
      this.finishResync(new Error('The updated connection has not arrived. Wait for Studio to reconnect.'));
    }, 10000) };
    try { this.socket!.send('resync'); }
    catch { this.finishResync(new Error('The connection ended before its update arrived. Reconnect to continue.')); }
    return promise;
  }
  command(action: Record<string, unknown>, signal?: AbortSignal): Promise<EdgeSnapshot> {
    const controller = new AbortController();
    let onAbort!: () => void, timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException('The request was canceled.', 'AbortError'));
      controller.signal.addEventListener('abort', onAbort, { once: true });
      timeout = setTimeout(() => {
        reject(new DOMException('The request timed out.', 'TimeoutError'));
        controller.abort();
      }, 10000);
    });
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    // A voice draft is advisory. It waits for existing game actions and earlier
    // drafts, but a slow bot post must never hold up a later scoring action.
    const advisoryDraft = action.type === 'voice-guess-draft';
    const previous = advisoryDraft
      ? Promise.all([this.operations.catch(() => {}), this.voiceDraftOperations.catch(() => {})])
      : this.operations.catch(() => {});
    const operation = previous.then(async () => {
      const cancelled = () => { if (controller.signal.aborted) throw new DOMException('The request was canceled.', 'AbortError'); };
      cancelled();
      await this.ensure();
      cancelled();
      const credentials = this.credentials!, snapshot = this.snapshot!;
      if (action.type === 'microphone') {
        if (!this.boundSocketId) throw new Error('This Studio connection needs to refresh before enabling the microphone. Reload Studio.');
        action = { ...action, socketId: this.boundSocketId };
      }
      const response = await this.fetch(new URL(`/v1/rooms/${credentials.channelId}/commands`, this.options.origin), {
        method: 'POST', headers: { Authorization: `Bearer ${credentials.token}`, 'content-type': 'application/json' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        body: JSON.stringify({ id: crypto.randomUUID(), generation: snapshot.generation, expectedRevision: snapshot.revision, action }),
      });
      const body: unknown = await response.json().catch(() => undefined);
      cancelled();
      const result = record(body) ? body : {};
      const code = typeof result.code === 'string' && Object.hasOwn(messages, result.code) ? result.code : undefined;
      // Even a refused stale action may carry a newer authoritative projection.
      if (result.snapshot !== undefined) {
        const receipt = readEdgeSnapshot(result.snapshot);
        // Advisory work can finish after a recording/session reset. Its old
        // generation must not replace a newer projection received meanwhile.
        if (!advisoryDraft || this.snapshot?.generation === snapshot.generation) this.accept(receipt);
      }
      // Keep only safe HTTP/code metadata. Provider messages may contain private detail.
      if (!response.ok || result.ok !== true) throw Object.assign(
        new Error(code ? messages[code] : 'That action could not be completed. Check the round and try again.'),
        { status: response.status, ...(code ? { code } : {}) },
      );
      // The authority attaches the current role projection to its receipt.
      // No follow-up state GET can consume the viewer budget or stop a mic lease.
      if (result.snapshot === undefined) throw new Error('The action arrived, but its result could not be loaded. Wait for the round to reconnect.');
      return this.snapshot!;
    });
    // Queue time and shared connection setup count toward the same deadline.
    // The abandoned task keeps its abort guards, so it cannot dispatch later.
    const task = Promise.race([operation, deadline]).finally(() => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', onAbort);
    });
    if (advisoryDraft) this.voiceDraftOperations = task;
    else this.operations = task;
    return task;
  }
  speechSocket(roundId: string, epoch: number, leaseId: string): SpeechSocket {
    this.stopSpeech();
    const roomSocket = this.socket;
    const round = this.snapshot?.room?.round;
    const bridge: SpeechSocket = {
      readyState: 0, bufferedAmount: 0, onmessage: null, onerror: null, onclose: null,
      send: (value) => {
        if (this.speech?.socket !== bridge || !this.connected || this.socket !== roomSocket || typeof value !== 'string') {
          this.stopSpeech('The microphone connection changed. Enable it again.'); return;
        }
        const frame = JSON.parse(value);
        if (!['audio', 'final'].includes(frame.type)) { this.stopSpeech('The microphone sent an unsupported message.'); return; }
        roomSocket!.send(JSON.stringify({ ...frame, type: frame.type === 'audio' ? 'speech-audio' : 'speech-final', leaseId, roundId, epoch }));
        bridge.bufferedAmount = roomSocket!.bufferedAmount;
      },
      close: () => { bridge.readyState = 3; if (this.speech?.socket === bridge) this.speech = undefined; },
    };
    this.speech = { socket: bridge, roundId, epoch, leaseId };
    queueMicrotask(() => {
      if (this.speech?.socket !== bridge) return;
      if (!this.connected || round?.id !== roundId || round.epoch !== epoch || this.snapshot?.room?.phase !== 'active') {
        this.stopSpeech('The round changed before the microphone connected. Enable it again.'); return;
      }
      bridge.readyState = 1;
      bridge.onmessage?.({ data: JSON.stringify({ type: 'status', status: 'listening' }) });
    });
    return bridge;
  }
  private stopSpeech(message?: string, code?: string) {
    const bridge = this.speech?.socket;
    this.speech = undefined;
    if (!bridge) return;
    bridge.readyState = 3;
    if (message) bridge.onmessage?.({ data: JSON.stringify({ type: 'error', message, ...(code ? { code } : {}) }) });
    bridge.onclose?.({ code: message ? 1008 : 1000, reason: message ? 'Connection lost.' : 'round-ended' });
  }
  destroy() {
    this.stopped = true;
    this.finishResync(new Error('The connection has closed. Reload to reconnect.'));
    clearTimeout(this.renewTimer); clearTimeout(this.retryTimer); clearTimeout(this.connectTimer); clearTimeout(this.refreshTimer); clearTimeout(this.expiryTimer);
    this.bootstrapAbort?.abort(); this.bootstrapAbort = undefined;
    this.stopSpeech(); this.listeners.clear();
    const socket = this.socket; this.socket = undefined; socket?.close(1000, 'Page closed.');
    this.credentials = undefined; this.pendingCredentials = undefined; this.snapshot = undefined; this.boundSocketId = undefined;
  }
}

export function edgeStudio(snapshot: EdgeSnapshot, bootstrap: EdgeBootstrap): Studio {
  if (!snapshot.room) throw new Error('Your channel is not ready yet. Reload Studio to connect.');
  return {
    room: snapshot.room, awardBoard: snapshot.awardBoard ?? null,
    viewerUrl: bootstrap.viewerUrl ?? `https://www.twitch.tv/${bootstrap.user?.login ?? ''}`,
    overlayUrl: bootstrap.overlayUrl ?? '', speechProvider: 'moonshine', speechReady: true,
    chatBot: { mode: bootstrap.bot?.authorized ? 'twitch' : bootstrap.bot?.configured ? 'unauthorized' : 'unconfigured',
      name: bootstrap.bot?.name ?? 'baity_bot', channelAllowed: bootstrap.bot?.channelAllowed ?? false, problem: null, recent: [] },
  };
}
