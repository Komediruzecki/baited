import { Moonshine, type MoonshineLine } from '../moonshine';
import { decodeBenchAudio } from './audio';
import { abortable, type LabDependencies, type LabModel } from './comparison-session';
import { MicrophoneSample } from './mic-sample';
import { ONNX_VERSION, TRANSFORMERS_VERSION, WHISPER_MODEL, WHISPER_REVISION, WhisperBench } from './whisper-client';

type Sample = { line: MoonshineLine; deliveredMs: number; lastWordLagMs: number | null };
const percentile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null;
};
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Replay canceled.', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
  });
}
function moonshineModel(progress: (message: string, seconds?: number) => void): LabModel {
  let started = 0;
  const samples: Sample[] = [];
  let failed!: (error: Error) => void;
  const failure = new Promise<never>((_, reject) => { failed = reject; });
  // A worker error may arrive between load and replay; always observe it.
  void failure.catch(() => {});
  const worker = new Moonshine((line) => {
    const deliveredMs = performance.now() - started;
    const end = line.words.at(-1)?.end;
    samples.push({ line, deliveredMs, lastWordLagMs: end === undefined ? null : deliveredMs - end * 1000 });
  }, (message) => progress(message), (message) => failed(new Error(message)));
  return {
    load: () => Promise.race([worker.load(), failure]),
    async transcribe({ pcm }, _language, signal) {
      await abortable(Promise.race([worker.start(), failure]), signal);
      started = performance.now();
      const scheduling: number[] = [];
      for (let i = 0; i < pcm.length; i += 2048) {
        const end = Math.min(i + 2048, pcm.length), due = started + end / 16;
        await Promise.race([delay(Math.max(0, due - performance.now()), signal), failure]);
        if (signal.aborted) throw new DOMException('Replay canceled.', 'AbortError');
        scheduling.push(performance.now() - due); worker.audio(pcm.subarray(i, end));
        progress(`Moonshine: replaying ${(end / 16000).toFixed(1)} of ${(pcm.length / 16000).toFixed(1)} seconds.`, end / 16000);
      }
      await abortable(Promise.race([worker.finish(), failure]), signal);
      const transcript = samples.map((sample) => sample.line.text).join(' ');
      return { transcript, report: {
        format: 'baited-speech-comparison-v2', provider: 'moonshine', language: 'en',
        package: '@moonshine-ai/moonshine-wasm@0.1.5', model: worker.metrics.model,
        replayMode: 'Original-speed local PCM replay', elapsedMs: performance.now() - started,
        cachePolicy: 'Existing Moonshine SDK delivery and cache behavior unchanged; cold vs warm cache state was not measured.',
        totalAudioPacketProcessingMs: worker.metrics.passes.length ? worker.metrics.passes.reduce((a, b) => a + b, 0) : null,
        p95AudioPacketProcessingMs: percentile(worker.metrics.passes, .95),
        p95ReplaySchedulingDelayMs: percentile(scheduling, .95),
        p95FinalLineLagMs: percentile(samples.flatMap((sample) => sample.lastWordLagMs === null ? [] : [sample.lastWordLagMs]), .95),
        lines: samples,
        confidencePolicy: 'Moonshine 0.1.5 word confidence is an upstream constant 1.0 placeholder, not a probability. It cannot filter recognition errors.',
        processingMetric: 'Worker addAudio + transcribe calls and final flush; packet-processing timings, not isolated model inference passes.',
      } };
    },
    close: () => worker.close(),
  };
}
export const browserLabDependencies: LabDependencies = {
  recorder: (progress, level) => new MicrophoneSample(level, undefined, progress),
  decode: (file) => decodeBenchAudio(file),
  now: () => performance.now(),
  metadata: () => ({ hardwareConcurrency: navigator.hardwareConcurrency, userAgent: navigator.userAgent, crossOriginIsolated: globalThis.crossOriginIsolated }),
  model(provider, progress) {
    if (provider === 'moonshine') return moonshineModel(progress);
    const worker = new WhisperBench(() => new Worker(new URL('./whisper-worker.ts', import.meta.url), { type: 'module', name: 'baited-whisper-bench' }), progress);
    return {
      load: () => worker.load(),
      async transcribe({ pcm }, language) {
        const output = await worker.transcribe(pcm, language, { wordTimestamps: true });
        return { transcript: output.text, report: {
          format: 'baited-speech-comparison-v2', provider: 'whisper', language,
          package: `@huggingface/transformers@${TRANSFORMERS_VERSION}`, onnxRuntime: ONNX_VERSION,
          model: WHISPER_MODEL, revision: WHISPER_REVISION, dtype: 'q8', device: 'wasm', threads: 1,
          task: 'transcribe', inferenceMs: output.inferenceMs, processingToAudioRatio: output.inferenceMs / (pcm.length / 16),
          wordTimestamps: output.chunks ?? [],
          cachePolicy: 'Model and binary fetches request cache: no-store; browser model and WASM caches are disabled. Runtime imports use normal browser caching.',
          processingMetric: 'Whole-clip transcription, 30-second chunks with 5-second stride. This is not streaming latency and cannot be compared with Moonshine final-line lag.',
          confidencePolicy: 'Whisper supplies no calibrated word confidence. This result cannot award a win or submit a guess.',
        } };
      },
      close: () => worker.close(),
    };
  },
};
