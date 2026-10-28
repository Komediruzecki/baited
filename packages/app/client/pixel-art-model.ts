export const PIXEL_SIZES = [32, 48, 64] as const;
export type PixelSize = typeof PIXEL_SIZES[number];
export type PixelColor = string | null;
export interface PixelDocument { version: 1; size: PixelSize; pixels: PixelColor[]; renderMode: 'pixels' | 'ascii' }
export interface Point { x: number; y: number }
export interface PixelStamp { id: string; name: string; rows: string[] }
export const PIXEL_PALETTES = {
  baited: ['#160f22', '#39204f', '#7721e5', '#9146ff', '#c9a3ff', '#fffdf7', '#fffc79', '#efac73', '#a85b63', '#e75b88', '#66c6a6', '#5c92d9'],
  arcade: ['#15152c', '#353552', '#65758c', '#e6e6dc', '#ffcb70', '#e78042', '#b34b57', '#702b66', '#ab68ce', '#5a7cc4', '#4ba2a8', '#80c79b'],
  ink: ['#17121f', '#51445e', '#8e7ca1', '#cbbadf', '#fffdf7'],
} as const;
export type PixelPalette = keyof typeof PIXEL_PALETTES;

// Original, hand-authored pixel shapes. A primary mark is 1, its highlight is 2.
export const PIXEL_STAMPS: readonly PixelStamp[] = [
  { id: 'head', name: 'Head', rows: ['...11111...', '..1111111..', '.111111111.', '11111111111', '11111111111', '11111111111', '11111111111', '.111111111.', '..1111111..', '...11111...'] },
  { id: 'face', name: 'Face', rows: ['11...11', '11...11', '.......', '...1...', '.......', '.1...1.', '..111..'] },
  { id: 'hat', name: 'Hat', rows: ['....11111....', '...1111111...', '...1111111...', '...2222222...', '.11111111111.', '1111111111111'] },
  { id: 'cap', name: 'Cap', rows: ['...111111....', '..11111111...', '.1111111111..', '.1111111111..', '.222222222222', '..........111'] },
  { id: 'moustache', name: 'Moustache', rows: ['...11.11...', '..1111111..', '.111111111.', '11111.11111', '1111...1111', '.11.....11.'] },
  { id: 'glasses', name: 'Glasses', rows: ['11111.11111', '12..111..21', '1...1.1...1', '.111...111.'] },
  { id: 'spark', name: 'Spark', rows: ['...1...', '...1...', '..111..', '1112111', '..111..', '...1...', '...1...'] },
  { id: 'heart', name: 'Heart', rows: ['.111.111.', '112111111', '111111111', '.1111111.', '..11111..', '...111...', '....1....'] },
];
export const newPixelDocument = (size: PixelSize = 32): PixelDocument => ({ version: 1, size, pixels: Array(size * size).fill(null), renderMode: 'pixels' });
export function validPixelDocument(value: unknown): value is PixelDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Partial<PixelDocument>;
  return doc.version === 1 && PIXEL_SIZES.includes(doc.size as PixelSize) &&
    ['pixels', 'ascii'].includes(doc.renderMode ?? '') && Array.isArray(doc.pixels) &&
    doc.pixels.length === doc.size! * doc.size! && doc.pixels.every((p) => p === null || typeof p === 'string' && /^#[0-9a-f]{6}$/i.test(p));
}
export const clonePixels = (doc: PixelDocument): PixelDocument => ({ ...doc, pixels: [...doc.pixels] });
export const hasPixels = (doc: PixelDocument) => doc.pixels.some((color) => color !== null);
const inside = (size: number, x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size;

export function brushStroke(doc: PixelDocument, from: Point, to: Point, color: PixelColor, width = 1, mirror = false): PixelDocument {
  const result = clonePixels(doc), size = doc.size;
  const brush = Math.max(1, Math.min(5, Math.round(width))), offset = Math.floor(brush / 2);
  let x = Math.max(0, Math.min(size - 1, Math.round(from.x))), y = Math.max(0, Math.min(size - 1, Math.round(from.y)));
  const endX = Math.max(0, Math.min(size - 1, Math.round(to.x))), endY = Math.max(0, Math.min(size - 1, Math.round(to.y)));
  const dx = Math.abs(endX - x), dy = -Math.abs(endY - y), sx = x < endX ? 1 : -1, sy = y < endY ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    for (let by = 0; by < brush; by++) for (let bx = 0; bx < brush; bx++) {
      const px = x + bx - offset, py = y + by - offset;
      if (inside(size, px, py)) result.pixels[py * size + px] = color;
      if (mirror && inside(size, size - 1 - px, py)) result.pixels[py * size + size - 1 - px] = color;
    }
    if (x === endX && y === endY) break;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
  return result;
}
export function floodPixels(doc: PixelDocument, point: Point, color: PixelColor, mirror = false): PixelDocument {
  if (!inside(doc.size, point.x, point.y)) return doc;
  const result = clonePixels(doc), size = doc.size;
  const fill = (start: number) => {
    const previous = result.pixels[start];
    if (previous === color) return;
    const stack = [start]; result.pixels[start] = color;
    while (stack.length) {
      const i = stack.pop()!, x = i % size, y = Math.floor(i / size);
      for (const next of [x > 0 ? i - 1 : -1, x + 1 < size ? i + 1 : -1, y > 0 ? i - size : -1, y + 1 < size ? i + size : -1]) {
        if (next >= 0 && result.pixels[next] === previous) { result.pixels[next] = color; stack.push(next); }
      }
    }
  };
  fill(point.y * size + point.x);
  if (mirror) fill(point.y * size + size - point.x - 1);
  return result;
}
export function stampPixels(doc: PixelDocument, stamp: PixelStamp, at: Point, primary: string, secondary: string, scale = 1, mirror = false): PixelDocument {
  const result = clonePixels(doc), zoom = Math.max(1, Math.min(4, Math.round(scale)));
  const width = Math.max(...stamp.rows.map((row) => row.length)), height = stamp.rows.length;
  const startX = at.x - Math.floor(width * zoom / 2), startY = at.y - Math.floor(height * zoom / 2);
  stamp.rows.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '1' && cell !== '2') return;
    for (let sy = 0; sy < zoom; sy++) for (let sx = 0; sx < zoom; sx++) {
      const px = startX + x * zoom + sx, py = startY + y * zoom + sy;
      if (inside(doc.size, px, py)) result.pixels[py * doc.size + px] = cell === '1' ? primary : secondary;
      if (mirror && inside(doc.size, doc.size - 1 - px, py)) result.pixels[py * doc.size + doc.size - 1 - px] = cell === '1' ? primary : secondary;
    }
  }));
  return result;
}
export function resizePixels(doc: PixelDocument, size: PixelSize): PixelDocument {
  const next = newPixelDocument(size); next.renderMode = doc.renderMode;
  next.pixels = next.pixels.map((_, i) => doc.pixels[Math.min(doc.size - 1, Math.floor(Math.floor(i / size) * doc.size / size)) * doc.size + Math.min(doc.size - 1, Math.floor((i % size) * doc.size / size))]);
  return next;
}
export function pixelPreset(kind: 'portrait' | 'wizard' | 'heart', size: PixelSize = 32): PixelDocument {
  let doc = newPixelDocument(size);
  const scale = size / 32, point = (x: number, y: number) => ({ x: Math.round(x * scale), y: Math.round(y * scale) });
  const stamp = (id: string) => PIXEL_STAMPS.find((item) => item.id === id)!;
  if (kind === 'heart') return stampPixels(doc, stamp('heart'), point(16, 16), '#e75b88', '#fffdf7', size === 64 ? 4 : 3);
  const zoom = size === 32 ? 2 : 3;
  doc = stampPixels(doc, stamp('head'), point(16, 18), '#efac73', '#fffc79', zoom);
  doc = stampPixels(doc, stamp('face'), point(16, 18), '#160f22', '#fffdf7', Math.round(scale));
  if (kind === 'wizard') doc = stampPixels(doc, stamp('hat'), point(16, 7), '#9146ff', '#fffc79', Math.round(scale));
  else doc = stampPixels(doc, stamp('cap'), point(16, 7), '#7721e5', '#c9a3ff', Math.round(scale));
  return doc;
}
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function pixelsFromRgba(data: Uint8ClampedArray, size: PixelSize, palette?: readonly string[], dither = false): PixelDocument {
  if (data.length !== size * size * 4) throw new Error('The imported image has the wrong pixel dimensions.');
  const doc = newPixelDocument(size), colors = palette?.map((hex) => ({ hex, values: rgb(hex) }));
  for (let i = 0; i < doc.pixels.length; i++) {
    if (data[i * 4 + 3] < 96) continue;
    const offset = dither && colors ? (bayer[Math.floor(i / size) % 4 * 4 + i % size % 4] - 7.5) * 3 : 0;
    const values = [0, 1, 2].map((c) => Math.max(0, Math.min(255, data[i * 4 + c] + offset)));
    if (colors?.length) {
      let best = colors[0], distance = Infinity;
      for (const candidate of colors) {
        const difference = candidate.values.reduce((sum, value, c) => sum + (value - values[c]) ** 2, 0);
        if (difference < distance) { distance = difference; best = candidate; }
      }
      doc.pixels[i] = best.hex;
    } else doc.pixels[i] = '#' + values.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  return doc;
}
export function asciiPixels(doc: PixelDocument): string[] {
  const ramp = '@%#*+=-:.';
  return Array.from({ length: doc.size }, (_, y) => doc.pixels.slice(y * doc.size, (y + 1) * doc.size).map((color) => {
    if (!color) return ' ';
    const [r, g, b] = rgb(color), light = (r * .2126 + g * .7152 + b * .0722) / 255;
    return ramp[Math.min(ramp.length - 1, Math.floor(light * ramp.length))];
  }).join(''));
}

export interface PixelHistory { past: PixelDocument[]; present: PixelDocument; future: PixelDocument[] }
export const pixelHistory = (doc: PixelDocument): PixelHistory => ({ past: [], present: clonePixels(doc), future: [] });
export function commitPixels(history: PixelHistory, next: PixelDocument, provenanceChanged = false): PixelHistory {
  if (!provenanceChanged && JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return { past: [...history.past.slice(-29), history.present], present: next, future: [] };
}
export function undoPixels(history: PixelHistory): PixelHistory {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}
export function redoPixels(history: PixelHistory): PixelHistory {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
