import catalogue from '../shared/card-review-catalogue.json';

export const editions = [
  { id: 'baseline', name: 'Current', note: 'A study of the current landing layout.' },
  { id: 'table', name: 'Table', note: 'The house card. Art first, exact words.' },
  { id: 'glance', name: 'Glance', note: 'Less labeling. One clear look.' },
  { id: 'cut', name: 'Cut', note: 'A violet slab with an angled edge.' },
  { id: 'pixel', name: 'Pixel', note: 'An item screen, cut on the pixel grid.' },
  { id: 'foil', name: 'Foil', note: 'A reflective frame for the rare catch.' },
  { id: 'wide', name: 'Wide', note: 'The card on its side. Desktop edition.' },
  { id: 'picture', name: 'Picture', note: 'An experiment. Read the word on demand.' },
  { id: 'table-reveal', name: 'Table Reveal', note: 'The house card, revealed from pixels.' },
  { id: 'glance-reveal', name: 'Glance Plus', note: 'Larger icons and art that resolves into focus.' },
  { id: 'table-open', name: 'Table Open', note: 'Pixel reveal. Artwork without an inner frame.' },
] as const;
export type Edition = typeof editions[number]['id'];
export const isTableEdition = (edition: Edition) => ['table', 'table-reveal', 'table-open'].includes(edition);
export type ReviewEntry = { word: string; difficulty: string; clues: string[]; example: string; ink: string; synthetic?: boolean };
export const reviewDeck: ReviewEntry[] = catalogue;
export const generic: ReviewEntry = { word: 'network', difficulty: 'medium', clues: ['connection', 'computers'], example: 'A synthetic example without an illustration.', ink: '#c9a8ff', synthetic: true };
export const states = [
  ['live', 'Live round'], ['urgent', 'Final seconds'], ['waiting', 'Waiting'], ['paused', 'Paused'],
  ['checking', 'Checking final words'], ['review', 'Catch pending'], ['caught', 'Chat wins'],
  ['escaped', 'Time ran out'], ['skipped', 'Skipped'], ['ended', 'Round ended'],
  ['overturned', 'Not counted'], ['reconnecting', 'Reconnecting'], ['broadcaster', 'Broadcaster'],
] as const;
export type CardState = typeof states[number][0];
export const contexts = [
  ['deck', 'Landing deck'], ['panel', 'Twitch panel · 318 × 500'], ['phone', 'Phone viewer · 320 × 640'],
  ['desktop', 'Desktop viewer'], ['studio', 'Studio review'], ['obs', 'OBS result'],
] as const;
export type Context = typeof contexts[number][0];
export const isEdition = (value: unknown): value is Edition => editions.some(item => item.id === value);
export const exactClues = (entry: ReviewEntry) => entry.clues.slice(0, entry.difficulty === 'hard' ? 4 : entry.difficulty === 'medium' ? 2 : 0);
export const stateLabel = (state: CardState) => ({ live: 'In play', urgent: 'In play', waiting: 'Waiting', paused: 'Paused', checking: 'Checking', review: 'Heard. Not scored yet.', caught: 'Chat wins', escaped: 'Time ran out', skipped: 'Skipped', ended: 'Round ended', overturned: 'Not counted', reconnecting: 'Reconnecting', broadcaster: 'Your viewers have the word.' })[state];
export type Picks = { version: 1; preferred: Edition | null; picks: Partial<Record<Edition, { note: string; reviewed: Context[]; experimental: boolean }>>; updatedAt: string };
export function emptyPicks(): Picks { return { version: 1, preferred: null, picks: {}, updatedAt: '' }; }
export function parsePicks(source: string | null): Picks {
  try {
    const value = JSON.parse(source || 'null');
    if (!value || value.version !== 1 || typeof value.picks !== 'object' || !value.picks) return emptyPicks();
    const picks: Picks['picks'] = {};
    for (const entry of editions) {
      const pick = value.picks[entry.id];
      if (pick && typeof pick.note === 'string' && Array.isArray(pick.reviewed)) picks[entry.id] = { note: pick.note.slice(0, 1000), reviewed: pick.reviewed.filter((context: unknown) => contexts.some(item => item[0] === context)), experimental: entry.id === 'picture' };
    }
    return { version: 1, preferred: isEdition(value.preferred) ? value.preferred : null, picks, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '' };
  } catch { return emptyPicks(); }
}
