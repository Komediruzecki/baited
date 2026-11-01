const SAMPLE_RATE = 16000;
const MAX_SECONDS = 15;
const SETUP_TIMEOUT_MS = 15000;
const DRAIN_TIMEOUT_MS = 250;

/** Browser seams keep device ownership testable without opening a real microphone. */
export interface MicrophoneSampleDependencies {
  createContext(): AudioContext;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createWorklet(context: AudioContext): AudioWorkletNode;
}

const browser: MicrophoneSampleDependencies = {
  createContext: () => new AudioContext(),
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  createWorklet: (context) => new AudioWorkletNode(context, 'bait-pcm'),
};

interface Capture {
  generation: number;
  promise: Promise<Float32Array>;
  resolve(value: Float32Array): void;
  reject(error: Error): void;
  samples: Float32Array;
  used: number;
  draining: boolean;
  context?: AudioContext;
  stream?: MediaStream;
  worklet?: AudioWorkletNode;
  source?: MediaStreamAudioSourceNode;
  mute?: GainNode;
  timer?: ReturnType<typeof setTimeout>;
  listeners: (() => void)[];
}

/** One local diagnostic sample. No model, upload, game lease or scoring connection. */
export class MicrophoneSample {
  private active?: Capture;
  private generation = 0;

  constructor(
    private onLevel?: (level: number) => void,
    private dependencies: MicrophoneSampleDependencies = browser,
    private onProgress?: (seconds: number) => void,
  ) {}

