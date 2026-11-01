import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WhisperBench, type BenchWorker } from '../client/speech-bench/whisper-client.js';
import { verifyWhisperManifest } from '../client/speech-bench/manifest.js';
import { ONNX_VERSION, TRANSFORMERS_VERSION, WHISPER_MODEL, WHISPER_REVISION } from '../client/speech-bench/whisper-client.js';
import { decodeBenchAudio, inspectBenchWav, pcmFingerprint } from '../client/speech-bench/audio.js';
import { allowedSpeechAssetRequest } from '../client/speech-bench/asset-policy.js';

class FakeWorker implements BenchWorker {
  onmessage: BenchWorker['onmessage'] = null;
  onerror: BenchWorker['onerror'] = null;
  terminated = false;
  messages: Array<{ id: number; type: string; audio?: Float32Array; language?: string }> = [];
  postMessage(value: unknown) { this.messages.push(value as typeof this.messages[number]); }
  terminate() { this.terminated = true; }
  reply(result?: unknown) {
    this.onmessage?.({ data: { id: this.messages.at(-1)?.id, type: 'done', result } } as MessageEvent);
  }
}
function setup(timeouts?: { load: number; transcribe: number }) {
  const workers: FakeWorker[] = [];
  const progress: string[] = [];
  const bench = new WhisperBench(() => { const worker = new FakeWorker(); workers.push(worker); return worker; },
    (message) => progress.push(message), timeouts);
  return { bench, workers, progress };
}

test('load is explicit; cancel rejects every pending operation and terminates the worker', async () => {
  const { bench, workers } = setup();
  assert.equal(workers.length, 0);
  const pending = bench.load();
  assert.equal(workers.length, 1);
  bench.close();
  await assert.rejects(pending, /stopped/);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[0].onmessage, null);
});

test('loading timeout terminates a hung worker; a fresh load succeeds', async () => {
  const { bench, workers } = setup({ load: 15, transcribe: 15 });
  await assert.rejects(bench.load(), /loading timed out/);
  assert.equal(workers[0].terminated, true);
  const load = bench.load(); workers[1].reply(); await load;
  bench.close();
});

test('stale progress and replies cannot complete a replacement model load', async () => {
  const { bench, workers, progress } = setup();
  const first = bench.load();
  const staleHandler = workers[0].onmessage!;
  const firstRejected = assert.rejects(first, /stopped/);
  const second = bench.load();
  staleHandler({ data: { id: 1, type: 'progress', message: 'old progress' } } as MessageEvent);
  staleHandler({ data: { id: 1, type: 'done' } } as MessageEvent);
  assert.deepEqual(progress, []);
  assert.equal(workers[0].terminated, true);
  workers[1].reply(); await second; await firstRejected;
  bench.close();
});

test('recognition uses a copy of the same PCM, accepts Croatian and returns raw text only', async () => {
  const { bench, workers } = setup();
  const load = bench.load(); workers[0].reply(); await load;
  const original = new Float32Array([.1, -.1]);
  const result = bench.transcribe(original, 'hr');
  const message = workers[0].messages.at(-1)!;
  assert.equal(message.language, 'hr');
  assert.notEqual(message.audio, original);
  assert.deepEqual(message.audio, original);
  workers[0].reply({ text: 'Zovem mamac.', inferenceMs: 12, audioSeconds: .000125 });
  assert.deepEqual(await result, { text: 'Zovem mamac.', inferenceMs: 12, audioSeconds: .000125 });
  assert.equal(original.length, 2);
  bench.close();
});

test('recognition timeout terminates inference, unloads model and refuses stale reuse', async () => {
  const { bench, workers } = setup({ load: 30, transcribe: 15 });
  const load = bench.load(); workers[0].reply(); await load;
  await assert.rejects(bench.transcribe(new Float32Array([.1]), 'en'), /recognition timed out/);
  assert.equal(workers[0].terminated, true);
  await assert.rejects(bench.transcribe(new Float32Array([.1]), 'en'), /Load Whisper/);
});

test('runtime error rejects the request and releases the worker', async () => {
  const { bench, workers } = setup();
  const load = bench.load();
  workers[0].onerror?.({} as ErrorEvent);
  await assert.rejects(load, /stopped unexpectedly/);
  assert.equal(workers[0].terminated, true);
});

