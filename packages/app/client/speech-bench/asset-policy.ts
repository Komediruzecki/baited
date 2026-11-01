export const SPEECH_ASSET_PREFIX = '/speech-bench-assets/';

/** Audio never enters a request body; only prepared same-origin files may be read. */
export function allowedSpeechAssetRequest(url: string, method: string, origin: string): boolean {
  try {
    const target = new URL(url, origin);
    return method.toUpperCase() === 'GET' && target.origin === origin && target.pathname.startsWith(SPEECH_ASSET_PREFIX);
  } catch { return false; }
}
