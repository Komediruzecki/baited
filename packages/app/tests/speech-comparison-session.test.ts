import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ComparisonSession, type LabDependencies, type LabProvider, type LabState } from '../client/speech-bench/comparison-session';
import { pcmFingerprint } from '../client/speech-bench/audio';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function fixture() {
  const pcm = Float32Array.of(.1, -.5, .2);
  const capture = deferred<Float32Array>();
  const events: string[] = [];
  const states: LabState[] = [];
  let openModels = 0, maxOpenModels = 0, captureCalls = 0, trackOpen = false;
  const models: Array<{ provider: LabProvider; load: ReturnType<typeof deferred<void>>;
    pass: ReturnType<typeof deferred<{ transcript: string; report: Record<string, unknown> }>>;
    progress: (message: string) => void; closed: boolean }> = [];
  const inputs: Float32Array[] = [];
  const dependencies: LabDependencies = {
    recorder(progress) {
      return {
        capture() { captureCalls++; trackOpen = true; progress(0); return capture.promise; },
        finish() { trackOpen = false; capture.resolve(pcm); },
        close() { trackOpen = false; events.push('mic closed'); },
      };
    },
    decode: async () => ({ pcm, fingerprint: pcmFingerprint(pcm) }),
    now: () => performance.now(), metadata: () => ({ fixture: true }),
    model(provider, progress) {
      assert.equal(trackOpen, false, 'the microphone must be released before loading a model');
      openModels++; maxOpenModels = Math.max(maxOpenModels, openModels);
      const model = { provider, load: deferred<void>(), pass: deferred<{ transcript: string; report: Record<string, unknown> }>(), progress, closed: false };
      models.push(model); events.push(`${provider} created`);
      return {
        load: () => model.load.promise,
        transcribe: async (clip) => { inputs.push(clip.pcm); return model.pass.promise; },
        close() { if (!model.closed) { model.closed = true; openModels--; events.push(`${provider} closed`); } },
      };
    },
  };
  const session = new ComparisonSession(dependencies, (state) => states.push(state));
  const record = async () => { const task = session.record(10); session.finishRecording(); await task; };
  const finishModel = async (index: number, transcript = 'banana') => {
    models[index].load.resolve(); await settle(); models[index].pass.resolve({ transcript, report: { metric: null } }); await settle();
  };
  return { session, dependencies, record, finishModel, pcm, capture, models, inputs, events, states,
    captureCalls: () => captureCalls, trackOpen: () => trackOpen, maxOpenModels: () => maxOpenModels };
}

test('one microphone capture feeds identical PCM to both models, unloading before the next', async () => {
  const f = fixture(); await f.record();
  const compare = f.session.compare('both', 'en', 'OBS idle');
  await f.finishModel(0); await f.finishModel(1); await compare;
  assert.equal(f.captureCalls(), 1);
  assert.equal(f.maxOpenModels(), 1);
  assert.equal(f.inputs[0], f.inputs[1]);
  assert.deepEqual(f.inputs[0], f.pcm);
  assert.ok(f.events.indexOf('moonshine closed') < f.events.indexOf('whisper created'));
  assert.equal(f.session.state.phase, 'complete');
  assert.equal(f.session.state.results.length, 2);
  assert.equal(f.session.state.results[0].report.pcmFingerprint, f.session.state.results[1].report.pcmFingerprint);
});

test('cancel during model load clears busy immediately, keeps clip and blocks stale completion/progress', async () => {
  const f = fixture(); await f.record();
  const old = f.session.compare('both', 'en', 'old');
  f.session.cancel(); await old;
  assert.equal(f.session.state.busy, false);
  assert.equal(f.models[0].closed, true);
  assert.equal(f.session.state.clip?.pcm, f.pcm);
  const retry = f.session.compare('whisper', 'en', 'retry');
  f.models[0].progress('stale loading'); f.models[0].load.resolve();
  f.models[0].pass.resolve({ transcript: 'stale transcript', report: {} }); await settle();
  assert.notEqual(f.session.state.message, 'stale loading');
  await f.finishModel(1, 'current transcript'); await retry;
  assert.deepEqual(f.session.state.results.map(r => r.transcript), ['current transcript']);
});

test('cancel during microphone permission/capture stops input; late audio cannot replace a file', async () => {
  const f = fixture(), pending = f.session.record(15);
  assert.equal(f.trackOpen(), true);
  f.session.cancel(); await pending;
  assert.equal(f.trackOpen(), false);
  await f.session.readFile(new File(['fixture'], 'chosen.wav'));
  f.capture.resolve(new Float32Array([1])); await settle();
  assert.equal(f.session.state.clip?.name, 'chosen.wav');
  assert.deepEqual(f.session.state.clip?.pcm, f.pcm);
  assert.equal(f.models.length, 0);
});

