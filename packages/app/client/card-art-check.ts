import { EDGE_CARD_ART_LIMITS } from '../shared/card-art';
import { CARD_ART_MODEL_SHA256, screenArt, type ArtScreen } from '../shared/card-art-policy';
import { gateCardArt, type CheckedArt } from './card-art-gate';
import wasmUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url';
import simdUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url';
import threadedUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-threaded-simd.wasm?url';

/**
 * Edge Studio checks and fits each image on the streamer's device before upload: the Node scanner's model
 * (nsfwjs MobileNetV2Mid, same fingerprint) and its screenArt thresholds, on white and dark backgrounds.
 * Canvas resampling differs slightly from sharp's, so scores near a threshold can land differently.
 * A modified client can skip this; the server's size caps and the operator purge still apply.
 */
type Classify = (pixels: ImageData) => Promise<unknown>;
let classifier: Promise<Classify> | null = null;

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadClassifier(): Promise<Classify> {
  const [tf, wasm, nsfw, { MobileNetV2MidModel: definition }] = await Promise.all([
    import('@tensorflow/tfjs'), import('@tensorflow/tfjs-backend-wasm'), import('nsfwjs/core'), import('nsfwjs/models/mobilenet_v2_mid'),
  ]);
  // The worker's fingerprint: topology JSON, then the decoded weights. Another model never screens.
  const parts = [new TextEncoder().encode(JSON.stringify((await definition.modelJson()).default)),
    ...(await Promise.all(definition.weightBundles.map(async (bundle) => decodeBase64((await bundle()).default))))];
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => { all.set(part, at); return at + part.length; }, 0);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', all)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== CARD_ART_MODEL_SHA256) throw new Error('Model fingerprint mismatch.');
  wasm.setWasmPaths({ 'tfjs-backend-wasm.wasm': wasmUrl, 'tfjs-backend-wasm-simd.wasm': simdUrl, 'tfjs-backend-wasm-threaded-simd.wasm': threadedUrl });
  tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
  if (!await tf.setBackend('wasm').catch(() => false)) await tf.setBackend('cpu');
  await tf.ready();
  const network = await nsfw.load('MobileNetV2Mid', { modelDefinitions: [definition] });
  return async (pixels) => {
    const rgb = new Int32Array(224 * 224 * 3);
    for (let i = 0, j = 0; i < pixels.data.length; i += 4) { rgb[j++] = pixels.data[i]!; rgb[j++] = pixels.data[i + 1]!; rgb[j++] = pixels.data[i + 2]!; }
    const tensor = tf.tensor3d(rgb, [224, 224, 3], 'int32');
    try { return await network.classify(tensor, 5); } finally { tensor.dispose(); }
  };
}

async function screen(bitmap: ImageBitmap): Promise<ArtScreen> {
  try {
    const classify = await (classifier ??= loadClassifier().catch((error) => { classifier = null; throw error; }));
    const predictions = [];
    for (const background of ['#ffffff', '#100d18']) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 224;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.fillStyle = background;
      context.fillRect(0, 0, 224, 224);
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, 224, 224);
      predictions.push(await classify(context.getImageData(0, 0, 224, 224)));
    }
    return screenArt(predictions);
  } catch { return 'unavailable'; }
}

/** Longest side at most 512 px, never enlarged, as a fresh PNG without metadata. Very noisy images step down until they fit 1 MB. */
async function fit(bitmap: ImageBitmap): Promise<CheckedArt> {
  for (const edge of [EDGE_CARD_ART_LIMITS.outputEdge, 448, 384]) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    // At 1:1 a copy keeps pixel art exact; a downscale gets the smoothest resampling the browser has.
    context.imageSmoothingEnabled = scale < 1;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png && png.size <= EDGE_CARD_ART_LIMITS.outputBytes) return { png, width, height };
  }
  throw new Error('This image is too detailed to save under 1 MB. Try a simpler image.');
}

export const checkCardArt = (file: Blob): Promise<CheckedArt> =>
  gateCardArt(file, { decode: (blob) => createImageBitmap(blob, { imageOrientation: 'from-image' }), screen, fit });
