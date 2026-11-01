/// <reference lib="webworker" />
import { WHISPER_MAX_SECONDS, WHISPER_MODEL, WHISPER_REVISION } from './whisper-client';
import { verifyWhisperManifest } from './manifest';
import { SPEECH_ASSET_PREFIX } from './asset-policy';
import { createWhisperAssetFetch } from './asset-fetch';

declare const self: DedicatedWorkerGlobalScope;
const ASSETS = SPEECH_ASSET_PREFIX;
type Recognizer = (audio: Float32Array, options: object) => Promise<{ text: string; chunks?: unknown[] }>;
let recognizer: Recognizer | undefined;
let busy = false;

// Installed before loading Transformers. Model fetches can only read pinned local assets.
const fetchLocal = self.fetch.bind(self);

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  if (busy) { self.postMessage({ id, type: 'error', message: 'Whisper is already working.' }); return; }
  busy = true;
  try {
    if (type === 'load') {
      self.fetch = await createWhisperAssetFetch(fetchLocal, self.location.origin);
      await verifyWhisperManifest(await fetch(`${ASSETS}manifest.json`));
      const moduleUrl = `${ASSETS}runtime/transformers.min.js`;
      const { env, pipeline } = await import(/* @vite-ignore */ moduleUrl);
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = `${ASSETS}models/`;
      env.useBrowserCache = false;
      env.useWasmCache = false; // This cache imports blob URLs, which the application CSP forbids.
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      env.backends.onnx.wasm.wasmPaths = {
        mjs: new URL(`${ASSETS}runtime/ort-wasm-simd-threaded.mjs`, self.location.origin).href,
        wasm: new URL(`${ASSETS}runtime/ort-wasm-simd-threaded.wasm`, self.location.origin).href,
      };
      recognizer = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
        dtype: 'q8', device: 'wasm', local_files_only: true, revision: WHISPER_REVISION,
        progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
          if (progress.status === 'progress') self.postMessage({ id, type: 'progress',
            message: `Loading Whisper ${Math.round(progress.progress ?? 0)}%${progress.file ? ` · ${progress.file.split('/').at(-1)}` : ''}` });
        },
      });
      self.postMessage({ id, type: 'done' });
    } else if (type === 'transcribe') {
      if (!recognizer) throw new Error('Load Whisper first.');
      if (!(data.audio instanceof Float32Array) || data.audio.length < 1 || data.audio.length > 16000 * WHISPER_MAX_SECONDS ||
        !['en', 'hr'].includes(data.language)) throw new Error('Invalid comparison audio or language.');
      const start = performance.now();
      const output = await recognizer(data.audio, {
        language: data.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5,
        return_timestamps: data.wordTimestamps === true ? 'word' : false,
      });
      self.postMessage({ id, type: 'done', result: { text: output.text.trim(), inferenceMs: performance.now() - start,
        audioSeconds: data.audio.length / 16000,
        ...(data.wordTimestamps === true ? { chunks: output.chunks ?? [] } : {}) } });
    } else throw new Error('Unknown speech bench request.');
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error instanceof Error ? error.message : 'Whisper could not complete the comparison.' });
  } finally { busy = false; }
};
