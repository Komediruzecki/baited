import type { TranscriptLine } from '@moonshine-ai/moonshine-wasm';

export type MoonshineLine = TranscriptLine;
export interface MoonshineMetrics {
  model?: { revision: string; bytes: number };
  passes: number[];
}

export interface MoonshineDiagnostic {
  stage: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  hardwareConcurrency?: number;
}
export class MoonshineError extends Error {
  constructor(message: string, readonly diagnostic: MoonshineDiagnostic) { super(message); this.name = 'MoonshineError'; }
}
// Diagnostics may be exported. Keep file paths but never URL credentials, queries or fragments.
function safeMessage(message: string) {
  return message.replace(/(?:https?:\/\/|blob:|data:)[^\s"'<>]+/gi, value => {
    try { const url = new URL(value); return /^(https?:)$/.test(url.protocol) ? url.pathname : '[worker resource]'; } catch { return '[resource]'; }
  }).replace(/[\u0000-\u001f]/g, ' ').slice(0, 400);
}
function filePath(filename: string | undefined) {
  if (!filename) return undefined;
  try { const url = new URL(filename, 'https://local.invalid'); return /^(https?:)$/.test(url.protocol) ? url.pathname.slice(0, 200) : '[worker resource]'; } catch { return undefined; }
}
const stages = new Set(['bootstrap', 'importing-sdk', 'loading-runtime', 'downloading-model', 'initializing-model', 'ready', 'starting', 'transcribing', 'finishing']);

/** One worker per opted-in studio/lab; never created for a viewer or overlay. */
export class Moonshine {
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private generation = 0;
  private queued = 0;
  private loaded = false;
  private stage = 'bootstrap';
  metrics: MoonshineMetrics = { passes: [] };
  constructor(
    private line: (line: MoonshineLine) => void,
    private progress: (message: string) => void,
    private error: (message: string, error?: MoonshineError) => void,
  ) {}
  async load() {
    if (this.loaded) return;
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined')
      throw new Error('Local speech needs a cross-origin isolated browser page. Open the standalone Baited Studio on localhost or HTTPS.');
    this.close();
    this.stage = 'bootstrap';
    const worker = this.worker = new Worker('/moonshine-worker.js?v=0.1.5-diagnostics2', { type: 'module', name: 'bait-moonshine' });
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
      if (stages.has(data.stage)) this.stage = data.stage;
      if (data.type === 'reply' || data.type === 'error') {
        const task = this.pending.get(data.id);
        if (task) {
          clearTimeout(task.timer); this.pending.delete(data.id);
          data.type === 'error' ? task.reject(this.failure(data.message)) : task.resolve();
        } else if (data.type === 'error' && data.generation === this.generation) this.fatal(worker, this.failure(data.message));
      }
      if (data.type === 'progress') this.progress(data.total ? `Loading Moonshine ${Math.floor(data.loaded / data.total * 100)}%` : 'Loading Moonshine');
      if (data.type === 'model') this.metrics.model = { revision: data.revision, bytes: data.bytes };
      if (data.generation !== this.generation) return;
      if (data.type === 'line') this.line(data.line);
      if (data.type === 'pass') {
        this.queued = Math.max(0, this.queued - data.samples);
        this.metrics.passes.push(data.ms);
        if (this.metrics.passes.length > 10000) this.metrics.passes.shift();
      }
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      this.fatal(worker, this.failure(event?.message || 'The browser stopped the speech worker.', event));
    };
    worker.onmessageerror = () => this.fatal(worker, this.failure('The browser could not read a speech worker response.'));
    await this.request('load', {}, 120000);
    if (this.worker !== worker) throw new Error('Moonshine was stopped.');
    this.loaded = true;
  }
  private failure(message: string, event?: ErrorEvent) {
    const detail = safeMessage(typeof message === 'string' ? message : 'The browser stopped the speech worker.');
    return new MoonshineError(`Moonshine could not continue (${this.stage}): ${detail} Try this model again.`, {
      stage: this.stage, message: detail, file: filePath(event?.filename),
      line: Number.isFinite(event?.lineno) ? event!.lineno : undefined,
      column: Number.isFinite(event?.colno) ? event!.colno : undefined,
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
    });
  }
  private fatal(worker: Worker, error: MoonshineError) {
    if (this.worker !== worker) return;
    this.release(error);
    this.error(error.message, error);
  }
  private request(type: string, data: Record<string, unknown> = {}, timeout = 12000) {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Moonshine is not loaded. Try this model again.'));
    const id = ++this.nextId;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.fatal(worker, this.failure(`The ${type} request timed out.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ type, id, ...data }); }
      catch (error) { this.fatal(worker, this.failure(error instanceof Error ? error.message : 'Could not send audio to the worker.')); }
    });
  }
  async start() {
    this.queued = 0; this.metrics.passes = [];
    await this.request('start', { generation: ++this.generation });
  }
  audio(audio: Float32Array) {
    if (!this.loaded || !this.worker) return;
    this.queued += audio.length;
    if (this.queued > 16000 * 2) throw new Error('Local speech is more than two seconds behind. Pause and reduce browser or OBS load.');
    const copy = audio.slice();
    this.worker.postMessage({ type: 'audio', generation: this.generation, buffer: copy.buffer }, [copy.buffer]);
  }
  async finish() { await this.request('finish', { generation: this.generation }); }
  reset() {
    this.queued = 0;
    this.worker?.postMessage({ type: 'reset', generation: ++this.generation });
  }
  close() {
    this.release(new Error('Moonshine was stopped.'));
  }
  private release(error: Error) {
    ++this.generation;
    const worker = this.worker;
    this.worker = undefined; this.loaded = false; this.queued = 0;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
    this.pending.clear();
  }
}
