import type { GameView } from '../shared/types';
import type { VoiceGuessContext, VoiceGuessSnapshot } from './voice-guess';

export type VoiceGuessEligibility = {
  room: GameView | null; serverNow: number; leaseId: string | null;
  enabled: boolean; microphoneEnabled: boolean; leaseActive: boolean;
  offline: boolean; recovering: boolean; manualGuess: boolean;
};
export const emptyVoiceGuessSnapshot = (): VoiceGuessSnapshot => ({
  draft: null, awaitingWord: false, acceptsBareGuess: false, expiresAt: 0,
});
const key = (context: VoiceGuessContext) => JSON.stringify(context);

function eligibleContext(input: VoiceGuessEligibility): VoiceGuessContext | null {
  const round = input.room?.round;
  if (!input.enabled || input.offline || input.recovering || input.manualGuess ||
    !input.leaseActive || !input.microphoneEnabled || !input.leaseId ||
    !round?.guessEnabled || round.guessUsed) return null;
  return { roundId: round.id, epoch: round.epoch, leaseId: input.leaseId,
    takeId: input.room?.recording?.takeId ?? '' };
}

/** Recognition during final drain never grants permission to post or score a guess. */
export function voiceGuessActionContext(input: VoiceGuessEligibility): VoiceGuessContext | null {
  const end = input.room?.round?.endsAt;
  return input.room?.phase === 'active' && end != null && input.serverNow < end
    ? eligibleContext(input) : null;
}

export class VoiceGuessContextGate {
  private active: { context: VoiceGuessContext; endsAt: number } | null = null;
  clear() { this.active = null; }

  update(input: VoiceGuessEligibility): { context: VoiceGuessContext | null; canAct: boolean } {
    const context = eligibleContext(input), round = input.room?.round;
    if (context && input.room?.phase === 'active' && round?.endsAt != null) {
      this.active = { context, endsAt: round.endsAt };
      return { context, canAct: !!voiceGuessActionContext(input) };
    }
    if (context && input.room?.phase === 'settling' && this.active &&
      key(context) === key(this.active.context) && round?.endsAt === this.active.endsAt &&
      round.settleUntil != null && Number.isFinite(round.settleUntil) &&
      input.serverNow < round.settleUntil) return { context, canAct: false };
    this.clear();
    return { context: null, canAct: false };
  }
}
