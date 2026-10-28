export const PIXEL_SIZES: readonly number[];
export const PIXEL_SPLIT_MS: number;
export const PIXEL_CLEAR_MS: number;
export const PIXEL_REVEAL_MS: number;
export function pixelPlan(options?: {
  sizes?: readonly number[];
  split?: number;
  clear?: number;
  random?: () => number;
}): [number, number][][];
export function revealPixels(options: {
  holder: HTMLElement;
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  hold?: number;
  random?: () => number;
}): () => void;
