import assetLock from './asset-lock.json';
export const WHISPER_ASSET_LIMIT: number;
export const WHISPER_CHUNK_BYTES: number;
export const whisperAssetLock: typeof assetLock;
export function packageWhisperAssets(source: string | undefined, output: string, options?: {
  lock?: typeof assetLock; sourceRoot?: string;
}): Promise<{ available: boolean; model: string; revision: string; totalBytes: number }>;
