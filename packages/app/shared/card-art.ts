import { z } from 'zod';

export interface CardArtLimits {
  /** The file Studio accepts before fitting it: bytes, longest side and pixel count. */
  uploadBytes: number;
  inputEdge: number;
  inputPixels: number;
  /** The fitted PNG that is stored. */
  outputEdge: number;
  outputBytes: number;
  /** Per channel. */
  assets: number;
  storedBytes: number;
}
/** Raster uploads remain private until an authorized game projection exposes a round image. */
export const CARD_ART_LIMITS = {
  uploadBytes: 5 * 1024 * 1024,
  inputEdge: 8192,
  inputPixels: 32_000_000,
  outputEdge: 512,
  outputBytes: 2 * 1024 * 1024,
  assets: 400,
  storedBytes: 100 * 1024 * 1024,
} as const satisfies CardArtLimits;
/** The edge pilot keeps browser-fitted PNGs with the channel's room, so its per-image and per-channel caps are tighter. */
export const EDGE_CARD_ART_LIMITS = {
  ...CARD_ART_LIMITS,
  outputBytes: 1024 * 1024,
  assets: 200,
  storedBytes: 40 * 1024 * 1024,
} as const satisfies CardArtLimits;
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
  limits: CardArtLimits;
}
export interface CardArtLibraryView {
  art: CardArtView[];
  bytes: number;
  limits: CardArtLimits;
}
export type CardArtErrorCode = 'invalid_image' | 'image_dimensions' | 'blocked_image' | 'uncertain_image' |
  'scan_unavailable' | 'art_busy' | 'art_quota' | 'art_storage' | 'art_missing' | 'art_referenced' | 'art_refused';
export interface CardArtErrorView { error: string; code: CardArtErrorCode }

export const cardArtIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Carries CARD_ART_CHECK from edge Studio's on-device check. */
export const CARD_ART_CHECK_HEADER = 'x-art-check';

export interface ArtUploadOptions { purpose: CardArtPurpose; source: CardArtSource; sourceId?: string }
export const artUploadOptionsSchema = z.object({
  purpose: z.enum(['source', 'card']).default('card'),
  source: z.enum(['upload', 'pixel', 'ascii', 'draw']).default('upload'),
  sourceId: z.string().regex(cardArtIdPattern).optional(),
}).strict().refine((value) => !(value.purpose === 'source' && value.sourceId), 'A source image cannot refer to another source.');
