/** Local sexual-content screening, not a guarantee or a general content-safety classifier. */
export const CARD_ART_POLICY = 'sexual-screen-v1';
export const CARD_ART_MODEL = 'nsfwjs-4.4.0/MobileNetV2Mid';
/** SHA-256 of JSON.stringify(model topology) followed by decoded weight bytes. */
export const CARD_ART_MODEL_SHA256 = '70d00d1ec460f74698ffa29ad6b9b754b95430efc4b9827f630ae44a856538e3';
/** Edge Studio sends this with each upload after its on-device check. The server cannot verify the check; the value stops a stale bundle from skipping it. */
export const CARD_ART_CHECK = `${CARD_ART_POLICY}+${CARD_ART_MODEL}`;
const classes = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'] as const;
export interface ArtPrediction { className: string; probability: number }
export type ArtScreen = 'accepted' | 'blocked' | 'uncertain' | 'unavailable';

/** Unknown/malformed outputs never become an approval. Both alpha composites must pass. */
export function screenArt(predictions: unknown): ArtScreen {
  if (!Array.isArray(predictions) || predictions.length !== 2) return 'unavailable';
  let uncertain = false;
  for (const surface of predictions) {
    if (!Array.isArray(surface) || surface.length !== classes.length) return 'unavailable';
    const scores = new Map<string, number>();
    for (const entry of surface) {
      if (!entry || typeof entry !== 'object' || !classes.includes(entry.className) ||
          typeof entry.probability !== 'number' || !Number.isFinite(entry.probability) ||
          entry.probability < 0 || entry.probability > 1 || scores.has(entry.className)) return 'unavailable';
      scores.set(entry.className, entry.probability);
    }
    if (Math.abs([...scores.values()].reduce((a, b) => a + b, 0) - 1) > 0.02) return 'unavailable';
    const explicit = scores.get('Porn')! + scores.get('Hentai')!;
    const sexual = explicit + scores.get('Sexy')!;
    if (explicit >= 0.25 || scores.get('Sexy')! >= 0.5 || sexual >= 0.5) return 'blocked';
    // Conservative starting policy. Pixel art/ASCII needs real false-positive review;
    // these thresholds are an application policy, not a claimed model accuracy.
    if (explicit >= 0.08 || sexual >= 0.2) uncertain = true;
  }
  return uncertain ? 'uncertain' : 'accepted';
}
