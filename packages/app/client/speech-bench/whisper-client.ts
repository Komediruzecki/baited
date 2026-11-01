export type WhisperLanguage = 'en' | 'hr';
export const WHISPER_MODEL = 'Xenova/whisper-tiny';
export const WHISPER_REVISION = '5332fcc35e32a33b86612b9a57a89be7906102b1';
export const TRANSFORMERS_VERSION = '4.3.1';
export const ONNX_VERSION = '1.31.0-dev.20260914-8d85527a0';
export const WHISPER_MAX_SECONDS = 60;
export type WhisperResult = { text: string; inferenceMs: number; audioSeconds: number };

/** Narrow interface keeps the cancellation contract testable without browser/model downloads. */
export interface BenchWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** A disposable worker per load. A timeout kills inference, not just the waiting promise. */
export class WhisperBench {
  private worker: BenchWorker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private ready = false;
  constructor(private factory: () => BenchWorker, private progress: (message: string) => void,
    private timeouts = { load: 120_000, transcribe: 180_000 }) {}

  async load(): Promise<void> {
    this.close();
    const worker = this.factory();
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
      const pending = this.pending.get(data?.id);
      if (!pending) return;
      if (data.type === 'progress') { this.progress(String(data.message)); return; }
      if (data.type === 'error') { this.close(new Error(String(data.message))); return; }
      clearTimeout(pending.timer);
      this.pending.delete(data.id);
      pending.resolve(data.result);
    };
    worker.onerror = () => {
      if (this.worker === worker) this.close(new Error('Whisper stopped unexpectedly. Load it again to retry.'));
    };
    await this.request('load', {}, this.timeouts.load);
    if (this.worker !== worker) throw new Error('Whisper loading was cancelled.');
    this.ready = true;
  }

  async transcribe(pcm: Float32Array, language: WhisperLanguage): Promise<WhisperResult> {
    if (!this.ready) throw new Error('Load Whisper before running the comparison.');
    if (this.pending.size) throw new Error('Whisper is already working.');
    if (!pcm.length || pcm.length > 16000 * WHISPER_MAX_SECONDS || pcm.some((v) => !Number.isFinite(v))) {
      throw new Error('Use finite mono audio between one sample and one minute at 16 kHz.');
    }
    if (language !== 'en' && language !== 'hr') throw new Error('Choose English or Croatian.');
    const copy = pcm.slice();
    return this.request('transcribe', { audio: copy, language }, this.timeouts.transcribe, [copy.buffer]) as Promise<WhisperResult>;
  }

  close(reason = new Error('Whisper stopped. Load it again to continue.')): void {
    const old = this.worker;
    this.worker = null;
    this.ready = false;
    if (old) { old.onmessage = null; old.onerror = null; old.terminate(); }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(reason); }
    this.pending.clear();
  }

  private request(type: string, payload: object, timeout: number, transfer: Transferable[] = []): Promise<unknown> {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error('Whisper worker is not loaded.'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.worker === worker && this.pending.has(id)) {
          this.close(new Error(`Whisper ${type === 'load' ? 'loading' : 'recognition'} timed out. Its worker was stopped. Try a shorter clip or reload the model.`));
        }
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { worker.postMessage({ id, type, ...payload }, transfer); }
      catch { this.close(new Error('Whisper could not receive the audio. Load the model and try again.')); }
    });
  }
}
