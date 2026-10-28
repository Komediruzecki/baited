// The landing's pixel reveal (packages/landing/selected-cards/selected-cards.js), after
// 1minus1.com's case-study cards: the first time a card face is shown, its illustration shows
// as blocks of its own colours (each the average of its patch), 8 across, which split into 16
// and 32 at random moments until the finest clear to the picture, so blocks of every size are
// on the card at once. It takes 400 ms. Reduced motion, a hidden page or a cleared card shows
// the finished image. Only artwork goes through the canvas; the word and clues never do.
export const PIXEL_SIZES = Object.freeze([8, 16, 32]); // blocks across the art, coarse to fine
export const PIXEL_SPLIT_MS = 120; // the most each block waits before it splits…
export const PIXEL_CLEAR_MS = 160; // …and the most a finest block waits before it clears
export const PIXEL_REVEAL_MS = (PIXEL_SIZES.length - 1) * PIXEL_SPLIT_MS + PIXEL_CLEAR_MS;

const prefersReducedMotion = () =>
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * For every level, when each block shows and when it splits (or, at the finest level, clears):
 * [start, end] in ms. The coarsest blocks are there from the start; a finer block appears when
 * its parent splits. The landing's own plan, block for block.
 */
export function pixelPlan({ sizes = PIXEL_SIZES, split = PIXEL_SPLIT_MS, clear = PIXEL_CLEAR_MS, random = Math.random } = {}) {
  const plan = [];
  sizes.forEach((size, level) => {
    const blocks = [];
    const parentSize = sizes[level - 1];
    for (let i = 0; i < size * size; i++) {
      let start = 0;
      if (level) {
        const ratio = size / parentSize;
        const parent = Math.floor(Math.floor(i / size) / ratio) * parentSize + Math.floor((i % size) / ratio);
        start = plan[level - 1][parent][1];
      }
      blocks.push([start, start + random() * (level === sizes.length - 1 ? clear : split)]);
    }
    plan.push(blocks);
  });
  return plan;
}

/** The average colour of every block at every level, read from the picture drawn small. */
function blockColors(image, sizes, scratch) {
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return sizes.map((size) => {
    scratch.width = scratch.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    return Array.from(
      { length: size * size },
      (_, i) => `rgb(${data[i * 4]} ${data[i * 4 + 1]} ${data[i * 4 + 2]} / ${(data[i * 4 + 3] / 255).toFixed(3)})`,
    );
  });
}

/** Paints the blocks showing at `t` ms over a canvas `width` × `height`. */
function paintBlocks(ctx, plan, colors, t, width, height) {
  ctx.clearRect(0, 0, width, height);
  PIXEL_SIZES.forEach((size, level) => {
    const across = width / size;
    const down = height / size;
    plan[level].forEach(([start, end], i) => {
      if (t < start || t >= end) return;
      ctx.fillStyle = colors[level][i];
      ctx.fillRect((i % size) * across, Math.floor(i / size) * down, across, down);
    });
  });
}

/**
 * Plays one reveal on a loaded image and returns a function that stops it. `holder` carries
 * data-resolving while the blocks show, and data-swapped once the picture is under them.
 * `hold` keeps the coarsest blocks for that many milliseconds first, for a face that is still
 * turning over. When the reveal ends or stops, the canvas is emptied, so it never keeps an
 * earlier card's artwork.
 */
export function revealPixels({ holder, image, canvas, hold = 0, random = Math.random }) {
  const doc = globalThis.document;
  const frame = globalThis.requestAnimationFrame;
  const cancelFrame = globalThis.cancelAnimationFrame;
  if (!holder || !image || !canvas || typeof frame !== 'function' || doc?.hidden || prefersReducedMotion())
    return () => {};
  if (!image.complete || !image.naturalWidth) return () => {};
  const drawing = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  const scratch = doc?.createElement?.('canvas');
  if (!drawing || !scratch) return () => {};
  let colors;
  try {
    colors = blockColors(image, PIXEL_SIZES, scratch);
  } catch {
    return () => {};
  }
  const plan = pixelPlan({ random });
  // The picture has to be under the blocks by the time the first of the finest clears.
  const swap = Math.min(...plan.at(-1).map(([, end]) => end));
  // As many canvas pixels across as the finest blocks, and the picture's own proportions.
  const width = PIXEL_SIZES.at(-1);
  const height = Math.max(1, Math.round((width * image.naturalHeight) / image.naturalWidth));
  let request = 0;
  let started = null;
  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    cancelFrame?.(request);
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    holder.dataset.resolving = 'false';
    delete holder.dataset.swapped;
    canvas.width = 1;
    canvas.height = 1;
  };
  function onVisibility() {
    if (doc.hidden) stop();
  }
  const tick = (now) => {
    if (done) return;
    if (doc?.hidden || prefersReducedMotion()) return stop();
    if (started === null) started = now + hold;
    const elapsed = Math.max(0, now - started);
    if (elapsed >= PIXEL_REVEAL_MS) return stop();
    try {
      paintBlocks(drawing, plan, colors, elapsed, width, height);
    } catch {
      return stop();
    }
    if (elapsed >= swap) holder.dataset.swapped = 'true';
    request = frame(tick);
  };
  // Paint the coarsest blocks at once so the finished image never flashes first.
  try {
    canvas.width = width;
    canvas.height = height;
    paintBlocks(drawing, plan, colors, 0, width, height);
  } catch {
    canvas.width = 1;
    canvas.height = 1;
    return () => {};
  }
  holder.dataset.resolving = 'true';
  doc?.addEventListener?.('visibilitychange', onVisibility);
  request = frame(tick);
  return stop;
}
