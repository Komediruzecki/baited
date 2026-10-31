import WebSocket from 'ws';
import type { Game } from './game.js';
import { localTranscript, progressSchema } from '../shared/local-speech.js';
export { localTranscript } from '../shared/local-speech.js';

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