test('cancel mid-pass preserves completed results and supports single-model retry without recapture', async () => {
  const f = fixture(); await f.record();
  const both = f.session.compare('both', 'en', 'first');
  await f.finishModel(0, 'Moonshine result');
  f.models[1].load.resolve(); await settle();
  f.session.cancel(); await both;
  assert.deepEqual(f.session.state.results.map(r => r.transcript), ['Moonshine result']);
  const retry = f.session.compare('whisper', 'en', 'retry');
  assert.equal(f.session.state.results.length, 1, 'retry must keep the useful first result');
  f.models[1].pass.resolve({ transcript: 'canceled', report: {} }); await settle();
  await f.finishModel(2, 'Whisper retry'); await retry;
  assert.deepEqual(f.session.state.results.map(r => r.transcript), ['Moonshine result', 'Whisper retry']);
  assert.equal(f.captureCalls(), 1);
});

test('worker errors release the model and retain input/results for retry', async () => {
  const f = fixture(); await f.record();
  const both = f.session.compare('both', 'en', 'error test');
  await f.finishModel(0);
  f.models[1].load.reject(new Error('Whisper files unavailable')); await both;
  assert.equal(f.session.state.phase, 'error');
  assert.equal(f.session.state.busy, false);
  assert.equal(f.models[1].closed, true);
  assert.equal(f.session.state.results.length, 1);
  assert.equal(f.session.state.clip?.pcm, f.pcm);
  f.models[1].progress('late error progress');
  assert.equal(f.session.state.message, 'Whisper files unavailable');
});

test('duplicate compare clicks cannot create concurrent model residents', async () => {
  const f = fixture(); await f.record();
  const first = f.session.compare('moonshine', 'en', 'first');
  await f.session.compare('whisper', 'en', 'second');
  assert.equal(f.models.length, 1);
  await f.finishModel(0); await first;
});

test('worker failure during transcription keeps the earlier result and permits a fresh worker retry', async () => {
  const f = fixture(); await f.record();
  const both = f.session.compare('both', 'en', 'interrupted worker');
  await f.finishModel(0, 'saved Moonshine result');
  f.models[1].load.resolve(); await settle();
  f.models[1].pass.reject(new Error('Whisper worker stopped')); await both;
  assert.equal(f.session.state.busy, false);
  assert.equal(f.models[1].closed, true);
  assert.equal(f.session.state.clip?.pcm, f.pcm);
  const retry = f.session.compare('whisper', 'en', 'retry');
  await f.finishModel(2, 'retried Whisper result'); await retry;
  assert.deepEqual(f.session.state.results.map(result => result.transcript), ['saved Moonshine result', 'retried Whisper result']);
  assert.equal(f.maxOpenModels(), 1);
});

test('cancel during file decoding prevents late decoded audio replacing the next clip', async () => {
  const f = fixture(), decode = deferred<{ pcm: Float32Array; fingerprint: string }>();
  f.dependencies.decode = () => decode.promise;
  const read = f.session.readFile(new File(['fixture'], 'old.wav'));
  f.session.cancel(); await read;
  await f.record();
  decode.resolve({ pcm: new Float32Array([0]), fingerprint: 'old' }); await settle();
  assert.equal(f.session.state.clip?.source, 'microphone');
  assert.equal(f.session.state.clip?.fingerprint, pcmFingerprint(f.pcm));
});

test('Croatian and oversized clips are rejected before constructing an incompatible model', async () => {
  const f = fixture(); await f.record();
  await f.session.compare('both', 'hr', 'Croatian');
  assert.match(f.session.state.message, /Whisper only/);
  assert.equal(f.models.length, 0);
  f.dependencies.decode = async () => ({ pcm: new Float32Array(16000 * 61), fingerprint: 'long' });
  await f.session.readFile(new File(['fixture'], 'long.wav'));
  await f.session.compare('both', 'en', 'long');
  assert.match(f.session.state.message, /one minute/);
  assert.equal(f.models.length, 0);
});

test('reattaching after effect cleanup restores observable retry without reviving the old run', async () => {
  const f = fixture(); await f.record();
  const abandoned = f.session.compare('moonshine', 'en', 'effect cleanup');
  f.session.destroy(); await abandoned;
  const updates: LabState[] = [];
  f.session.observe(state => updates.push(state));
  await f.session.readFile(new File(['fixture'], 'new.wav'));
  const retry = f.session.compare('whisper', 'en', 'effect setup');
  f.models[0].load.resolve(); f.models[0].progress('stale');
  await f.finishModel(1, 'new result'); await retry;
  assert.equal(updates.at(-1)?.phase, 'complete');
  assert.deepEqual(updates.at(-1)?.results.map(result => result.transcript), ['new result']);
});
