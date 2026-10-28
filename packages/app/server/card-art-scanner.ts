import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { CARD_ART_MODEL, CARD_ART_MODEL_SHA256 } from './card-art-policy.js';
import { CARD_ART_LIMITS } from '../shared/card-art.js';

export interface ProcessedArt {
  png: Uint8Array;
  width: number;
  height: number;
  predictions: unknown;
  model: string;
}
export interface CardArtProcessor {
  process(bytes: Uint8Array, mime: string): Promise<ProcessedArt>;
  close?(): Promise<void>;
}
export class ArtProcessingError extends Error {
  constructor(public code: 'invalid_image' | 'image_dimensions' | 'scan_unavailable' | 'art_busy') { super(code); }
}

/** One CPU-only worker; a small queue and deadline keep artwork away from game timing. */
export class LocalArtProcessor implements CardArtProcessor {
  private worker?: Worker;
  private chain: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closed = false;
  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private timeout = 45_000) {}
  async process(bytes: Uint8Array, mime: string): Promise<ProcessedArt> {
    if (this.closed) throw new ArtProcessingError('scan_unavailable');
    if (this.pending >= 2) throw new ArtProcessingError('art_busy');
    this.pending++;
    const task = this.chain.catch(() => {}).then(() => this.run(bytes, mime));
    this.chain = task;
    try { return await task; }
    finally { this.pending--; }
  }
  private run(bytes: Uint8Array, mime: string): Promise<ProcessedArt> {
    if (this.closed) return Promise.reject(new ArtProcessingError('scan_unavailable'));
    if (!this.worker) {
      const worker = new Worker(new URL('./card-art-worker.mjs', import.meta.url), {
        resourceLimits: { maxOldGenerationSizeMb: 192, stackSizeMb: 4 },
        stdout: true, stderr: true, workerData: { modelSha256: CARD_ART_MODEL_SHA256, limits: CARD_ART_LIMITS },
        env: {}, execArgv: [],
      });
      worker.on('error', () => {});
      worker.on('exit', () => { if (this.worker === worker) this.worker = undefined; });
      this.worker = worker;
    }
    const worker = this.worker;
    // No image bytes, provider error text or incidental library diagnostics enter server logs.
    worker.stdout?.resume(); worker.stderr?.resume();
    const id = `${++this.sequence}-${randomUUID()}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(this.timer);
        worker.off('message', message); worker.off('error', failure); worker.off('exit', failure);
      };
      const failure = () => {
        cleanup();
        if (this.worker === worker) this.worker = undefined;
        void worker.terminate();
        reject(new ArtProcessingError('scan_unavailable'));
      };
      const message = (result: { id?: string; ok?: boolean; code?: string } & Partial<ProcessedArt>) => {
        if (result.id !== id) return;
        cleanup();
        if (!result.ok) {
          reject(new ArtProcessingError(result.code === 'invalid_image' || result.code === 'image_dimensions' ? result.code : 'scan_unavailable'));
          return;
        }
        if (!(result.png instanceof Uint8Array) || !Number.isInteger(result.width) || !Number.isInteger(result.height)) {
          reject(new ArtProcessingError('scan_unavailable'));
          return;
        }
        resolve({ png: result.png, width: result.width!, height: result.height!, predictions: result.predictions, model: CARD_ART_MODEL });
      };
      worker.on('message', message); worker.once('error', failure); worker.once('exit', failure);
      this.timer = setTimeout(failure, this.timeout);
      worker.postMessage({ id, bytes, mime });
    });
  }
  async close() {
    this.closed = true;
    if (this.worker) await this.worker.terminate();
    await this.chain.catch(() => {});
    clearTimeout(this.timer);
  }
}
