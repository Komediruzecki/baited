import { matchesCustomTarget } from '../shared/card-library';
import { LocalFinalSequence } from './local-final-sequence';
import type { MoonshineLine } from './moonshine';

/** Rehearsal accepts the same completed, timed speech evidence as a live local catch. */
export class PronunciationTake {
  private finals = new LocalFinalSequence();
  hears(line: MoonshineLine, word: string, spellings: string[]) {
    return !!this.finals.next(line) && matchesCustomTarget(line.text, word, spellings);
  }
}
