import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asciiPixels, brushStroke, clonePixels, commitPixels, floodPixels, hasPixels, newPixelDocument,
  pixelHistory, pixelPreset, pixelsFromRgba, PIXEL_PALETTES, PIXEL_SIZES, PIXEL_STAMPS,
  redoPixels, resizePixels, stampPixels, undoPixels, validPixelDocument,
} from '../client/pixel-art-model';
import { importPixelImage, MAX_PIXEL_IMPORT_BYTES, rasterDimensions, renderPixelDocument } from '../client/pixel-art-image';

const purple = '#9146ff', yellow = '#fffc79';
const pngHeader = (width: number, height: number) => {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width); new DataView(bytes.buffer).setUint32(20, height);
  return bytes.buffer;
};

test('a diagonal drag leaves no gaps, mirrors, erases and does not mutate its starting grid', () => {
  const blank = newPixelDocument();
  const drawn = brushStroke(blank, { x: 1, y: 1 }, { x: 5, y: 5 }, purple, 1, true);
  assert.equal(hasPixels(blank), false);
  for (let i = 1; i <= 5; i++) {
    assert.equal(drawn.pixels[i * 32 + i], purple);
    assert.equal(drawn.pixels[i * 32 + 31 - i], purple);
  }
  const erased = brushStroke(drawn, { x: 1, y: 1 }, { x: 5, y: 5 }, null, 1, true);
  assert.equal(hasPixels(erased), false);
  const edge = brushStroke(blank, { x: -10, y: -10 }, { x: -5, y: -5 }, purple, 5);
  assert.equal(edge.pixels.filter(Boolean).length, 9);
  assert.equal(edge.pixels.length, 1024);
});

test('fill respects connected regions and mirroring fills the corresponding region', () => {
  const barrier = brushStroke(newPixelDocument(), { x: 15, y: 0 }, { x: 15, y: 31 }, yellow);
  const left = floodPixels(barrier, { x: 2, y: 2 }, purple);
  assert.equal(left.pixels.filter((color) => color === purple).length, 15 * 32);
  assert.equal(left.pixels[16], null);
  assert.equal(left.pixels[15], yellow);
  const both = floodPixels(barrier, { x: 2, y: 2 }, purple, true);
  assert.equal(both.pixels.filter((color) => color === purple).length, 31 * 32);
  assert.equal(barrier.pixels[0], null);
  assert.equal(floodPixels(barrier, { x: -1, y: 0 }, purple), barrier);
});

test('all authored parts and presets stay bounded at every supported grid size', () => {
  for (const size of PIXEL_SIZES) {
    for (const part of PIXEL_STAMPS) {
      for (const point of [{ x: 0, y: 0 }, { x: size - 1, y: size - 1 }]) {
        const result = stampPixels(newPixelDocument(size), part, point, purple, yellow, 4, true);
        assert.equal(result.pixels.length, size * size);
        assert.ok(validPixelDocument(result));
      }
    }
    for (const kind of ['portrait', 'wizard', 'heart'] as const) {
      const preset = pixelPreset(kind, size);
      assert.ok(hasPixels(preset)); assert.ok(validPixelDocument(preset));
    }
  }
});

test('nearest-neighbour resize preserves colours, transparency and rendering mode', () => {
  const original = brushStroke(newPixelDocument(), { x: 0, y: 0 }, { x: 0, y: 0 }, purple);
  original.renderMode = 'ascii';
  const bigger = resizePixels(original, 64);
  assert.deepEqual([bigger.pixels[0], bigger.pixels[1], bigger.pixels[64], bigger.pixels[65]], Array(4).fill(purple));
  assert.equal(bigger.pixels[2], null);
  assert.equal(bigger.renderMode, 'ascii');
  assert.deepEqual(resizePixels(bigger, 32), original);
});

test('conversion preserves transparency, selects only palette colours and dithers deterministically', () => {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 1024; i++) data.set([127, 127, 127, 255], i * 4);
  data.set([255, 0, 0, 95], 0);
  assert.equal(pixelsFromRgba(data, 32).pixels[0], null);
  assert.equal(pixelsFromRgba(data, 32).pixels[1], '#7f7f7f');
  const dithered = pixelsFromRgba(data, 32, ['#000000', '#ffffff'], true);
  assert.deepEqual(pixelsFromRgba(data, 32, ['#000000', '#ffffff'], true), dithered);
  assert.ok(dithered.pixels.includes('#000000')); assert.ok(dithered.pixels.includes('#ffffff'));
  const brand = pixelsFromRgba(data, 32, PIXEL_PALETTES.baited, true);
  assert.ok(brand.pixels.every((color) => color === null || (PIXEL_PALETTES.baited as readonly string[]).includes(color)));
  assert.throws(() => pixelsFromRgba(new Uint8ClampedArray(8), 32), /dimensions/);
});

