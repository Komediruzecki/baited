// The landing's pixel reveal (packages/landing/selected-cards/selected-cards.js): the
// first time a card face is shown, its illustration resolves from 8 to 160 pixel blocks in
// 630 ms. Reduced motion, a hidden page or a cleared card shows the finished image.
// Only artwork goes through the canvas; the word and clues never do.
export const PIXEL_STEPS = Object.freeze([8, 12, 20, 32, 56, 96, 160]);
export const PIXEL_STEP_MS = 90;
export const PIXEL_REVEAL_MS = 630;

const prefersReducedMotion = () =>
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Plays one reveal on a loaded image and returns a function that stops it. `holder`
 * carries data-resolving while the pixels show. `hold` keeps the coarsest step for that
 * many milliseconds first, for a face that is still turning over. When the reveal ends or
 * stops, the canvas is emptied, so it never keeps an earlier card's artwork.
 */
export function revealPixels({ holder, image, canvas, hold = 0 }) {
  const doc = globalThis.document;
  const frame = globalThis.requestAnimationFrame;
  const cancelFrame = globalThis.cancelAnimationFrame;
  if (!holder || !image || !canvas || typeof frame !== 'function' || doc?.hidden || prefersReducedMotion())
    return () => {};
  if (!image.complete || !image.naturalWidth) return () => {};
  const drawing = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!drawing) return () => {};
  let request = 0;
  let started = null;
  let previous = -1;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelFrame?.(request);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    holder.dataset.resolving = 'false';
    canvas.width = 1;
    canvas.height = 1;
  };
  function onVisibility() {
    if (doc.hidden) stop();
  }
  const paint = (index) => {
    if (index === previous) return;
    previous = index;
    canvas.width = PIXEL_STEPS[index];
    canvas.height = Math.max(1, Math.round((canvas.width * image.naturalHeight) / image.naturalWidth));
    drawing.imageSmoothingEnabled = false;
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  const tick = (now) => {
    if (done) return;
    if (doc?.hidden || prefersReducedMotion()) return stop();
    if (started === null) started = now + hold;
    const elapsed = now - started;
    if (elapsed >= PIXEL_REVEAL_MS) return stop();
    try {
      paint(Math.max(0, Math.min(PIXEL_STEPS.length - 1, Math.floor(elapsed / PIXEL_STEP_MS))));
    } catch {
      return stop();
    }
    request = frame(tick);
  };
  // Paint the coarsest step at once so the finished image never flashes first.
  try {
    paint(0);
  } catch {
    return () => {};
  }
  holder.dataset.resolving = 'true';
  doc?.addEventListener?.('visibilitychange', onVisibility);
  request = frame(tick);
  return stop;
}
