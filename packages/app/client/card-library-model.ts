import type { Difficulty } from '../shared/types';
import { CARD_LIMITS, packInputSchema } from '../shared/card-library';

export const clueCount = { easy: 0, medium: 2, hard: 4 } as const;
export const packMinimum = CARD_LIMITS.minimum;
export const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

export interface EditableCard {
  id?: string;
  target: string;
  difficulty: Difficulty;
  blockedClues: string[];
  aliasesText: string;
}
export interface EditablePack {
  id?: string;
  revision?: number;
  name: string;
  status: 'draft' | 'published';
  cards: EditableCard[];
}
export interface FormIssue { path: string; message: string }

export const blankCard = (difficulty: Difficulty = 'easy'): EditableCard => ({
  target: '', difficulty, blockedClues: Array(clueCount[difficulty]).fill(''), aliasesText: '',
});
export const acceptedSpellings = (card: EditableCard) =>
  card.aliasesText.split(',').map((word) => word.trim().toLowerCase()).filter(Boolean);
export const packPayload = (pack: EditablePack, status = pack.status) => ({
  ...(pack.id ? { id: pack.id, expectedRevision: pack.revision } : {}),
  name: pack.name.trim(), status,
  cards: pack.cards.map((card) => ({
    ...(card.id ? { id: card.id } : {}),
    target: card.target.trim().toLowerCase(), difficulty: card.difficulty,
    blockedClues: card.blockedClues.map((clue) => clue.trim().toLowerCase()),
    acceptedSpellings: acceptedSpellings(card),
  })),
});

/** Use the server's schema so inline checks and persisted cards follow the same rules. */
export function packFormIssues(pack: EditablePack): FormIssue[] {
  const parsed = packInputSchema.safeParse(packPayload(pack));
  return parsed.success ? [] : parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  }));
}

export function readyCounts(cards: EditableCard[]): Record<Difficulty, number> {
  const counts = { easy: 0, medium: 0, hard: 0 };
  const invalid = new Set(packFormIssues({ name: 'Check', status: 'draft', cards }).flatMap((issue) => {
    const match = /^cards\.(\d+)(?:\.|$)/.exec(issue.path);
    return match ? [Number(match[1])] : [];
  }));
  cards.forEach((card, index) => { if (!invalid.has(index)) counts[card.difficulty]++; });
  return counts;
}
