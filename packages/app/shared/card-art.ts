/** Raster uploads remain private until an authorized game projection exposes a round image. */
export const CARD_ART_LIMITS = {
  uploadBytes: 5 * 1024 * 1024,
  inputEdge: 8192,
  inputPixels: 32_000_000,
  outputEdge: 512,
  outputBytes: 2 * 1024 * 1024,
  assets: 400,
  storedBytes: 100 * 1024 * 1024,
} as const;
export type CardArtPurpose = 'source' | 'card';
export type CardArtSource = 'upload' | 'pixel' | 'ascii' | 'draw';
export interface CardArtView {
  id: string;
  /** Owner-session URL. Never use this URL in a viewer or OBS projection. */
  url: string;
  width: number;
  height: number;
  bytes: number;
  purpose: CardArtPurpose;
  source: CardArtSource;
  sourceId?: string;
  createdAt: number;
}
export interface CardArtUploadResult {
  art: CardArtView;
  limits: typeof CARD_ART_LIMITS;
}
export interface CardArtLibraryView {
  art: CardArtView[];
  bytes: number;
  limits: typeof CARD_ART_LIMITS;
}
export type CardArtErrorCode = 'invalid_image' | 'image_dimensions' | 'blocked_image' | 'uncertain_image' |
  'scan_unavailable' | 'art_busy' | 'art_quota' | 'art_storage' | 'art_missing' | 'art_referenced';
export interface CardArtErrorView { error: string; code: CardArtErrorCode }

export const cardArtIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
