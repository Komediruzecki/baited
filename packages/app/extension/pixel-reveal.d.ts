export const PIXEL_STEPS: readonly number[];
export const PIXEL_STEP_MS: number;
export const PIXEL_REVEAL_MS: number;
export function revealPixels(options: {
  holder: HTMLElement;
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  hold?: number;
}): () => void;