test('invalid audio and overlapping work never enter inference', async () => {
  const { bench, workers } = setup();
  const load = bench.load(); workers[0].reply(); await load;
  await assert.rejects(bench.transcribe(new Float32Array(), 'en'), /finite mono/);
  await assert.rejects(bench.transcribe(new Float32Array([NaN]), 'en'), /finite mono/);
  await assert.rejects(bench.transcribe(new Float32Array(16000 * 60 + 1), 'en'), /one minute/);
  const pending = bench.transcribe(new Float32Array([.1]), 'en');
  await assert.rejects(bench.transcribe(new Float32Array([.1]), 'en'), /already working/);
  bench.close(); await assert.rejects(pending, /stopped/);
});

test('PCM fingerprint compares the decoded samples, including typed-array offsets', () => {
  const pcm = new Float32Array([.1, .2, .3]);
  assert.equal(pcmFingerprint(pcm), pcmFingerprint(pcm.slice()));
  assert.equal(pcmFingerprint(pcm.subarray(1)), pcmFingerprint(new Float32Array([.2, .3])));
  assert.notEqual(pcmFingerprint(pcm), pcmFingerprint(new Float32Array([.1, .2, .4])));
});

function wav(seconds = 1, channels = 1, sampleRate = 8000, bits = 16, encoding = 1) {
  const blockAlign = channels * bits / 8, size = seconds * sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + size), view = new DataView(buffer);
  const tag = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  tag(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, encoding, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, bits, true); tag(36, 'data'); view.setUint32(40, size, true);
  return buffer;
}

test('WAV preflight bounds channels, sample rate and duration before any browser decode', async () => {
  assert.deepEqual(inspectBenchWav(wav(1, 2, 48000, 32, 3), 60), { duration: 1, channels: 2, sampleRate: 48000 });
  assert.equal(inspectBenchWav(wav(60), 60).duration, 60);
  assert.throws(() => inspectBenchWav(wav(61), 60), /up to one minute/);
  assert.throws(() => inspectBenchWav(wav(301)), /up to five minutes/);
  for (const bytes of [wav(1, 8), wav(1, 1, 192000), wav(1, 1, 8000, 16, 6), new TextEncoder().encode('not a WAV').buffer]) {
    assert.throws(() => inspectBenchWav(bytes), /uncompressed PCM or float WAV/);
  }
  // Node has no OfflineAudioContext. Rejection here proves validation precedes creating the decoder.
  await assert.rejects(decodeBenchAudio(new File([wav(61)], 'long.wav'), 60), /up to one minute/);
  await assert.rejects(decodeBenchAudio(new File(['compressed input'], 'clip.mp3')), /uncompressed PCM or float WAV/);
});

test('WAV preflight rejects misleading frame metadata and incomplete payloads', () => {
  const badAlignment = wav(); new DataView(badAlignment).setUint16(32, 1, true);
  const badRate = wav(); new DataView(badRate).setUint32(28, 1, true);
  const truncated = wav().slice(0, -2); new DataView(truncated).setUint32(4, truncated.byteLength - 8, true);
  for (const bytes of [badAlignment, badRate, truncated]) assert.throws(() => inspectBenchWav(bytes), /WAV/);
});

test('worker request policy permits model reads only, rejecting uploads and off-origin fallback', () => {
  const origin = 'http://127.0.0.1:3340';
  assert.equal(allowedSpeechAssetRequest('/speech-bench-assets/models/Xenova/whisper-tiny/config.json', 'GET', origin), true);
  for (const [url, method] of [
    ['https://huggingface.co/Xenova/whisper-tiny/config.json', 'GET'],
    ['/speech-bench-assets/models/audio', 'POST'], ['/api/transcribe', 'POST'],
    ['/api/rooms', 'GET'], ['/speech-bench-assets/../api/rooms', 'GET'],
    ['https://cdn.jsdelivr.net/runtime.js', 'GET'], ['blob:http://127.0.0.1:3340/example', 'GET'],
  ]) assert.equal(allowedSpeechAssetRequest(url, method, origin), false, `${method} ${url}`);
});


test('missing, HTML-fallback and malformed manifests give actionable setup instructions', async () => {
  for (const response of [
    new Response('Not found', { status: 404 }),
    new Response('<!DOCTYPE html><html></html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    new Response('null', { headers: { 'Content-Type': 'application/json' } }),
  ]) await assert.rejects(verifyWhisperManifest(response), /Run the local asset preparation script.*BAITED_SPEECH_ASSET_DIR/);
});

test('only the pinned manifest is accepted before loading the runtime', async () => {
  const manifest = { format: 'baited-local-whisper-assets-v1', model: WHISPER_MODEL,
    revision: WHISPER_REVISION, transformers: TRANSFORMERS_VERSION, onnx: ONNX_VERSION };
  const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  await verifyWhisperManifest(response(manifest));
  await assert.rejects(verifyWhisperManifest(response({ ...manifest, revision: 'main' })), /do not match this bench version/);
});