test('ASCII preserves grid dimensions and transparent cells', () => {
  const doc = newPixelDocument(); doc.pixels[0] = '#000000'; doc.pixels[1] = '#ffffff';
  const rows = asciiPixels(doc);
  assert.equal(rows.length, 32); assert.ok(rows.every((row) => row.length === 32));
  assert.equal(rows[0].slice(0, 3), '@. ');
});

test('history groups strokes, preserves source identity through reset and caps retained actions', () => {
  const source = newPixelDocument(); source.pixels[0] = purple;
  let history = pixelHistory(source);
  const original = history.present;
  assert.notEqual(original.pixels, source.pixels);
  assert.equal(commitPixels(history, clonePixels(original)), history);
  const samePixelsDifferentSource = clonePixels(original);
  history = commitPixels(history, samePixelsDifferentSource, true);
  assert.equal(history.present, samePixelsDifferentSource);
  assert.equal(undoPixels(history).present, original);
  history = commitPixels(history, newPixelDocument());
  assert.equal(undoPixels(history).present, samePixelsDifferentSource);
  assert.equal(redoPixels(undoPixels(history)).present, history.present);
  for (let i = 0; i < 40; i++) history = commitPixels(history, brushStroke(history.present, { x: i % 32, y: Math.floor(i / 32) }, { x: i % 32, y: Math.floor(i / 32) }, purple));
  assert.equal(history.past.length, 30);
  history = undoPixels(history);
  history = commitPixels(history, { ...history.present, renderMode: 'ascii' });
  assert.equal(history.future.length, 0);
});

test('editable documents reject unsupported sizes, malformed cells and wrong versions', () => {
  assert.ok(validPixelDocument(newPixelDocument()));
  for (const invalid of [null, { ...newPixelDocument(), version: 2 }, { ...newPixelDocument(), size: 8192 }, { ...newPixelDocument(), pixels: [] }, { ...newPixelDocument(), renderMode: 'svg' }]) assert.equal(validPixelDocument(invalid), false);
  const unsafe = newPixelDocument(); unsafe.pixels[0] = 'url(https://example.test)';
  assert.equal(validPixelDocument(unsafe), false);
});

test('raster preflight reads PNG, JPEG and WebP dimensions before decoding', () => {
  assert.deepEqual(rasterDimensions(pngHeader(100, 200)), { width: 100, height: 200, mime: 'image/png' });
  const jpeg = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 100, 0, 200, 0]);
  assert.deepEqual(rasterDimensions(jpeg.buffer), { width: 200, height: 100, mime: 'image/jpeg' });
  const webp = new Uint8Array(30);
  webp.set([82, 73, 70, 70]); webp.set([87, 69, 66, 80, 86, 80, 56, 88], 8);
  webp[24] = 99; webp[27] = 199;
  assert.deepEqual(rasterDimensions(webp.buffer), { width: 100, height: 200, mime: 'image/webp' });
  webp[20] = 2; assert.throws(() => rasterDimensions(webp.buffer), /still image/);
});

test('import rejects large files, oversized dimensions and non-raster data before touching browser APIs', async () => {
  assert.throws(() => rasterDimensions(pngHeader(2049, 100)), /2048/);
  assert.throws(() => rasterDimensions(pngHeader(1, 100_000)), /2048/);
  assert.throws(() => rasterDimensions(pngHeader(0, 100)), /valid PNG/);
  assert.throws(() => rasterDimensions(new TextEncoder().encode('<svg><script>bad()</script></svg>').buffer), /valid PNG/);
  await assert.rejects(importPixelImage(new Blob([new Uint8Array(MAX_PIXEL_IMPORT_BYTES + 1)]), 32, 'original', false), /5 MB/);
  await assert.rejects(importPixelImage(new Blob([pngHeader(4096, 4096)]), 32, 'original', false), /2048/);
});

test('Canvas2D rendering clears previous artwork and exports only occupied cells', () => {
  const calls: { op: string; args: unknown[] }[] = [];
  const context = {
    clearRect: (...args: unknown[]) => calls.push({ op: 'clear', args }),
    fillRect: (...args: unknown[]) => calls.push({ op: 'pixel', args }),
    fillText: (...args: unknown[]) => calls.push({ op: 'character', args }),
  } as unknown as CanvasRenderingContext2D;
  const doc = newPixelDocument(48); doc.pixels[0] = purple; doc.pixels[2303] = yellow;
  renderPixelDocument(context, doc, 512);
  assert.deepEqual(calls[0], { op: 'clear', args: [0, 0, 512, 512] });
  assert.equal(calls.filter((item) => item.op === 'pixel').length, 2);
  assert.ok(calls.filter((item) => item.op === 'pixel').every(({ args: [x, y, width, height] }) => Number(x) + Number(width) <= 512 && Number(y) + Number(height) <= 512));
  calls.length = 0; renderPixelDocument(context, { ...doc, renderMode: 'ascii' }, 512);
  assert.equal(calls.filter((item) => item.op === 'character').length, 2);
});
