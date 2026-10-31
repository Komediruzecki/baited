import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Microphone } from '../client/microphone';
import type { MoonshineLine } from '../client/moonshine';
import { VoiceGuessSession } from '../client/voice-guess';
import { localTranscript } from '../server/local-speech';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Browser fakes exercise ownership and events, without a real device or model download. */
function browser(t: TestContext, options: { holdModel?: boolean; resumeError?: Error } = {}) {
  const contexts: FakeContext[] = [];
  const worklets: FakeWorklet[] = [];
  const workers: FakeWorker[] = [];
  const requests: ReturnType<typeof deferred<MediaStream>>[] = [];
  const microphones: Microphone[] = [];
  const sockets: FakeSocket[] = [];
  class FakeTrack extends EventTarget {
    readyState = 'live';
    muted = false;
    stops = 0;
    onended: (() => void) | null = null;
    stop() { ++this.stops; this.readyState = 'ended'; }
    end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')); this.onended?.(); }
    mute() { this.muted = true; this.dispatchEvent(new Event('mute')); }
  }
  function stream() {
    const track = new FakeTrack();
    const value = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    return { track, value };
  }
  class FakeNode {
    connect() {}
    disconnect() {}
  }
  class FakeContext extends EventTarget {
    state = 'suspended';
    resumeCalls = 0;
    closeCalls = 0;
    destination = {};
    audioWorklet = { addModule: async () => {} };
    constructor() { super(); contexts.push(this); }
    resume() {
      ++this.resumeCalls;
      if (options.resumeError) return Promise.reject(options.resumeError);
      this.state = 'running';
      return Promise.resolve();
    }
    close() { ++this.closeCalls; this.setState('closed'); return Promise.resolve(); }
    setState(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
    createMediaStreamSource() { return new FakeNode(); }
    createGain() { return Object.assign(new FakeNode(), { gain: { value: 1 } }); }
  }
  class FakeWorklet extends FakeNode {
    onprocessorerror: (() => void) | null = null;
    port = { onmessage: null, postMessage: (_value: unknown) => {} };
    constructor() { super(); worklets.push(this); }
  }
  class FakeWorker {
    onmessage: ((event: { data: Record<string, unknown> }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    loadId = 0;
    generation = 0;
    constructor() { workers.push(this); }
    postMessage(message: { type: string; id?: number; generation?: number }) {
      if (message.generation !== undefined) this.generation = message.generation;
      if (!message.id) return;
      if (message.type === 'load' && options.holdModel) { this.loadId = message.id; return; }
      queueMicrotask(() => this.onmessage?.({ data: { type: 'reply', id: message.id } }));
    }
    finishLoad() { this.onmessage?.({ data: { type: 'reply', id: this.loadId } }); }
    line(line: MoonshineLine) { this.onmessage?.({ data: { type: 'line', generation: this.generation, line } }); }
    terminate() { this.terminated = true; }
  }
  class FakeSocket {
    static OPEN = 1;
    readyState = 1; bufferedAmount = 0;
    sent: string[] = [];
    onmessage: ((event: { data: string }) => void | Promise<void>) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { sockets.push(this); }
    send(value: string) { this.sent.push(value); }
    close() { this.readyState = 3; }
    async status(status: string) { await this.onmessage?.({ data: JSON.stringify({ type: 'status', status }) }); }
  }
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  replace('navigator', { mediaDevices: { getUserMedia: () => {
    const request = deferred<MediaStream>(); requests.push(request); return request.promise;
  } } });
  replace('AudioContext', FakeContext);
  replace('AudioWorkletNode', FakeWorklet);
  replace('Worker', FakeWorker);
  replace('crossOriginIsolated', true);
  replace('WebSocket', FakeSocket);
  replace('location', { href: 'http://localhost:3317', protocol: 'http:', hostname: 'localhost' });
  t.after(() => {
    for (const microphone of microphones) microphone.stop();
    for (const [name, original] of originals) {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const create = (provider: 'deepgram' | 'moonshine' = 'deepgram',
    onTranscript?: (line: MoonshineLine, segment: string) => void,
    consumeFinal?: (line: MoonshineLine, segment: string) => boolean) => {
    const statuses: string[] = [];
    const levels: number[] = [];
    const errors: string[] = [];
    const microphone = new Microphone((value) => statuses.push(value), (value) => levels.push(value),
      (value) => errors.push(value), provider, onTranscript, consumeFinal);
    microphones.push(microphone);
    return { microphone, statuses, levels, errors };
  };
  const ready = async () => {
    const result = create();
    const pending = result.microphone.enable();
    const media = stream();
    requests[0].resolve(media.value);
    assert.equal(await pending, true);
    return { ...result, ...media };
  };
  return { contexts, worklets, workers, requests, sockets, stream, create, ready };
}

test('Moonshine commands never reach scoring and do not leave gaps in final sequence', async (t) => {
  const env = browser(t), voice = new VoiceGuessSession(), previews: string[] = [], submitted: string[] = [];
  voice.setContext({ roundId: 'round', epoch: 1, leaseId: 'capture', takeId: '' });
  const { microphone, errors } = env.create('moonshine', (line) => previews.push(line.text), (line, segment) => {
    assert.equal(segment, 'round:1');
    const result = voice.receive(line);
    if (result.submit) submitted.push(result.submit.word);
    return result.consumed;
  });
  const enabling = microphone.enable(); env.requests[0].resolve(env.stream().value);
  assert.equal(await enabling, true);
  microphone.connect('round', 1, 'csrf', 'capture');
  await env.sockets[0].status('listening');
  const line = (id: string, text: string, isComplete = true): MoonshineLine => ({
    id, text, isComplete, startTime: 1, duration: 1,
    words: text.split(/\s+/).map(text => ({ text, start: 1.2, end: 1.8, confidence: .95 })),
    isUpdated: true, isNew: true, hasTextChanged: true, haveSpeakersChanged: false,
    lastTranscriptionLatencyMs: 0, speakerSpans: [],
  });
  const command = line('wake', 'Baity bot, the bait is banana');
  env.workers[0].line({ ...command, isComplete: false });
  env.workers[0].line(command);
  env.workers[0].line(command);
  env.workers[0].line(line('lock', 'Locked in'));
  env.workers[0].line(line('lock', 'Locked in'));
  assert.deepEqual(env.sockets[0].sent, []);
  assert.deepEqual(submitted, ['banana']);
  // A used guess or disabled switch removes command eligibility. Replaying an
  // already consumed provider ID must not turn its wake phrase into a catch.
  voice.setContext(null);
  env.workers[0].line(command);
  assert.deepEqual(env.sockets[0].sent, []);
  env.workers[0].line(line('ordinary', 'You will never bait me'));
  const first = JSON.parse(env.sockets[0].sent[0]);
  assert.equal(first.sequence, 1);
  assert.equal(first.line.text, 'You will never bait me');
  assert.ok(localTranscript(first, { roundId: 'round', epoch: 1, firstAudioAt: 100000, audioSeconds: 3, lastSequence: 0 }, 103000));
  env.workers[0].line(line('ordinary-2', 'Just keep talking'));
  assert.equal(JSON.parse(env.sockets[0].sent[1]).sequence, 2);
  assert.ok(previews.includes(command.text), 'commands remain visible in the local transcript');
  assert.deepEqual(errors, []);
});

test('enable unlocks audio in the click and is singleflight while Moonshine is loading', async (t) => {
  const env = browser(t, { holdModel: true });
  const { microphone } = env.create('moonshine');
  const first = microphone.enable();
  const second = microphone.enable();
  assert.equal(env.contexts.length, 1, 'create the context before awaiting a model download');
  assert.equal(env.contexts[0].resumeCalls, 1, 'resume must begin inside the enable click');
  assert.equal(first, second, 'one capture attempt owns repeated enable clicks');
  assert.equal(env.workers.length, 1);
  assert.equal(env.requests.length, 1);
  env.requests[0].resolve(env.stream().value);
  env.workers[0].finishLoad();
  assert.equal(await first, true);
  assert.equal(microphone.enabled, true);
});

test('a late permission grant after stop cannot replace a newer capture', async (t) => {
  const env = browser(t);
  const { microphone, errors } = env.create();
  const old = microphone.enable();
  microphone.stop();
  const current = microphone.enable();
  const newer = env.stream();
  env.requests[1].resolve(newer.value);
  assert.equal(await current, true);
  const stale = env.stream();
  env.requests[0].resolve(stale.value);
  assert.equal(await old, false);
  assert.equal(stale.track.stops, 1);
  assert.equal(newer.track.stops, 0);
  assert.equal(microphone.enabled, true);
  assert.deepEqual(errors, []);
});

test('canceling a model load closes its worker and ignores queued old worker errors', async (t) => {
  const env = browser(t, { holdModel: true });
  const { microphone, errors } = env.create('moonshine');
  const old = microphone.enable();
  const queuedError = env.workers[0].onerror;
  microphone.stop();
  assert.equal(await old, false);
  assert.equal(env.workers[0].terminated, true);
  const current = microphone.enable();
  env.requests[1].resolve(env.stream().value);
  env.workers[1].finishLoad();
  assert.equal(await current, true);
  queuedError?.();
  assert.equal(microphone.enabled, true);
  assert.deepEqual(errors, []);
  const late = env.stream();
  env.requests[0].resolve(late.value);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(late.track.stops, 1);
});

for (const fault of ['mute', 'suspended'] as const) {
  test(`${fault} during model loading releases the device before the model is ready`, async (t) => {
    const env = browser(t, { holdModel: true });
    const { microphone, errors } = env.create('moonshine');
    const pending = microphone.enable();
    const media = env.stream();
    env.requests[0].resolve(media.value);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    if (fault === 'mute') media.track.mute();
    else env.contexts[0].setState('suspended');
    assert.equal(await pending, false);
    assert.equal(errors.length, 1);
    assert.equal(media.track.stops, 1);
    assert.equal(env.workers[0].terminated, true);
    assert.equal(env.worklets.length, 0);
    assert.equal(microphone.enabled, false);
  });
}

for (const fault of ['ended', 'mute', 'suspended', 'interrupted', 'closed', 'processorerror'] as const) {
  test(`${fault} releases the capture once and needs a new enable click`, async (t) => {
    const env = browser(t);
    const { microphone, errors, statuses, levels, track } = await env.ready();
    if (fault === 'ended') track.end();
    else if (fault === 'mute') track.mute();
    else if (fault === 'processorerror') env.worklets[0].onprocessorerror?.();
    else env.contexts[0].setState(fault);
    assert.equal(microphone.enabled, false);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /microphone|audio/i);
    assert.match(errors[0], /enable|allow|return|check/i);
    assert.equal(levels.at(-1), 0);
    assert.equal(statuses.at(-1), 'off');
    assert.equal(track.stops, 1);
    const resumes = env.contexts[0].resumeCalls;
    env.contexts[0].setState('running');
    track.dispatchEvent(new Event('unmute'));
    assert.equal(env.requests.length, 1, 'recovery must not reacquire a device');
    assert.equal(env.contexts[0].resumeCalls, resumes, 'recovery must not resume recording');
    assert.equal(errors.length, 1, 'cleanup events must not overwrite the interruption reason');
  });
}

test('healthy capture has no visibility-triggered release or automatic reacquisition', async (t) => {
  const env = browser(t);
  const { microphone, errors, track } = await env.ready();
  env.contexts[0].dispatchEvent(new Event('statechange'));
  track.dispatchEvent(new Event('unmute'));
  assert.equal(microphone.enabled, true);
  assert.equal(track.stops, 0);
  assert.deepEqual(errors, []);
});

for (const [name, expected] of [
  ['NotAllowedError', /permission|allow/i],
  ['NotReadableError', /unavailable.*may be (in use|used)|may be (in use|used).*unavailable/i],
  ['NotFoundError', /no microphone|could not find.*microphone/i],
] as const) {
  test(`${name} gives a specific next step and closes audio`, async (t) => {
    const env = browser(t);
    const { microphone, errors } = env.create();
    const pending = microphone.enable();
    env.requests[0].reject(new DOMException('device failed', name));
    assert.equal(await pending, false);
    assert.equal(microphone.enabled, false);
    assert.equal(env.contexts[0].closeCalls, 1);
    assert.equal(errors.length, 1);
    assert.match(errors[0], expected);
  });
}

test('a rejected audio unlock is observed even while device permission is pending', async (t) => {
  const env = browser(t, { resumeError: new DOMException('gesture expired', 'NotAllowedError') });
  const { microphone, errors } = env.create();
  const pending = microphone.enable();
  assert.equal(await pending, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /audio|browser/i);
  const late = env.stream();
  env.requests[0].resolve(late.value);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(late.track.stops, 1);
  assert.equal(microphone.enabled, false);
});
