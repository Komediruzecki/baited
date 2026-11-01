import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { MicrophoneSample, type MicrophoneSampleDependencies } from '../client/speech-bench/mic-sample';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let index = 0; index < 8; index++) await Promise.resolve(); }

function browser(t: TestContext, options: { resumeError?: Error; module?: Promise<void>; observerThrows?: boolean } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  class Track extends EventTarget {
    readyState = 'live'; muted = false; stops = 0;
    stop() { this.readyState = 'ended'; this.stops++; }
  }
  class Node {
    disconnects = 0;
    connect() {}
    disconnect() { this.disconnects++; }
  }
  class Context extends EventTarget {
    state = 'suspended'; resumeCalls = 0; closeCalls = 0;
    destination = {}; source = new Node(); mute = Object.assign(new Node(), { gain: { value: 1 } });
    modules: string[] = [];
    audioWorklet = { addModule: (path: string) => { this.modules.push(path); return options.module ?? Promise.resolve(); } };
    resume() {
      this.resumeCalls++;
      if (options.resumeError) return Promise.reject(options.resumeError);
      this.state = 'running'; return Promise.resolve();
    }
    close() { this.closeCalls++; this.change('closed'); return Promise.resolve(); }
    change(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
    createMediaStreamSource() { return this.source; }
    createGain() { return this.mute; }
  }
  class Worklet extends Node {
    onprocessorerror: (() => void) | null = null;
    sent: { enabled: boolean; generation: number; flush?: boolean }[] = [];
    closes = 0;
    port = {
      onmessage: null as ((event: { data: { buffer?: ArrayBuffer; generation: number; flushed?: boolean } }) => void) | null,
      postMessage: (message: { enabled: boolean; generation: number; flush?: boolean }) => { this.sent.push(message); },
      close: () => { this.closes++; },
    };
    packet(values: number[] | Int16Array, generation = this.sent[0].generation) {
      this.port.onmessage?.({ data: { buffer: Int16Array.from(values).buffer, generation } });
    }
    flush() { this.port.onmessage?.({ data: { flushed: true, generation: this.sent[0].generation } }); }
  }
  const contexts: Context[] = [], worklets: Worklet[] = [];
  const requests: ReturnType<typeof deferred<MediaStream>>[] = [], constraints: MediaStreamConstraints[] = [];
  const dependencies: MicrophoneSampleDependencies = {
    createContext: () => { const context = new Context(); contexts.push(context); return context as unknown as AudioContext; },
    getUserMedia: (value) => { constraints.push(value); const request = deferred<MediaStream>(); requests.push(request); return request.promise; },
    createWorklet: () => { const worklet = new Worklet(); worklets.push(worklet); return worklet as unknown as AudioWorkletNode; },
  };
  const levels: number[] = [];
  const recorder = new MicrophoneSample((value) => {
    levels.push(value); if (options.observerThrows) throw new Error('UI failed');
  }, dependencies);
  t.after(() => recorder.close());
  const stream = () => {
    const track = new Track();
    return { track, value: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream };
  };
  const start = async (seconds = 5) => {
    const promise = recorder.capture(seconds);
    const media = stream(); requests.at(-1)!.resolve(media.value);
    await settle();
    return { promise, ...media, context: contexts.at(-1)!, worklet: worklets.at(-1)! };
  };
  return { recorder, start, stream, requests, constraints, contexts, worklets, levels };
}

test('capture begins context activation and permission in the click, with one active request', async (t) => {
  const env = browser(t);
  const promise = env.recorder.capture();
  assert.equal(env.contexts.length, 1);
  assert.equal(env.contexts[0].resumeCalls, 1);
  assert.equal(env.requests.length, 1);
  assert.equal(env.recorder.capture(), promise);
  assert.deepEqual(env.constraints, [{ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }]);
  env.recorder.finish();
  assert.deepEqual(await promise, new Float32Array());
  const late = env.stream(); env.requests[0].resolve(late.value); await settle();
  assert.equal(late.track.stops, 1);
  assert.equal(env.contexts[0].closeCalls, 1);
  assert.equal(env.worklets.length, 0);
});

test('finish releases the device immediately and retains the worklet tail as normalized 16k samples', async (t) => {
  const env = browser(t), active = await env.start();
  assert.deepEqual(active.context.modules, ['/pcm-worklet.js']);
  assert.equal(active.context.mute.gain.value, 0);
  active.worklet.packet([-32768, 0, 32767]);
  active.worklet.packet([1000], active.worklet.sent[0].generation + 1);
  env.recorder.finish();
  assert.equal(active.track.stops, 1, 'device is free before inference can start');
  assert.equal(active.context.source.disconnects, 1);
  assert.deepEqual(active.worklet.sent.at(-1), { enabled: false, flush: true, generation: 1 });
  active.worklet.packet([16384]); active.worklet.flush();
  assert.deepEqual(await active.promise, Float32Array.of(-1, 0, 32767 / 32768, .5));
  assert.equal(active.context.closeCalls, 1);
  assert.equal(active.worklet.closes, 1);
  assert.equal(env.levels.at(-1), 0);
});

test('oversized duration and packet overflow never exceed five seconds or 80,000 samples', async (t) => {
  const env = browser(t), active = await env.start(100);
  for (let index = 0; index < 40; index++) active.worklet.packet(new Int16Array(2048).fill(8192));
  const sample = await active.promise;
  assert.equal(sample.length, 80000);
  assert.equal(sample[79999], .25);
  assert.equal(active.track.stops, 1);
  assert.equal(active.context.closeCalls, 1);
  assert.equal(active.worklet.port.onmessage, null);
});

test('a shorter requested duration bounds both sample count and capture time', async (t) => {
  const env = browser(t), active = await env.start(.1);
  active.worklet.packet(new Int16Array(2048).fill(1));
  assert.equal((await active.promise).length, 1600);
  assert.equal(active.track.stops, 1);
});

test('wall deadline releases the microphone even when worklet packets stop', async (t) => {
  const env = browser(t), active = await env.start();
  active.worklet.packet([10, 20]);
  t.mock.timers.tick(4999);
  assert.equal(active.track.stops, 0);
  t.mock.timers.tick(1);
  assert.equal(active.track.stops, 1);
  t.mock.timers.tick(250);
  assert.equal((await active.promise).length, 2);
  assert.equal(active.context.closeCalls, 1);
});

test('finish is idempotent and its drain has a deadline', async (t) => {
  const env = browser(t), active = await env.start();
  active.worklet.packet([100]);
  env.recorder.finish(); env.recorder.finish();
  assert.equal(active.worklet.sent.filter(value => value.flush).length, 1);
  t.mock.timers.tick(250);
  assert.equal((await active.promise).length, 1);
  assert.equal(active.track.stops, 1);
});

test('close rejects pending permission and a stale grant cannot replace the next capture', async (t) => {
  const env = browser(t), old = env.recorder.capture();
  const rejected = assert.rejects(old, { name: 'AbortError' });
  env.recorder.close(); await rejected;
  const current = await env.start();
  const late = env.stream(); env.requests[0].resolve(late.value); await settle();
  assert.equal(late.track.stops, 1);
  assert.equal(current.track.stops, 0);
  current.worklet.packet([1]); env.recorder.finish(); current.worklet.flush();
  assert.equal((await current.promise).length, 1);
});

test('permission timeout is bounded and any later granted stream is stopped', async (t) => {
  const env = browser(t), promise = env.recorder.capture();
  const rejected = assert.rejects(promise, /timed out/);
  t.mock.timers.tick(15000); await rejected;
  const late = env.stream(); env.requests[0].resolve(late.value); await settle();
  assert.equal(late.track.stops, 1);
  assert.equal(env.contexts[0].closeCalls, 1);
});

test('a failed audio activation is observed while permission remains pending', async (t) => {
  const env = browser(t, { resumeError: new Error('blocked') });
  await assert.rejects(env.recorder.capture(), /could not start/);
  const late = env.stream(); env.requests[0].resolve(late.value); await settle();
  assert.equal(late.track.stops, 1);
});

for (const [name, message] of [
  ['NotAllowedError', /permission was denied/],
  ['NotFoundError', /No microphone was found/],
  ['NotReadableError', /microphone is unavailable/],
] as const) {
  test(`${name} rejects with a next step and releases the context`, async (t) => {
    const env = browser(t), promise = env.recorder.capture();
    env.requests[0].reject(new DOMException('failed', name));
    await assert.rejects(promise, message);
    assert.equal(env.contexts[0].closeCalls, 1);
  });
}

for (const fault of ['ended', 'mute', 'suspended', 'interrupted', 'closed', 'processorerror'] as const) {
  test(`${fault} cancels the sample, releases audio and does not automatically reacquire`, async (t) => {
    const env = browser(t), active = await env.start();
    const rejected = assert.rejects(active.promise, /microphone|audio/i);
    if (fault === 'ended' || fault === 'mute') active.track.dispatchEvent(new Event(fault));
    else if (fault === 'processorerror') active.worklet.onprocessorerror?.();
    else active.context.change(fault);
    await rejected;
    assert.equal(active.track.stops, 1);
    assert.equal(active.context.closeCalls, 1);
    active.context.change('running'); active.track.dispatchEvent(new Event('unmute'));
    t.mock.timers.tick(20000);
    assert.equal(env.requests.length, 1);
    assert.equal(env.levels.at(-1), 0);
  });
}

test('close during worklet setup rejects and prevents late setup from reconnecting audio', async (t) => {
  const module = deferred<void>(), env = browser(t, { module: module.promise });
  const promise = env.recorder.capture(), media = env.stream();
  env.requests[0].resolve(media.value); await settle();
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  env.recorder.close(); await rejected;
  module.resolve(); await settle();
  assert.equal(media.track.stops, 1);
  assert.equal(env.worklets.length, 0);
});

test('close during tail drain rejects instead of returning a canceled sample', async (t) => {
  const env = browser(t), active = await env.start();
  env.recorder.finish();
  const rejected = assert.rejects(active.promise, { name: 'AbortError' });
  env.recorder.close(); await rejected;
  t.mock.timers.tick(250);
  assert.equal(active.track.stops, 1);
  assert.equal(active.context.closeCalls, 1);
});

test('an invalid worklet packet cancels instead of accumulating arbitrary data', async (t) => {
  const env = browser(t), active = await env.start();
  const rejected = assert.rejects(active.promise, /invalid audio packet/);
  active.worklet.packet(new Int16Array(2049));
  await rejected;
  assert.equal(active.track.stops, 1);
});

test('a broken level observer cannot retain the microphone', async (t) => {
  const env = browser(t, { observerThrows: true }), active = await env.start(.01);
  active.worklet.packet(new Int16Array(160));
  assert.equal((await active.promise).length, 160);
  assert.equal(active.track.stops, 1);
});

test('invalid durations do not acquire microphone permission', async (t) => {
  const env = browser(t);
  for (const seconds of [0, -1, Number.NaN, Infinity, .000001])
    await assert.rejects(env.recorder.capture(seconds), /sample/);
  assert.equal(env.requests.length, 0);
});
