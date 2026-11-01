import { ONNX_VERSION, TRANSFORMERS_VERSION, WHISPER_MODEL, WHISPER_REVISION } from './whisper-client';

const SETUP_MESSAGE = 'Whisper assets are not prepared for this preview. Run the local asset preparation script, then restart with BAITED_SPEECH_ASSET_DIR.';

/** Vite can serve its HTML fallback with status 200 when assets are not configured. */
export async function verifyWhisperManifest(response: Pick<Response, 'ok' | 'headers' | 'json'>): Promise<void> {
  if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new Error(SETUP_MESSAGE);
  }
  let manifest: unknown;
  try { manifest = await response.json(); }
  catch { throw new Error(SETUP_MESSAGE); }
  if (!manifest || typeof manifest !== 'object') throw new Error(SETUP_MESSAGE);
  const value = manifest as Record<string, unknown>;
  if (value.format !== 'baited-local-whisper-assets-v1' || value.model !== WHISPER_MODEL ||
    value.revision !== WHISPER_REVISION || value.transformers !== TRANSFORMERS_VERSION || value.onnx !== ONNX_VERSION) {
    throw new Error('The prepared Whisper assets do not match this bench version. Prepare them again.');
  }
}
