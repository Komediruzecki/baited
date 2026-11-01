import { pcmFingerprint, type BenchAudio } from './audio';
import type { WhisperLanguage } from './whisper-client';

export type LabProvider = 'moonshine' | 'whisper';
export type LabPlan = LabProvider | 'both';
export type LabClip = BenchAudio & { name: string; source: 'microphone' | 'file'; fileBytes?: number };
export type LabResult = { provider: LabProvider; transcript: string; failure?: string; report: Record<string, unknown> };
export type LabPhase = 'idle' | 'reading' | 'permission' | 'recording' | 'loading' | 'running' | 'complete' | 'error';
export type LabState = {
  phase: LabPhase; busy: boolean; message: string; provider: LabProvider | null;
  clip: LabClip | null; results: LabResult[]; seconds: number; level: number;
};
export interface LabModel {
  load(): Promise<void>;
  transcribe(clip: LabClip, language: WhisperLanguage, signal: AbortSignal): Promise<{ transcript: string; report: Record<string, unknown> }>;
  close(): void;
}
export interface LabRecorder {
  capture(seconds: number): Promise<Float32Array>;
  finish(): void;
  close(): void;
}
export interface LabDependencies {
  recorder(progress: (seconds: number) => void, level: (value: number) => void): LabRecorder;
  decode(file: File): Promise<BenchAudio>;
  model(provider: LabProvider, progress: (message: string, seconds?: number) => void): LabModel;
  now(): number;
  metadata(): Record<string, unknown>;
}
const initial = (): LabState => ({ phase: 'idle', busy: false, message: 'Record a phrase or choose a WAV to begin.',
  provider: null, clip: null, results: [], seconds: 0, level: 0 });
const canceled = () => new DOMException('Comparison canceled.', 'AbortError');
const providerName = (provider: LabProvider) => provider === 'moonshine' ? 'Moonshine' : 'Whisper';
function errorDiagnostic(error: unknown): Record<string, unknown> | undefined {
  if (!(error instanceof Error) || !('diagnostic' in error) || !error.diagnostic || typeof error.diagnostic !== 'object') return;
  const source = error.diagnostic as Record<string, unknown>;
  const diagnostic: Record<string, unknown> = {};
  for (const key of ['stage', 'message', 'file']) {
    if (typeof source[key] === 'string') diagnostic[key] = source[key].slice(0, 400);
  }
  for (const key of ['line', 'column', 'hardwareConcurrency']) {
    if (typeof source[key] === 'number' && Number.isFinite(source[key])) diagnostic[key] = source[key];
  }
  for (const key of ['crossOriginIsolated', 'sharedArrayBuffer']) {
    if (typeof source[key] === 'boolean') diagnostic[key] = source[key];
  }
  return Object.keys(diagnostic).length ? diagnostic : undefined;
}

