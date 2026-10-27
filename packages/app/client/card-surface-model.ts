import { backs, finishes, isBackId, isFinishId, isLogoMode, type BackId, type FinishId, type LogoMode } from './card-finish-catalogue';
import { contexts, isEdition, type Context, type Edition } from './card-lab-model';

// Lab-only preferences. Never read or write the existing version-one edition picks.
export const CARD_SURFACE_STORAGE_KEY = 'baited.card-surfaces.v1';
export const MAX_SURFACE_PAIRINGS = 12;
export const MAX_SURFACE_NOTE_LENGTH = 1000;
export type SurfaceSelection = { finish: FinishId; back: BackId; logo: LogoMode };
export type SurfaceChoice = SurfaceSelection & { version: 1 };
export type SurfaceNoteKey = `front:${FinishId}` | `back:${BackId}`;
export type SurfacePairing = SurfaceSelection & { edition: Edition; context: Context; note: string };
export type SurfaceReview = SurfaceChoice & {
  preferredFinish: FinishId | null;
  preferredBack: BackId | null;
  notes: Partial<Record<SurfaceNoteKey, string>>;
  pairings: SurfacePairing[];
  updatedAt: string;
};
export type SurfaceView = 'stage' | 'gallery';
export const DEFAULT_SURFACE_SELECTION: Readonly<SurfaceSelection> = { finish: 'stock', back: 'current', logo: 'designed' };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const context = (value: unknown): value is Context => contexts.some(item => item[0] === value);
const read = (source: string | null | undefined): Record<string, unknown> | null => {
  try { const value: unknown = JSON.parse(source || 'null'); return object(value) && value.version === 1 ? value : null; }
  catch { return null; }
};

function selection(value: Record<string, unknown> | null, defaults: SurfaceSelection): SurfaceSelection {
  if (!isFinishId(defaults.finish) || !isBackId(defaults.back) || !isLogoMode(defaults.logo)) throw new TypeError('Surface defaults must use known finish, back and logo IDs.');
  return {
    finish: isFinishId(value?.finish) ? value.finish : defaults.finish,
    back: isBackId(value?.back) ? value.back : defaults.back,
    logo: isLogoMode(value?.logo) ? value.logo : defaults.logo,
  };
}

export function parseSurfaceChoice(
  source: string | null | undefined,
  defaults: SurfaceSelection = DEFAULT_SURFACE_SELECTION,
): SurfaceChoice {
  return { version: 1, ...selection(read(source), defaults) };
}

export function emptySurfaceReview(defaults: SurfaceSelection = DEFAULT_SURFACE_SELECTION): SurfaceReview {
  return { ...parseSurfaceChoice(null, defaults), preferredFinish: null, preferredBack: null, notes: {}, pairings: [], updatedAt: '' };
}

export function parseSurfaceReview(source: string | null | undefined): SurfaceReview {
  const value = read(source);
  const result = emptySurfaceReview();
  if (!value) return result;
  Object.assign(result, selection(value, DEFAULT_SURFACE_SELECTION));
  result.preferredFinish = isFinishId(value.preferredFinish) ? value.preferredFinish : null;
  result.preferredBack = isBackId(value.preferredBack) ? value.preferredBack : null;
  if (object(value.notes)) {
    const keys: SurfaceNoteKey[] = [...finishes.map(item => `front:${item.id}` as const), ...backs.map(item => `back:${item.id}` as const)];
    for (const key of keys) {
      const note = value.notes[key];
      if (typeof note === 'string') result.notes[key] = note.slice(0, MAX_SURFACE_NOTE_LENGTH);
    }
  }
  if (Array.isArray(value.pairings)) for (const pairing of value.pairings) {
    if (!object(pairing) || !isEdition(pairing.edition) || !context(pairing.context) || !isFinishId(pairing.finish) || !isBackId(pairing.back) || !isLogoMode(pairing.logo)) continue;
    result.pairings.push({ edition: pairing.edition, context: pairing.context, finish: pairing.finish, back: pairing.back, logo: pairing.logo, note: typeof pairing.note === 'string' ? pairing.note.slice(0, MAX_SURFACE_NOTE_LENGTH) : '' });
    if (result.pairings.length === MAX_SURFACE_PAIRINGS) break;
  }
  if (typeof value.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) && Number.isFinite(Date.parse(value.updatedAt))) result.updatedAt = value.updatedAt;
  return result;
}

// Accept a query string directly, so URL parsing also works during static rendering.
export function parseSurfaceUrl(search: string | URLSearchParams, defaults: SurfaceSelection = DEFAULT_SURFACE_SELECTION): SurfaceSelection & { view: SurfaceView } {
  const params = new URLSearchParams(search);
  return { ...selection({ finish: params.get('finish'), back: params.get('back'), logo: params.get('logo') }, defaults), view: params.get('view') === 'gallery' ? 'gallery' : 'stage' };
}
