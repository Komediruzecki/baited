import { Moonshine, type MoonshineLine } from './moonshine';
import { LocalFinalSequence } from './local-final-sequence';
import type { SpeechProvider } from '../shared/types';
import { edgeSpeechSocket } from './api';
import type { SpeechSocket } from './edge-transport';

export class Microphone {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private worklet: AudioWorkletNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private socket: WebSocket | SpeechSocket | undefined;
  private cancelled = false;
  private captureGeneration = 0;
  private enableTask: Promise<boolean> | undefined;
  private cancelEnable: (() => void) | undefined;
  private captureReady = false;
  private releaseListeners: (() => void)[] = [];
  private generation = 0;
  private streaming = false;
  private suspended = false;
  private local: Moonshine | undefined;
  private samples = 0;
  private finals = new LocalFinalSequence();
  private draining = false;
  private drainTimer: ReturnType<typeof setTimeout> | undefined;
  private transcriptSegment = '';
  constructor(
    private onStatus: (status: string) => void,
    private onLevel: (level: number) => void,
    private onError: (error: string) => void,
    private provider: SpeechProvider = 'moonshine',
    private onTranscript?: (line: MoonshineLine, segment: string) => void,
  ) {}
  get enabled() {
    return this.captureReady && !this.cancelled && this.context?.state === 'running'
      && !!this.stream?.getAudioTracks().some((track) => track.readyState === 'live' && !track.muted);
  }
  /** Begin audio activation inside the enable click, before any model or permission await. */
  enable(): Promise<boolean> {
    if (this.enableTask) return this.enableTask;
    if (this.enabled) return Promise.resolve(true);
    if (this.context || this.stream || this.local) this.stop();
    this.cancelled = false;
    const capture = ++this.captureGeneration;
    const cancelled = new Promise<false>((resolve) => { this.cancelEnable = () => resolve(false); });
    let task: Promise<boolean>;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined'
        || typeof AudioWorkletNode === 'undefined') {
        throw new Error('This browser cannot open microphone audio here. Open Studio in a current browser on HTTPS or localhost.');
      }
      const context = new AudioContext();
      this.context = context;
      let unlocked = false;
      const contextChanged = () => {
        if (!this.owns(capture) || (!unlocked && context.state !== 'closed') || context.state === 'running') return;
        this.fail(capture, context.state === 'closed'
          ? 'The microphone audio session closed. Enable the microphone again.'
          : context.state === 'suspended'
            ? 'Your browser paused microphone audio. Return to Studio and enable the microphone again.'
            : 'Microphone audio was interrupted. Check your input device, then enable the microphone again.');
      };
      context.addEventListener('statechange', contextChanged);
      this.releaseListeners.push(() => context.removeEventListener('statechange', contextChanged));
      // Observe rejection immediately, even if a device prompt or model load stays pending.
      const activation = context.resume().then(() => {
        unlocked = true;
        contextChanged();
        return context.state === 'running';
      }, () => {
        this.fail(capture, 'Your browser could not start microphone audio. Return to Studio and enable the microphone again.');
        return false;
      });
      const media = navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      }).then((stream) => {
        if (!this.owns(capture)) {
          stream.getTracks().forEach((track) => track.stop());
          return undefined;
        }
        this.stream = stream;
        const tracks = stream.getAudioTracks();
        if (!tracks.length) throw new Error('No microphone audio was found. Check your input device and enable the microphone again.');
        for (const track of tracks) {
          if (!this.owns(capture)) break;
          const ended = () => this.fail(capture,
            'Microphone disconnected or permission was removed. Check your device and allow microphone access, then enable it again.');
          const muted = () => this.fail(capture,
            'The microphone stopped sending audio. Check your device and browser permission, then enable the microphone again.');
          track.addEventListener('ended', ended);
          track.addEventListener('mute', muted);
          this.releaseListeners.push(() => {
            track.removeEventListener('ended', ended);
            track.removeEventListener('mute', muted);
          });
          if (track.readyState !== 'live') ended();
          else if (track.muted) muted();
        }
        return stream;
      });
      let model: Promise<void> | undefined;
      if (this.provider === 'moonshine') {
        this.onStatus('Loading Moonshine');
        this.local = new Moonshine((line) => {
          if (!this.owns(capture) || this.socket?.readyState !== WebSocket.OPEN) return;
          try {
            const final = this.finals.next(line);
            if (final) this.socket.send(JSON.stringify(final));
            this.onTranscript?.(line, this.transcriptSegment);
          } catch {
            this.fail(capture, 'Microphone audio could not be sent. Enable the microphone again.');
          }
        }, (status) => { if (this.owns(capture)) this.onStatus(status); },
        (message) => this.fail(capture, message));
        model = this.local.load();
      }
      task = Promise.race([this.finishEnable(capture, context, activation, media, model), cancelled]);
    } catch (error) {
      this.fail(capture, this.openError(error));
      task = Promise.resolve(false);
    }
    this.enableTask = task;
    void task.then(() => {
      if (this.enableTask === task) { this.enableTask = undefined; this.cancelEnable = undefined; }
    });
    return task;
  }
  private owns(capture: number) { return !this.cancelled && capture === this.captureGeneration; }
  private fail(capture: number, message: string) {
    if (!this.owns(capture)) return;
    // Release first. The UI's error callback may itself call stop or start another attempt.
    this.stop();
    this.onError(message);
  }
  private openError(error: unknown) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return 'Microphone permission was denied. Allow it in your browser and enable the microphone again.';
    if (name === 'NotReadableError')
      return 'Your microphone is unavailable and may be in use by another app. Check your input device, then enable it again.';
    if (name === 'NotFoundError')
      return 'No microphone was found. Connect an input device and enable the microphone again.';
    if (name === 'AbortError')
      return 'Opening the microphone was interrupted. Check your input device and enable it again.';
    if (name === 'OverconstrainedError')
      return 'This microphone could not use the requested audio settings. Check your input device and enable it again.';
    return error instanceof Error ? error.message : 'Could not open microphone audio. Check your input device and enable it again.';
  }
  private async finishEnable(capture: number, context: AudioContext, activation: Promise<boolean>,
    media: Promise<MediaStream | undefined>, model?: Promise<void>) {
    try {
      const [active, stream] = await Promise.all([activation, media, model]);
      if (!active || !stream || !this.owns(capture)) return false;
      await context.audioWorklet.addModule('/pcm-worklet.js');
      if (!this.owns(capture)) return false;
      if (context.state !== 'running') throw new Error('Your browser paused microphone audio. Return to Studio and enable the microphone again.');
      this.source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'bait-pcm');
      this.worklet = worklet;
      worklet.onprocessorerror = () => this.fail(capture,
        'Microphone audio processing stopped. Enable the microphone again. If it repeats, reload Studio.');
      // Output is silence. Connecting keeps the worklet scheduled without monitoring the mic.
      const mute = context.createGain();
      mute.gain.value = 0;
      this.source.connect(worklet);
      worklet.connect(mute);
      mute.connect(context.destination);
      worklet.port.onmessage = (
        e: MessageEvent<{ buffer?: ArrayBuffer; flushed?: boolean; generation: number }>,
      ) => {
        if (!this.owns(capture) || this.worklet !== worklet
          || (!this.streaming && !this.draining) || e.data.generation !== this.generation) return;
        if (e.data.flushed && this.draining) {
          this.draining = false;
          clearTimeout(this.drainTimer);
          void this.local?.finish().catch((error) => {
            this.fail(capture, error.message);
          });
          return;
        }
        if (!e.data.buffer) return;
        try {
          if (this.socket?.readyState === WebSocket.OPEN) {
            if (this.socket.bufferedAmount >= 64000) {
              this.fail(capture, 'Audio could not keep up with the connection. Enable the microphone again to resume.');
              return;
            }
            if (this.local) {
              const values = new Int16Array(e.data.buffer);
              const pcm = Float32Array.from(values, (value) => value / 32768);
              this.samples += pcm.length;
              this.socket.send(JSON.stringify({ type: 'audio', samples: this.samples }));
              this.local.audio(pcm);
            } else this.socket.send(e.data.buffer);
          }
        } catch (error) {
          this.fail(capture, error instanceof Error ? error.message : 'Microphone audio could not be sent. Enable the microphone again.');
          return;
        }
        const values = new Int16Array(e.data.buffer);
        let energy = 0;
        for (const v of values) energy += (v / 32768) ** 2;
        this.onLevel(values.length ? Math.min(1, Math.sqrt(energy / values.length) * 5) : 0);
      };
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live' && !track.muted))
        throw new Error('The microphone stopped sending audio. Check your input device and enable it again.');
      this.captureReady = true;
      this.onStatus('armed');
      return true;
    } catch (error) {
      this.fail(capture, this.openError(error));
      return false;
    }
  }
  connect(round: string, epoch: number, csrf: string, leaseId: string) {
    this.disconnect();
    if (!this.enabled) return;
    const capture = this.captureGeneration;
    this.suspended = false;
    this.samples = 0;
    this.finals.reset();
    this.transcriptSegment = `${round}:${epoch}`;
    this.onStatus('connecting');
    let socket: WebSocket | SpeechSocket;
    try {
      const url = new URL('/api/speech', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.search = new URLSearchParams({ round, epoch: String(epoch), csrf, leaseId }).toString();
      socket = edgeSpeechSocket(round, epoch, leaseId) ?? new WebSocket(url);
    } catch {
      this.fail(capture, 'Speech connection could not start. Enable the microphone again.');
      return;
    }
    this.socket = socket;
    let failed = false;
    socket.onmessage = async (e: { data: string }) => {
      try {
        const message = JSON.parse(e.data);
        if (this.socket !== socket) return;
        if (message.type === 'status') {
          if (!this.suspended) this.onStatus(message.status);
          if (message.status === 'listening' && !this.suspended) {
            if (this.local) await this.local.start();
            if (this.socket !== socket || !this.owns(capture) || this.suspended) return;
            this.streaming = true;
            this.worklet?.port.postMessage({ enabled: true, generation: this.generation });
          }
        }
        if (message.type === 'error') {
          failed = true;
          this.fail(capture, message.message);
        }
      } catch (error) {
        if (this.socket !== socket) return;
        this.fail(capture, error instanceof Error ? error.message : 'Speech could not start.');
      }
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      failed = true;
      this.fail(capture, 'Speech connection failed. Enable the microphone again.');
    };
    socket.onclose = (e: { code: number; reason: string }) => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.streaming = false;
      this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation });
      this.onLevel(0);
      if (e.code === 1000 && e.reason === 'round-ended') {
        this.onStatus('armed');
        return;
      }
      if (!failed && !this.cancelled) {
        this.fail(capture, 'Speech connection ended. Enable the microphone again.');
      }
    };
  }
  /** Keep the provider socket alive for final results, but stop sending audio. */
  suspend() {
    if (!this.enabled || this.suspended) return;
    const capture = this.captureGeneration;
    this.suspended = true;
    const drainLocal = !!this.local && this.streaming;
    this.streaming = false;
    if (drainLocal) {
      this.draining = true;
      this.worklet?.port.postMessage({ enabled: false, flush: true, generation: this.generation });
      this.drainTimer = setTimeout(() => {
        if (!this.draining || !this.owns(capture)) return;
        this.fail(capture, 'The microphone did not finish its last audio packet. Enable it again.');
      }, 1000);
    } else this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation });
    this.onLevel(0);
    if (this.stream) this.onStatus('settling');
  }
  disconnect() {
    this.streaming = false;
    this.draining = false;
    clearTimeout(this.drainTimer);
    try { this.local?.reset(); } catch { /* A stopped worker still needs device cleanup. */ }
    try { this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation }); } catch { /* A failed worklet may already be detached. */ }
    this.onLevel(0);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
    if (this.enabled) this.onStatus('armed');
  }
  stop() {
    this.cancelled = true;
    ++this.captureGeneration;
    this.captureReady = false;
    this.enableTask = undefined;
    this.cancelEnable?.();
    this.cancelEnable = undefined;
    for (const release of this.releaseListeners.splice(0)) release();
    this.disconnect();
    this.local?.close();
    this.local = undefined;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.onprocessorerror = null; }
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = undefined;
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.worklet = undefined;
    this.source = undefined;
    this.onLevel(0);
    this.onStatus('off');
  }
}
