import type { MoonshineLine } from './moonshine';

export function validLocalFinal(line: MoonshineLine) {
  return line.isComplete && !!line.text.trim() && !!line.words.length &&
    Number.isFinite(line.startTime) && line.startTime >= 0 &&
    Number.isFinite(line.duration) && line.duration > 0;
}

/** VAD can complete an empty line. It is not scoring evidence or a wire event. */
export class LocalFinalSequence {
  private sequence = 0;
  reset() { this.sequence = 0; }
  next(line: MoonshineLine) {
    if (!validLocalFinal(line)) return null;
    return { type: 'final' as const, sequence: ++this.sequence, line };
  }
}
