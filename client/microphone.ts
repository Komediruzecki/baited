export class Microphone {
  private stream: MediaStream | undefined;
  private context: AudioContext | undefined;
  private worklet: AudioWorkletNode | undefined;
  private source: MediaStreamAudioSourceNode | undefined;
  private socket: WebSocket | undefined;
  private cancelled = false;
  private generation = 0;
  private streaming = false;
  private suspended = false;
  constructor(
    private onStatus: (status: string) => void,
    private onLevel: (level: number) => void,
    private onError: (error: string) => void,
  ) {}
  get enabled() { return !!this.stream && !this.cancelled; }
  async enable() {
    this.cancelled = false;
    try {
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
        e: MessageEvent<{ buffer: ArrayBuffer; generation: number }>,
      ) => {
        if (!this.streaming || e.data.generation !== this.generation) return;
        if (this.socket?.readyState === WebSocket.OPEN) {
          if (this.socket.bufferedAmount >= 64000) {
            this.onError('Audio could not keep up with the connection. Enable the microphone again to resume.');
            this.stop();
            return;
          }
          this.socket.send(e.data.buffer);
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
          : 'Could not open the microphone. Check your input device and use HTTPS or localhost.',
      );
      return false;
    }
  }
  connect(round: string, epoch: number, csrf: string, leaseId: string) {
    this.disconnect();
    if (!this.stream || this.cancelled) return;
    this.suspended = false;
    this.onStatus('connecting');
    const url = new URL('/api/speech', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.search = new URLSearchParams({ round, epoch: String(epoch), csrf, leaseId }).toString();
    const socket = new WebSocket(url);
    this.socket = socket;
    let failed = false;
    socket.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        if (this.socket !== socket) return;
        if (message.type === 'status') {
          if (!this.suspended) this.onStatus(message.status);
          if (message.status === 'listening' && !this.suspended) {
            this.streaming = true;
            this.worklet?.port.postMessage({ enabled: true, generation: this.generation });
          }
        }
        if (message.type === 'error') {
          failed = true;
          this.onError(message.message);
          this.stop();
        }
      } catch {}
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      failed = true;
      this.onError(
        'Speech connection failed. Check the provider key, then enable the microphone again.',
      );
      this.stop();
    };
    socket.onclose = (e) => {
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
    this.streaming = false;
    this.worklet?.port.postMessage({ enabled: false, generation: ++this.generation });
    this.onLevel(0);
    if (this.stream) this.onStatus('settling');
  }
  disconnect() {
    this.streaming = false;
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
