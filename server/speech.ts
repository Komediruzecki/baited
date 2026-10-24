import WebSocket from 'ws';
import type { Game } from './game.js';
import { z } from 'zod';
import type { Transcript } from '../shared/types.js';

const resultSchema = z.object({
  type: z.literal('Results'),
  is_final: z.boolean(),
  start: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  channel: z.object({
    alternatives: z
      .array(
        z.object({
          transcript: z.string().max(4000),
          confidence: z.number().min(0).max(1),
          words: z
            .array(
              z.object({
                word: z.string(),
                start: z.number(),
                end: z.number(),
                confidence: z.number(),
              }),
            )
            .optional(),
        }),
      )
      .min(1),
  }),
});
export function providerTranscript(
  data: unknown,
  binding: { roundId: string; epoch: number; firstAudioAt: number; audioSeconds: number },
  now = Date.now(),
): Transcript | null {
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success || !parsed.data.is_final) return null;
  const r = parsed.data,
    a = r.channel.alternatives[0];
  if (
    r.start + r.duration > binding.audioSeconds + 0.5 ||
    r.start < Math.max(0, binding.audioSeconds - 7)
  )
    return null;
  // Require confidence on every word: a single uncertain target cannot ride a high average.
  const confidence = Math.min(
    a.confidence,
    ...(a.words?.map((w) => w.confidence) ?? [a.confidence]),
  );
  const capturedAt = binding.firstAudioAt + r.start * 1000;
  if (capturedAt > now + 1000) return null;
  return {
    roundId: binding.roundId,
    epoch: binding.epoch,
    text: a.transcript,
    final: true,
    confidence,
    capturedAt,
    id: `${r.start}:${r.duration}`,
  };
}
export class SpeechBridge {
  private upstream: WebSocket | undefined;
  private keepalive: ReturnType<typeof setInterval> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private firstAudioAt = 0;
  private audioBytes = 0;
  private closed = false;
  readonly roundId: string;
  readonly epoch: number;
  constructor(
    private client: WebSocket,
    private game: Game,
    key: string,
    private validSession: () => boolean,
    private done: () => void,
    makeSocket = (url: string, options: { headers: Record<string, string> }) =>
      new WebSocket(url, options),
  ) {
    this.roundId = game.round!.id;
    this.epoch = game.round!.epoch;
    this.status('connecting');
    const q = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '300',
      mip_opt_out: 'true',
    });
    this.upstream = makeSocket(`wss://api.deepgram.com/v1/listen?${q}`, {
      headers: { Authorization: `Token ${key}` },
    });
    this.timeout = setTimeout(
      () => this.close('Speech provider did not respond. Try again.'),
      12000,
    );
    this.upstream.on('open', () => {
      if (this.closed) return;
      clearTimeout(this.timeout);
      this.status('listening');
      this.keepalive = setInterval(() => {
        if (this.upstream?.readyState === WebSocket.OPEN)
          this.upstream.send(JSON.stringify({ type: 'KeepAlive' }));
      }, 4000);
    });
    this.upstream.on('message', (raw) => {
      if (!this.valid() || !this.firstAudioAt) return;
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'Error') {
          this.close('Speech provider error. Check your server configuration.');
          return;
        }
        const t = providerTranscript(data, {
          roundId: this.roundId,
          epoch: this.epoch,
          firstAudioAt: this.firstAudioAt,
          audioSeconds: this.audioBytes / 32000,
        });
        if (t) {
          this.client.send(JSON.stringify({ type: 'phrase', at: Date.now() }));
          this.game.transcript(t);
        }
      } catch {
        /* Provider payloads are untrusted; invalid results cannot win. */
      }
    });
    this.upstream.on('error', () =>
      this.close('Speech service unavailable. Check your key and reconnect.'),
    );
    this.upstream.on('close', () =>
      this.close(
        this.closed ? undefined : 'Speech service disconnected. Re-enable the microphone.',
      ),
    );
    client.on('message', (data, binary) => {
      if (!this.valid()) {
        this.close();
        return;
      }
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      if (
        !binary ||
        buffer.length === 0 ||
        buffer.length > 32768 ||
        buffer.length % 2 !== 0 ||
        this.upstream?.readyState !== WebSocket.OPEN
      )
        return;
      if (!this.firstAudioAt) this.firstAudioAt = Date.now();
      // Bound upload speed and memory. No buffering or recording on either side of this bridge.
      if (this.audioBytes + buffer.length > 32000 * ((Date.now() - this.firstAudioAt) / 1000 + 2)) {
        this.close('Audio arrived too quickly. Re-enable the microphone.');
        return;
      }
      this.audioBytes += buffer.length;
      if (this.upstream.bufferedAmount > 128000) {
        this.close('Speech connection is too slow. Try again.');
        return;
      }
      this.upstream.send(buffer, { binary: true });
    });
    client.on('close', () => this.close());
    client.on('error', () => this.close());
  }
  valid() {
    return (
      !this.closed &&
      this.validSession() &&
      this.game.phase === 'active' &&
      this.game.round?.id === this.roundId &&
      this.game.round.epoch === this.epoch
    );
  }
  private status(status: 'connecting' | 'listening') {
    this.game.mic = status;
    if (this.client.readyState === WebSocket.OPEN)
      this.client.send(JSON.stringify({ type: 'status', status }));
    this.game.onChange();
  }
  close(error?: string) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.keepalive);
    clearTimeout(this.timeout);
    if (this.upstream?.readyState === WebSocket.OPEN)
      this.upstream.send(JSON.stringify({ type: 'CloseStream' }));
    this.upstream?.close();
    if (this.client.readyState === WebSocket.OPEN) {
      if (error) this.client.send(JSON.stringify({ type: 'error', message: error }));
      this.client.close(error ? 1011 : 1000, error ? 'speech-error' : 'round-ended');
    }
    this.game.mic = error ? 'error' : 'off';
    this.done();
    this.game.onChange();
  }
}
