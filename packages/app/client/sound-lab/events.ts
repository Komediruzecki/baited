import type { GameView } from '../../shared/types';
import type { SoundCue } from './recipes';

export type SoundSnapshot = Pick<GameView, 'id' | 'phase' | 'round' | 'result'>;

/** A new mount/reconnect observes state first. It never replays the saved result. */
export class SoundEventGate {
  private initialized = false;
  private roomId: string | null = null;
  private roundId: string | null = null;
  private results = new Set<string>();
  private countdown = new Set<number>();
  private phase: GameView['phase'] = 'idle';

  receive(snapshot: SoundSnapshot): SoundCue[] {
    const resultKey = snapshot.result ? `${snapshot.result.id}:${snapshot.result.outcome}` : null;
    const first = !this.initialized || this.roomId !== snapshot.id;
    if (first) {
      this.results.clear();
      this.countdown.clear();
      this.initialized = true;
      this.roomId = snapshot.id;
    }
    const newRound = snapshot.round?.id !== this.roundId;
    if (newRound) this.countdown.clear();
    const cues: SoundCue[] = [];
    if (!first && newRound && snapshot.round && snapshot.phase === 'active') cues.push('deal');
    if (resultKey && !this.results.has(resultKey)) {
      this.results.add(resultKey);
      // A Moonshine 'review' is silent. Its same-id transition to 'caught' gets
      // a new key only after confirmation. Active and settling phases cannot celebrate.
      if (!first && snapshot.phase !== 'active' && snapshot.phase !== 'settling') {
        if (snapshot.result?.outcome === 'caught') cues.push('catch');
        if (snapshot.result?.outcome === 'escaped') cues.push('escape');
        if (snapshot.result?.outcome === 'overturned') cues.push('correction');
      }
      if (this.results.size > 64) this.results.delete(this.results.values().next().value!);
    }
    this.roundId = snapshot.round?.id ?? null;
    this.phase = snapshot.phase;
    return cues;
  }

  tick(remainingSeconds: number): boolean {
    if (!this.initialized || this.phase !== 'active' || !Number.isFinite(remainingSeconds)) return false;
    const second = Math.ceil(remainingSeconds);
    if (second < 1 || second > 5 || this.countdown.has(second)) return false;
    this.countdown.add(second);
    return true;
  }
}
