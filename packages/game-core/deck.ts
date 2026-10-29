import type { Difficulty } from '../app/shared/types.js';

/** Portable boundary shared by the game and the Node card-library store. */
export interface DeckCard {
  target: string;
  difficulty: Difficulty;
  blockedClues: string[];
  acceptedSpellings: string[];
  cardId?: string;
  revision?: number;
  artId?: string;
}
export class CardLibraryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
