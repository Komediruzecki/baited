import { z } from 'zod';
import type { Difficulty } from './types.js';

export const CARD_LIMITS = { packs: 10, cards: 100, minimum: 6 } as const;
export interface LibraryCard {
  id: string;
  revision: number;
  target: string;
  difficulty: Difficulty;
  blockedClues: string[];
  acceptedSpellings: string[];
  /** Immutable, owner-approved artwork. Never an arbitrary remote URL. */
  artId?: string;
}
export interface CardPack {
  id: string;
  revision: number;
  name: string;
  status: 'draft' | 'published' | 'archived';
  cards: LibraryCard[];
  updatedAt: number;
}
export interface DeckSelection { mode: 'builtin' | 'custom' | 'mixed'; packId: string | null }
export interface SelectedDeck extends DeckSelection {
  name: string;
  eligibleCount: number;
  problem: string | null;
}
export interface CardLibraryView {
  /** Present only after saving a pack, so concurrent creates cannot confuse the editor. */
  savedPackId?: string;
  revision: number;
  packs: CardPack[];
  selection: DeckSelection;
  selected: SelectedDeck;
  builtin: { counts: Record<Difficulty, number> };
  limits: typeof CARD_LIMITS;
}
export interface CardIssue { path: string; message: string }
const word = z.string().trim().toLowerCase().regex(/^[a-z]{2,24}$/, 'Use one English word, 2–24 letters.');
const cardSchema = z.object({
  id: z.string().uuid().optional(),
  target: word,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  blockedClues: z.array(word).max(4),
  acceptedSpellings: z.array(word).max(3).default([]),
  artId: z.string().uuid().optional(),
}).strict().superRefine((card, ctx) => {
  const count = { easy: 0, medium: 2, hard: 4 }[card.difficulty];
  if (card.blockedClues.length !== count)
    ctx.addIssue({ code: 'custom', path: ['blockedClues'], message: `Add exactly ${count} off-limits words for ${card.difficulty}.` });
  const forms = [card.target, ...card.acceptedSpellings];
  if (new Set(forms).size !== forms.length)
    ctx.addIssue({ code: 'custom', path: ['acceptedSpellings'], message: 'Each accepted spelling must be different from the target and other spellings.' });
  if (new Set(card.blockedClues).size !== card.blockedClues.length)
    ctx.addIssue({ code: 'custom', path: ['blockedClues'], message: 'Use different off-limits words.' });
  if (card.blockedClues.some((clue) => targetForms(card.target, card.acceptedSpellings).includes(clue)))
    ctx.addIssue({ code: 'custom', path: ['blockedClues'], message: 'The target and its accepted spellings already stay out of chat.' });
});
export const packInputSchema = z.object({
  id: z.string().uuid().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  name: z.string().trim().min(1, 'Name this pack.').max(60).refine((s) => !/[<>\p{Cc}\p{Cf}]/u.test(s), 'Use plain text for the pack name.'),
  status: z.enum(['draft', 'published']),
  cards: z.array(cardSchema).min(1, 'Add a card before saving.').max(CARD_LIMITS.cards),
}).strict().superRefine((pack, ctx) => {
  const targets = new Set<string>(), ids = new Set<string>();
  pack.cards.forEach((card, i) => {
    for (const form of targetForms(card.target, card.acceptedSpellings)) {
      if (targets.has(form)) ctx.addIssue({ code: 'custom', path: ['cards', i, 'target'], message: 'This target or spelling is already used in this pack.' });
      targets.add(form);
    }
    if (card.id && ids.has(card.id)) ctx.addIssue({ code: 'custom', path: ['cards', i, 'id'], message: 'A card can appear only once in a pack.' });
    if (card.id) ids.add(card.id);
  });
  if (pack.status === 'published' && !(['easy', 'medium', 'hard'] as const).some((d) => pack.cards.filter((c) => c.difficulty === d).length >= CARD_LIMITS.minimum))
    ctx.addIssue({ code: 'custom', path: ['cards'], message: 'Add six cards at the same difficulty before publishing.' });
});
export type PackInput = z.input<typeof packInputSchema>;
export const archiveInputSchema = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict();
export const selectInputSchema = z.object({
  mode: z.enum(['builtin', 'custom', 'mixed']),
  packId: z.string().uuid().nullable().optional(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();
const spellingGroups: readonly (readonly string[])[] = [
  ['donut', 'doughnut'], ['yogurt', 'yoghurt'], ['mustache', 'moustache'],
];
export function targetForms(target: string, acceptedSpellings: readonly string[] = []): string[] {
  return [...new Set([target, ...acceptedSpellings].flatMap((form) => spellingGroups.find((group) => group.includes(form.toLowerCase())) ?? [form.toLowerCase()]))];
}
export function matchesCustomTarget(text: string, target: string, acceptedSpellings: readonly string[] = []): boolean {
  const forms = targetForms(target, acceptedSpellings);
  return (text.normalize('NFKC').toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).some((token) => forms.includes(token));
}
