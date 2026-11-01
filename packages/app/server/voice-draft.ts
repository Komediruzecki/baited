import { tokens, type Game } from './game.js';

export interface VoiceDraftRef { roundId: string; epoch: number; draftId: string; expiresAt: number }
export interface VoiceDraftState { roundId: string; ids: string[]; latest: VoiceDraftRef }
export const VOICE_DRAFT_TTL = 15_000;

export function voiceDraftWord(text: string): string {
  const words = tokens(text);
  if (words.length !== 1 || words[0]!.length > 40) throw new Error('Use one word, up to 40 characters.');
  return words[0]!;
}

/** This is the owner's explicit public guess, never a lookup of the secret card. */
export function voiceDraftText(channel: string, word: string): string {
  return `${channel}'s unconfirmed guess: ${word}. Waiting for lock in.`;
}

export function voiceDraftCurrent(game: Game | null, state: VoiceDraftState | undefined, ref: VoiceDraftRef, now: number): boolean {
  return !!game && ref.expiresAt > now && state?.latest.draftId === ref.draftId &&
    state.latest.expiresAt === ref.expiresAt && game.phase === 'active' && game.round?.id === ref.roundId &&
    game.round.epoch === ref.epoch && game.round.guessEnabled && !game.round.guessUsed;
}
