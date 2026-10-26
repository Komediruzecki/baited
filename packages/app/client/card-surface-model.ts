// Surface preferences are independent of the existing version-one edition picks.
export const CARD_SURFACE_STORAGE_KEY = 'baited.card-surfaces.v1';

export type SurfaceChoice = {
  version: 1;
  finish: string;
  back: string;
  showLogo: boolean;
};

export function parseSurfaceChoice(
  source: string | null | undefined,
  allowedFinishIds: readonly string[],
  allowedBackIds: readonly string[],
  defaults: Omit<SurfaceChoice, 'version'>,
): SurfaceChoice {
  if (!allowedFinishIds.includes(defaults.finish) || !allowedBackIds.includes(defaults.back) || typeof defaults.showLogo !== 'boolean') {
    throw new TypeError('Surface defaults must use allowed IDs and a boolean logo preference.');
  }
  const fallback: SurfaceChoice = { version: 1, finish: defaults.finish, back: defaults.back, showLogo: defaults.showLogo };
  try {
    const value: unknown = JSON.parse(source || 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('version' in value) || value.version !== 1) return fallback;
    const saved = value as Record<string, unknown>;
    return {
      version: 1,
      finish: typeof saved.finish === 'string' && allowedFinishIds.includes(saved.finish) ? saved.finish : fallback.finish,
      back: typeof saved.back === 'string' && allowedBackIds.includes(saved.back) ? saved.back : fallback.back,
      showLogo: typeof saved.showLogo === 'boolean' ? saved.showLogo : fallback.showLogo,
    };
  } catch { return fallback; }
}
