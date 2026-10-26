import WebSocket from 'ws';
import { z } from 'zod';
import type { Game } from './game.js';
import type { Transcript } from '../shared/types.js';

const finalSchema = z.object({
  type: z.literal('final'), sequence: z.number().int().positive(),
  line: z.object({
    id: z.string().min(1).max(80), text: z.string().min(1).max(2000),
    isComplete: z.literal(true), startTime: z.number().finite().nonnegative(),
    duration: z.number().finite().positive().max(120),
    words: z.array(z.object({ text: z.string().min(1).max(100),
      start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
      confidence: z.number().finite().min(0).max(1),
    })).min(1).max(250),
  }),
}).strict();
const progressSchema = z.object({ type: z.literal('audio'), samples: z.number().int().positive().max(16000 * 1800) }).strict();

export function localTranscript(data: unknown, binding: { roundId: string; epoch: number; firstAudioAt: number; audioSeconds: number; lastSequence: number }, now = Date.now()): Transcript | null {
  const result = finalSchema.safeParse(data);
  if (!result.success) return null;
  const { line, sequence } = result.data;
  if (sequence !== binding.lastSequence + 1 || !binding.firstAudioAt) return null;
  const end = line.startTime + line.duration;
  if (end > binding.audioSeconds + 0.15 || end < Math.max(0, binding.audioSeconds - 5)) return null;
  if (line.words.some((w) => w.end < w.start || w.start < line.startTime - 0.1 || w.end > end + 0.15 ||
    binding.firstAudioAt + w.end * 1000 > now + 500)) return null;
  return {
    roundId: binding.roundId, epoch: binding.epoch, final: true, id: `moonshine:${line.id}`,
    text: line.text, confidence: Math.min(...line.words.map((w) => w.confidence)),
    capturedAt: binding.firstAudioAt + line.startTime * 1000,
    endedAt: binding.firstAudioAt + end * 1000,
    words: line.words.map((w) => ({ text: w.text, confidence: w.confidence,
      capturedAt: binding.firstAudioAt + w.start * 1000, endedAt: binding.firstAudioAt + w.end * 1000 })),
  };
}

/** This is a casual broadcaster-controlled game, not a proof of microphone authenticity.
 * Browser text cannot prove what was spoken. Session/lease/epoch and clocks still prevent
 * cross-session claims, replay and old audio winning a later round. No audio is uploaded. */
export class LocalSpeechBridge {
  readonly roundId: string;
  readonly epoch: number;
  private closed = false;
  private samples = 0;
  private firstAudioAt = 0;
  private lastAudioAt = Date.now();
  private lastSequence = 0;
  constructor(private client: WebSocket, private game: Game, private validSession: () => boolean, private done: () => void) {
    this.roundId = game.round!.id; this.epoch = game.round!.epoch;
    game.mic = 'listening';
    client.send(JSON.stringify({ type: 'status', status: 'listening' }));
    game.onChange();
    client.on('message', (raw, binary) => {
      game.tick();
      if (!this.valid()) { this.close(); return; }
      if (binary) { this.close('Local speech accepts text only.'); return; }
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'audio') {
          const p = progressSchema.safeParse(data);
          if (!p.success) throw new Error();
          const delta = p.data.samples - this.samples;
          if (delta <= 0 || delta > 8192) throw new Error();
          const now = Date.now();
          if (!this.firstAudioAt) this.firstAudioAt = now - delta / 16;
          const drift = now - this.firstAudioAt - p.data.samples / 16;
          if (drift < -500 || drift > 2000) throw new Error();
          if (game.phase === 'settling' && this.firstAudioAt + p.data.samples / 16 > game.round!.endsAt + 250) throw new Error();
          this.samples = p.data.samples; this.lastAudioAt = now;
        } else {
          const transcript = localTranscript(data, { roundId: this.roundId, epoch: this.epoch,
            firstAudioAt: this.firstAudioAt, audioSeconds: this.samples / 16000, lastSequence: this.lastSequence });
          if (!transcript) throw new Error();
          this.lastSequence++;
          game.transcript(transcript, 'confirm');
        }
      } catch { this.close('Local speech timing was interrupted. Enable the microphone again and resume.'); }
    });
    client.on('close', () => this.close(game.phase === 'active' ? 'Microphone disconnected. Re-enable it and resume.' : undefined));
    client.on('error', () => this.close('Local speech connection failed. Re-enable it and resume.'));
  }
  valid() { return !this.closed && this.validSession() && ['active', 'settling'].includes(this.game.phase) &&
    this.game.round?.id === this.roundId && this.game.round.epoch === this.epoch; }
  sync() {
    if (!this.valid()) this.close();
    else if (this.game.phase === 'active' && Date.now() - this.lastAudioAt > 2500)
      this.close('No microphone audio arrived. Re-enable the microphone and resume.');
  }
  close(error?: string) {
    if (this.closed) return;
    this.closed = true;
    if (this.client.readyState === WebSocket.OPEN) {
      if (error) this.client.send(JSON.stringify({ type: 'error', message: error }));
      this.client.close(error ? 1011 : 1000, error ? 'speech-error' : 'round-ended');
    }
    this.game.mic = error ? 'error' : 'off';
    this.done();
    if (this.game.phase === 'active') this.game.pauseIfActive();
    this.game.onChange();
  }
}
