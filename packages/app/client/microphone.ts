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
  get enabled() { return !!this.stream && !this.cancelled; }
  async enable() {
    this.cancelled = false;
    try {
      if (this.provider === 'moonshine') {
        this.onStatus('Loading Moonshine');
        this.local = new Moonshine((line) => {
          if (this.socket?.readyState === WebSocket.OPEN && !this.cancelled) {
            const final = this.finals.next(line);
            if (final) this.socket.send(JSON.stringify(final));
            this.onTranscript?.(line, this.transcriptSegment);
          }
        }, this.onStatus, (message) => { this.onError(message); this.stop(); });
        await this.local.load();
        if (this.cancelled) { this.local?.close(); return false; }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (this.cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.stream = stream;
      this.context = new AudioContext();
      await this.context.resume();
      await this.context.audioWorklet.addModule('/pcm-worklet.js');
      if (this.cancelled) {
        this.stop();
        return false;
      }
      this.source = this.context.createMediaStreamSource(stream);
      this.worklet = new AudioWorkletNode(this.context, 'bait-pcm');
      // Output is silence. Connecting keeps the worklet scheduled without monitoring the mic.
      const mute = this.context.createGain();
      mute.gain.value = 0;
      this.source.connect(this.worklet);
      this.worklet.connect(mute);
      mute.connect(this.context.destination);
      this.worklet.port.onmessage = (
        e: MessageEvent<{ buffer?: ArrayBuffer; flushed?: boolean; generation: number }>,
      ) => {
        if ((!this.streaming && !this.draining) || e.data.generation !== this.generation) return;
        if (e.data.flushed && this.draining) {
          this.draining = false;
          clearTimeout(this.drainTimer);
          void this.local?.finish().catch((error) => {
            if (!this.cancelled) { this.onError(error.message); this.stop(); }
          });
          return;
        }
        if (!e.data.buffer) return;
        if (this.socket?.readyState === WebSocket.OPEN) {
          if (this.socket.bufferedAmount >= 64000) {
            this.onError('Audio could not keep up with the connection. Enable the microphone again to resume.');
            this.stop();
            return;
          }
          if (this.local) {
            const values = new Int16Array(e.data.buffer);
            const pcm = Float32Array.from(values, (value) => value / 32768);
            this.samples += pcm.length;
            this.socket.send(JSON.stringify({ type: 'audio', samples: this.samples }));
            try { this.local.audio(pcm); }
            catch (error) { this.onError((error as Error).message); this.stop(); return; }
          } else this.socket.send(e.data.buffer);
        }
        const values = new Int16Array(e.data.buffer);
        let energy = 0;
        for (const v of values) energy += (v / 32768) ** 2;
        this.onLevel(Math.min(1, Math.sqrt(energy / values.length) * 5));
      };
      stream.getTracks().forEach(
        (t) =>
          (t.onended = () => {
            if (this.cancelled || this.stream !== stream) return;
            this.onError('Microphone disconnected. Enable it again.');
            this.stop();
          }),
      );
      this.onStatus('armed');
      return true;
    } catch (e) {
      if (this.cancelled) return false;
      this.stop();
      this.onError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow it in your browser and try again.'
          : e instanceof Error && this.provider === 'moonshine' ? e.message
          : 'Could not open the microphone. Check your input device and use HTTPS or localhost.',
      );
      return false;
    }
  }
  connect(round: string, epoch: number, csrf: string, leaseId: string) {
    this.disconnect();
    if (!this.stream || this.cancelled) return;
    this.suspended = false;
    this.samples = 0;
    this.finals.reset();
    this.transcriptSegment = `${round}:${epoch}`;
    this.onStatus('connecting');
    const url = new URL('/api/speech', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.search = new URLSearchParams({ round, epoch: String(epoch), csrf, leaseId }).toString();
    const socket = edgeSpeechSocket(round, epoch, leaseId) ?? new WebSocket(url);
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
            if (this.socket !== socket || this.cancelled || this.suspended) return;
            this.streaming = true;
            this.worklet?.port.postMessage({ enabled: true, generation: this.generation });
          }
        }
        if (message.type === 'error') {
          failed = true;
          this.onError(message.message);
          this.stop();
        }
      } catch (error) {
        if (this.socket !== socket) return;
        this.onError(error instanceof Error ? error.message : 'Speech could not start.');
        this.stop();
      }
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      failed = true;
      this.onError(
        'Speech connection failed. Enable the microphone again.',
      );
      this.stop();
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
        this.onError('Speech connection ended. Enable the microphone again.');
        this.stop();
      }
    };
  }
  /** Keep the provider socket alive for final results, but stop sending audio. */
  suspend() {
    this.suspended = true;
    const drainLocal = !!this.local && this.streaming;
    this.streaming = false;
    if (drainLocal) {
      this.draining = true;
      this.worklet?.port.postMessage({ enabled: false, flush: true, generation: this.generation });
      this.drainTimer = setTimeout(() => {
        if (!this.draining || this.cancelled) return;
        this.onError('The microphone did not finish its last audio packet. Enable it again.');
        this.stop();
      }, 1000);
    } else this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation });
    this.onLevel(0);
    if (this.stream) this.onStatus('settling');
  }
  disconnect() {
    this.streaming = false;
    this.draining = false;
    clearTimeout(this.drainTimer);
    this.local?.reset();
    this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation });
    this.onLevel(0);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    }
    if (this.stream) this.onStatus('armed');
  }
  stop() {
    this.cancelled = true;
    this.disconnect();
    this.local?.close();
    this.local = undefined;
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
