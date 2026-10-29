import { contexts, type Context } from './card-lab-model';

// Lab-only presentation choices. Exact playable clues still come from exactClues.
export const clueTreatments = [
  { id: 'baseline', name: 'Boxes', note: 'Current. A framed box for each word.' },
  { id: 'pills', name: 'Minus pills', note: 'Slim outlined pills with a minus.' },
  { id: 'rail', name: 'Ruled', note: 'Minus and word under a ruled label.' },
  { id: 'tokens', name: 'Ledger', note: 'One ruled table under the word.' },
  { id: 'quiet', name: 'Sentence', note: 'The rule, written out.' },
] as const;

export type ClueTreatmentId = typeof clueTreatments[number]['id'];
export type CluePick = { note: string; reviewed: Context[] };
export type ClueReview = {
  version: 1;
  selected: ClueTreatmentId;
  preferred: ClueTreatmentId | null;
  picks: Partial<Record<ClueTreatmentId, CluePick>>;
  updatedAt: string;
};

export const CARD_CLUE_STORAGE_KEY = 'baited.card-clues.v1';
export const MAX_CLUE_NOTE_LENGTH = 1000;
export const isClueTreatmentId = (value: unknown): value is ClueTreatmentId => clueTreatments.some(item => item.id === value);

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isContext = (value: unknown): value is Context => contexts.some(item => item[0] === value);

export function emptyClueReview(): ClueReview {
  // The provisional design-review proposal; this does not set the owner's preference.
  return { version: 1, selected: 'rail', preferred: null, picks: {}, updatedAt: '' };
}

export function parseClueReview(source: string | null | undefined): ClueReview {
  const result = emptyClueReview();
  let value: unknown;
  try { value = JSON.parse(source || 'null'); }
  catch { return result; }
  if (!object(value) || value.version !== 1) return result;

  if (isClueTreatmentId(value.selected)) result.selected = value.selected;
  if (isClueTreatmentId(value.preferred)) result.preferred = value.preferred;
  if (object(value.picks)) for (const { id } of clueTreatments) {
    const pick = value.picks[id];
    if (!object(pick)) continue;
    result.picks[id] = {
      note: typeof pick.note === 'string' ? pick.note.slice(0, MAX_CLUE_NOTE_LENGTH) : '',
      reviewed: Array.isArray(pick.reviewed) ? [...new Set(pick.reviewed.filter(isContext))] : [],
    };
  }
  if (typeof value.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt)) {
    const timestamp = Date.parse(value.updatedAt);
    if (Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.updatedAt) result.updatedAt = value.updatedAt;
  }
  return result;
}

// Accept URLSearchParams without mutating the caller, including during SSR.
export function parseClueUrl(search: string | URLSearchParams, defaultID: ClueTreatmentId = 'rail'): ClueTreatmentId {
  if (!isClueTreatmentId(defaultID)) throw new TypeError('Clue defaults must use a known treatment ID.');
  const value = new URLSearchParams(search).get('clue');
  return isClueTreatmentId(value) ? value : defaultID;
}
