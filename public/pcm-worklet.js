// Original streaming capture processor. No files, recording buffers, or stream-mix capture.
class BaitPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(2048);
    this.used = 0;
    this.acc = 0;
    this.sum = 0;
    this.count = 0;
    this.enabled = false;
    this.generation = 0;
    this.port.onmessage = (e) => {
      this.enabled = e.data.enabled === true;
      this.generation = e.data.generation;
      this.used = 0;
      this.acc = 0;
      this.sum = 0;
      this.count = 0;
    };
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || !this.enabled) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.acc++;
      if (this.acc >= ratio) {
        const s = Math.max(-1, Math.min(1, this.sum / this.count));
        this.samples[this.used++] = s < 0 ? s * 32768 : s * 32767;
        this.acc -= ratio;
        this.sum = 0;
        this.count = 0;
        if (this.used === this.samples.length) {
          this.port.postMessage({ buffer: this.samples.buffer, generation: this.generation }, [
            this.samples.buffer,
          ]);
          this.samples = new Int16Array(2048);
          this.used = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('bait-pcm', BaitPCM);