  /** Call directly inside the mic button handler, before awaiting model loading. */
  capture(maxSeconds = 5): Promise<Float32Array> {
    if (this.active) return this.active.promise;
    if (!Number.isFinite(maxSeconds) || maxSeconds <= 0)
      return Promise.reject(new Error('Choose a microphone sample longer than zero seconds.'));
    const length = Math.floor(Math.min(MAX_SECONDS, maxSeconds) * SAMPLE_RATE);
    if (!length) return Promise.reject(new Error('The microphone sample is too short.'));
    let resolve!: Capture['resolve'], reject!: Capture['reject'];
    const promise = new Promise<Float32Array>((yes, no) => { resolve = yes; reject = no; });
    const capture: Capture = { generation: ++this.generation, promise, resolve, reject,
      samples: new Float32Array(length), used: 0, draining: false, listeners: [] };
    this.active = capture;
    capture.timer = setTimeout(() => this.fail(capture,
      new Error('Opening the microphone timed out. Allow microphone access, then try again.')), SETUP_TIMEOUT_MS);
    try {
      const context = this.dependencies.createContext();
      capture.context = context;
      let resumed = false;
      const changed = () => {
        if (context.state === 'closed' || (resumed && context.state !== 'running'))
          this.fail(capture, new Error('Microphone audio was interrupted. Check your input device, then try again.'));
      };
      context.addEventListener('statechange', changed);
      capture.listeners.push(() => context.removeEventListener('statechange', changed));
      // Both calls start synchronously in the user's click. Attach rejection handlers
      // immediately so a pending permission prompt cannot hide an audio failure.
      const activation = context.resume().then(() => {
        resumed = true;
        changed();
      }, () => { this.fail(capture, new Error('Your browser could not start microphone audio. Start a new recording.')); });
      const media = this.dependencies.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      }).then((stream) => {
        if (this.active !== capture) { this.stopTracks(stream); return; }
        capture.stream = stream;
        const tracks = stream.getAudioTracks();
        if (!tracks.length) throw new Error('No microphone audio was found. Check your input device, then try again.');
        for (const track of tracks) {
          const lost = () => this.fail(capture,
            new Error('The microphone stopped sending audio. Check your device and permission, then try again.'));
          track.addEventListener('ended', lost);
          track.addEventListener('mute', lost);
          capture.listeners.push(() => {
            track.removeEventListener('ended', lost);
            track.removeEventListener('mute', lost);
          });
          if (track.readyState !== 'live' || track.muted) { lost(); break; }
        }
      });
      void this.start(capture, activation, media);
    } catch (error) { this.fail(capture, this.openError(error)); }
    return promise;
  }

  private async start(capture: Capture, activation: Promise<void>, media: Promise<void>) {
    try {
      await Promise.all([activation, media]);
      if (this.active !== capture) return;
      const context = capture.context!;
      await context.audioWorklet.addModule('/pcm-worklet.js');
      if (this.active !== capture) return;
      if (context.state !== 'running') throw new Error('Your browser paused microphone audio. Start a new recording.');
      const worklet = this.dependencies.createWorklet(context);
      capture.worklet = worklet;
      capture.source = context.createMediaStreamSource(capture.stream!);
      capture.mute = context.createGain();
      capture.mute.gain.value = 0;
      worklet.onprocessorerror = () => this.fail(capture,
        new Error('Microphone audio processing stopped. Reload this page and try again.'));
      worklet.port.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; flushed?: boolean; generation: number }>) => {
        if (this.active !== capture || event.data.generation !== capture.generation) return;
        if (event.data.buffer) {
          const buffer = event.data.buffer;
          // The shared worklet emits at most 2,048 Int16 samples per packet.
          if (!(buffer instanceof ArrayBuffer) || buffer.byteLength % 2 || buffer.byteLength > 4096) {
            this.fail(capture, new Error('The microphone returned an invalid audio packet. Try again.'));
            return;
          }
          const values = new Int16Array(buffer);
          const count = Math.min(values.length, capture.samples.length - capture.used);
          let energy = 0;
          for (let index = 0; index < count; index++) {
            const sample = values[index] / 32768;
            capture.samples[capture.used++] = sample;
            energy += sample * sample;
          }
          if (!capture.draining) this.level(count ? Math.min(1, Math.sqrt(energy / count) * 5) : 0);
          this.progress(capture.used / SAMPLE_RATE);
          if (capture.used === capture.samples.length) { this.complete(capture); return; }
        }
        if (event.data.flushed && capture.draining) this.complete(capture);
      };
      capture.source.connect(worklet);
      worklet.connect(capture.mute);
      capture.mute.connect(context.destination);
      clearTimeout(capture.timer);
      capture.timer = setTimeout(() => { if (this.active === capture) this.finish(); }, capture.samples.length / SAMPLE_RATE * 1000);
      worklet.port.postMessage({ enabled: true, generation: capture.generation });
      this.progress(0);
    } catch (error) { this.fail(capture, this.openError(error)); }
  }

  /** Release the input now; allow the worklet a bounded interval to return its tail. */
  finish(): void {
    const capture = this.active;
    if (!capture || capture.draining) return;
    if (!capture.worklet) { this.complete(capture); return; }
    capture.draining = true;
    clearTimeout(capture.timer);
    capture.timer = setTimeout(() => this.complete(capture), DRAIN_TIMEOUT_MS);
    try {
      capture.worklet.port.postMessage({ enabled: false, flush: true, generation: capture.generation });
      this.releaseInput(capture);
      this.level(0);
    } catch (error) { this.fail(capture, this.openError(error)); }
  }

  /** Cancel pending permission, setup, capture or drain. A later click may retry. */
  close(): void {
    if (this.active) this.fail(this.active, new DOMException('Microphone sample canceled.', 'AbortError'));
  }

  private complete(capture: Capture) {
    if (this.active !== capture) return;
    const result = capture.samples.slice(0, capture.used);
    this.dispose(capture);
    capture.resolve(result);
  }

  private fail(capture: Capture, error: Error) {
    if (this.active !== capture) return;
    this.dispose(capture);
    capture.reject(error);
  }

  private releaseInput(capture: Capture) {
    for (const release of capture.listeners.splice(0)) release();
    try { capture.source?.disconnect(); } catch { /* Continue releasing the device. */ }
    capture.source = undefined;
    if (capture.stream) this.stopTracks(capture.stream);
    capture.stream = undefined;
  }

  private dispose(capture: Capture) {
    this.active = undefined;
    clearTimeout(capture.timer);
    this.releaseInput(capture);
    if (capture.worklet) {
      capture.worklet.port.onmessage = null;
      capture.worklet.onprocessorerror = null;
      try { capture.worklet.port.postMessage({ enabled: false, generation: capture.generation }); } catch { /* Detached port. */ }
      try { capture.worklet.port.close(); } catch { /* Detached port. */ }
      try { capture.worklet.disconnect(); } catch { /* Detached node. */ }
    }
    try { capture.mute?.disconnect(); } catch { /* Detached node. */ }
    try { void capture.context?.close().catch(() => {}); } catch { /* Already closed. */ }
    this.level(0);
  }

  private stopTracks(stream: MediaStream) {
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* Still stop any other tracks. */ }
    }
  }

  private level(value: number) {
    try { this.onLevel?.(value); } catch { /* UI observers must not keep a device open. */ }
  }

  private progress(seconds: number) {
    try { this.onProgress?.(seconds); } catch { /* Observers must not retain the device. */ }
  }

  private openError(error: unknown): Error {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return new Error('Microphone permission was denied. Allow it in your browser, then try again.');
    if (name === 'NotFoundError') return new Error('No microphone was found. Connect an input device and try again.');
    if (name === 'NotReadableError') return new Error('The microphone is unavailable. Check whether another app is using it, then try again.');
    return error instanceof Error ? error : new Error('Could not open microphone audio. Check your input device, then try again.');
  }
}