/** Await work without allowing a late callback to revive a canceled comparison. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(canceled());
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

/** Owns one input and at most one model. The PCM survives failure, cancel and retry. */
export class ComparisonSession {
  state: LabState = initial();
  private generation = 0;
  private abort?: AbortController;
  private recorder?: LabRecorder;
  private model?: LabModel;
  constructor(private dependencies: LabDependencies, private changed: (state: LabState) => void) {}
  /** React effect setup may follow cleanup again on the same controller. */
  observe(changed: (state: LabState) => void) { this.changed = changed; changed(this.state); }
  private update(patch: Partial<LabState>) { this.state = { ...this.state, ...patch }; this.changed(this.state); }
  private begin(phase: LabPhase, message: string) {
    const current = ++this.generation;
    this.abort = new AbortController();
    this.update({ phase, busy: true, message, provider: null, seconds: 0, level: 0 });
    return { current, signal: this.abort.signal, valid: () => current === this.generation };
  }
  private release() {
    this.abort?.abort(); this.abort = undefined;
    this.recorder?.close(); this.recorder = undefined;
    this.model?.close(); this.model = undefined;
  }
  cancel(message = 'Stopped. Your clip is ready to compare again.') {
    ++this.generation; this.release();
    this.update({ phase: 'idle', busy: false, provider: null, seconds: 0, level: 0,
      message: this.state.clip ? message : 'Stopped. Record a phrase or choose a WAV when you’re ready.' });
  }
  discard() { this.cancel(); this.update({ ...initial() }); }
  destroy() { this.changed = () => {}; this.discard(); }
  finishRecording() { this.recorder?.finish(); }
  private fail(error: unknown) {
    ++this.generation;
    this.release();
    this.update({ phase: 'error', busy: false, level: 0,
      message: error instanceof Error ? error.message : 'The comparison could not finish. Try again.' });
  }
  async record(seconds: number) {
    if (this.state.busy) return;
    const { valid, signal } = this.begin('permission', 'Allow microphone access to record your phrase.');
    try {
      const recorder = this.dependencies.recorder(
        (elapsed) => { if (valid()) this.update({ phase: 'recording', seconds: elapsed, message: 'Recording. Finish early when your phrase is complete.' }); },
        (level) => { if (valid()) this.update({ level }); });
      this.recorder = recorder;
      // Starts inside the click; no model download comes before microphone permission.
      const pcm = await abortable(recorder.capture(seconds), signal);
      if (!valid()) return;
      recorder.close(); this.recorder = undefined;
      if (!pcm.length) throw new Error('No audio was captured. Record another phrase and try again.');
      ++this.generation; this.abort = undefined;
      this.update({ clip: { pcm, fingerprint: pcmFingerprint(pcm), source: 'microphone', name: 'Microphone recording' },
        results: [], phase: 'idle', busy: false, level: 0, message: 'Recording ready. Listen back, then compare the models.' });
    } catch (error) { if (valid()) this.fail(error); }
  }
  async readFile(file: File) {
    if (this.state.busy) return;
    const { valid, signal } = this.begin('reading', 'Reading your WAV on this computer.');
    try {
      const audio = await abortable(this.dependencies.decode(file), signal);
      if (!valid()) return;
      ++this.generation; this.abort = undefined;
      this.update({ clip: { ...audio, source: 'file', name: file.name, fileBytes: file.size },
        results: [], phase: 'idle', busy: false, message: 'Audio ready. Both models will receive these same samples.' });
    } catch (error) { if (valid()) this.fail(error); }
  }
  async compare(plan: LabPlan, language: WhisperLanguage, label: string) {
    if (this.state.busy) return;
    const clip = this.state.clip;
    if (!clip) { this.update({ message: 'Record a phrase or choose a WAV first.' }); return; }
    if (language === 'hr' && plan !== 'whisper') {
      this.update({ phase: 'error', message: 'Croatian is available with Whisper only. Choose English to compare both models.' }); return;
    }
    if (plan !== 'moonshine' && clip.pcm.length > 16000 * 60) {
      this.update({ phase: 'error', message: 'Whisper accepts up to one minute. Choose a shorter clip or compare with Moonshine only.' }); return;
    }
    const { valid, signal } = this.begin('loading', 'Preparing the comparison.');
    const failed: LabProvider[] = [], completed: LabProvider[] = [];
    try {
      for (const provider of plan === 'both' ? ['moonshine', 'whisper'] as const : [plan]) {
        if (!valid() || signal.aborted) return;
        const name = providerName(provider);
        this.update({ provider, phase: 'loading', seconds: 0, message: `Loading ${name}. Your microphone is off.` });
        let model: LabModel | undefined, result: LabResult | undefined;
        let stage: 'construct' | 'load' | 'transcribe' = 'construct';
        let loadMs: number | null = null, active = true;
        const report = (details: Record<string, unknown>) => ({
          ...this.dependencies.metadata(), format: 'baited-speech-comparison-v2', ...details,
          provider, language, stage, at: new Date().toISOString(), label,
          source: clip.source, file: clip.name, fileBytes: clip.fileBytes, audioSeconds: clip.pcm.length / 16000,
          sampleRate: 16000, pcmFingerprint: clip.fingerprint, loadMs,
          privacy: 'Audio stays in this tab. No audio upload, browser speech service, game commands or scoring.',
        });
        try {
          if (!valid() || signal.aborted) return;
          model = this.dependencies.model(provider, (message, seconds) => {
            if (active && valid() && !signal.aborted && this.state.provider === provider) this.update({ message, ...(seconds === undefined ? {} : { seconds }) });
          });
          if (!valid() || signal.aborted) { model.close(); model = undefined; return; }
          this.model = model;
          stage = 'load';
          const loadingStarted = this.dependencies.now();
          await abortable(model.load(), signal);
          if (!valid() || signal.aborted) return;
          loadMs = this.dependencies.now() - loadingStarted;
          stage = 'transcribe';
          this.update({ phase: 'running', message: provider === 'moonshine'
            ? 'Moonshine is replaying your clip at its original speed.' : 'Whisper is transcribing your clip.' });
          if (!valid() || signal.aborted) return;
          const output = await abortable(model.transcribe(clip, language, signal), signal);
          if (!valid() || signal.aborted) return;
          result = { provider, transcript: output.transcript,
            report: report({ ...output.report, status: 'complete', transcript: output.transcript }) };
          completed.push(provider);
        } catch (error) {
          if (!valid() || signal.aborted) return;
          const failure = error instanceof Error ? error.message : `${name} could not finish. Try again.`;
          result = { provider, transcript: '', failure,
            report: report({ status: 'error', failure, diagnostic: errorDiagnostic(error) }) };
          failed.push(provider);
        } finally {
          active = false;
          // Cancellation may already have closed this worker. Never close a newer run's model.
          if (model && this.model === model) {
            this.model = undefined;
            model.close();
          }
        }
        if (!valid() || signal.aborted) return;
        if (result) this.update({ results: [...this.state.results.slice(-7), result] });
        // Worker termination precedes saving its result and constructing the next model.
      }
      if (valid() && !signal.aborted) {
        ++this.generation; this.abort = undefined;
        const message = !failed.length ? 'Comparison complete. Check the transcripts against your recording.'
          : completed.length ? `${failed.map(providerName).join(' and ')} could not finish. ${completed.map(providerName).join(' and ')} results are ready. Your clip is kept for retry.`
            : `${failed.map(providerName).join(' and ')} could not finish. Your clip is kept. Check the errors below, then retry a model.`;
        this.update({ phase: failed.length ? 'error' : 'complete', busy: false, provider: null, message });
      }
    } catch (error) { if (valid()) this.fail(error); }
  }
}
