import type { TranscriptLine } from '@moonshine-ai/moonshine-wasm';

export type MoonshineLine = TranscriptLine;
export interface MoonshineMetrics {
  model?: { revision: string; bytes: number };
  passes: number[];
}

/** One worker per opted-in studio/lab; never created for a viewer or overlay. */
export class Moonshine {
  private worker?: Worker;
  private nextId = 0;
  private pending = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private generation = 0;
  private queued = 0;
  private loaded = false;
  metrics: MoonshineMetrics = { passes: [] };
  constructor(
    private line: (line: MoonshineLine) => void,
    private progress: (message: string) => void,
    private error: (message: string) => void,
  ) {}
  async load() {
    if (this.loaded) return;
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined')
      throw new Error('Local speech needs a cross-origin isolated browser page. Open the standalone BAIT studio on localhost or HTTPS.');
    this.worker = new Worker('/moonshine-worker.js?v=0.1.5-csp1', { type: 'module', name: 'bait-moonshine' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'reply' || data.type === 'error') {
        const task = this.pending.get(data.id);
        if (task) {
          clearTimeout(task.timer); this.pending.delete(data.id);
          data.type === 'error' ? task.reject(new Error(data.message)) : task.resolve();
        } else if (data.type === 'error' && data.generation === this.generation) this.error(data.message);
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
    this.worker.onerror = () => this.error('The local speech worker stopped. Disable the microphone and try again.');
    await this.request('load', {}, 120000);
    this.loaded = true;
  }
  private request(type: string, data: Record<string, unknown> = {}, timeout = 12000) {
    const id = ++this.nextId;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Moonshine ${type} timed out. Try again.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.worker?.postMessage({ type, id, ...data });
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
    ++this.generation;
    this.worker?.terminate(); this.worker = undefined; this.loaded = false;
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(new Error('Moonshine was stopped.')); }
    this.pending.clear();
  }
}
