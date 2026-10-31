import { PIXEL_LOGO_COLS } from './pixel-logo.js'

// Shared by the landing navigation and Studio; no scrolling or page-wide listeners.
export const INK_COLOR = '#7721e5'
export const LOGO_COLUMNS = 10
export const LOGO_ROWS = 4
export const WAVE_STEP = 12
export const WAVE_HOP = 150
export const WAVE_TOTAL = (PIXEL_LOGO_COLS - 1) * WAVE_STEP + WAVE_HOP

export function waveLift(x, t, forward = true) {
  const start = (forward ? x : PIXEL_LOGO_COLS - 1 - x) * WAVE_STEP
  return t >= start && t < start + WAVE_HOP ? 1 : 0
}

export function logoPixelDelays() {
  return Array.from({ length: LOGO_COLUMNS * LOGO_ROWS }, () => `${(0.03 + Math.random() * 0.35).toFixed(3)}s`)
}
