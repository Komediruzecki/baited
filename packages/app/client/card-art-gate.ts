import { CARD_ART_LIMITS } from '../shared/card-art';
import type { ArtScreen } from '../shared/card-art-policy';

export interface CheckedArt { png: Blob; width: number; height: number }
export interface CardArtSteps {
  decode(file: Blob): Promise<ImageBitmap>;
  screen(bitmap: ImageBitmap): Promise<ArtScreen>;
  fit(bitmap: ImageBitmap): Promise<CheckedArt>;
}

/** Edge Studio's order before an upload. Only an accepted image is fitted, so a blocked, uncertain or failed check leaves nothing to send. */
export async function gateCardArt(file: Blob, steps: CardArtSteps): Promise<CheckedArt> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (!file.size || file.size > CARD_ART_LIMITS.uploadBytes) throw new Error('Choose an image smaller than 5 MB.');
  let bitmap: ImageBitmap;
  try { bitmap = await steps.decode(file); }
  catch { throw new Error('This image could not be read. Try exporting a still PNG, JPEG or WebP, then choose the new file.'); }
  try {
    if (bitmap.width > CARD_ART_LIMITS.inputEdge || bitmap.height > CARD_ART_LIMITS.inputEdge || bitmap.width * bitmap.height > CARD_ART_LIMITS.inputPixels)
      throw new Error('This image has too many pixels. Resize it to 32 megapixels or fewer, with neither side above 8192 pixels, then try again.');
    const decision = await steps.screen(bitmap);
    if (decision === 'blocked') throw new Error('This image did not pass the sexual-content check. Choose a different image.');
    if (decision === 'uncertain') throw new Error('The image check could not clear this artwork. Try a different image or use a text card.');
    if (decision !== 'accepted') throw new Error('The image check could not run in this browser. Reload Studio and try again, or use a text card.');
    return await steps.fit(bitmap);
  } finally { bitmap.close(); }
}
