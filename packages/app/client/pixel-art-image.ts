import { asciiPixels, pixelsFromRgba, PIXEL_PALETTES, type PixelDocument, type PixelPalette, type PixelSize } from './pixel-art-model';

export const MAX_PIXEL_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PIXEL_IMPORT_SIDE = 2048;
export function rasterDimensions(buffer: ArrayBuffer): { width: number; height: number; mime: string } {
  const b = new Uint8Array(buffer), view = new DataView(buffer);
  const text = (at: number, n: number) => String.fromCharCode(...b.slice(at, at + n));
  let width = 0, height = 0, mime = '';
  if (b.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) && text(12, 4) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20); mime = 'image/png';
  } else if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    let p = 2;
    while (p + 3 < b.length) {
      if (b[p] !== 255) break;
      while (b[p] === 255) p++;
      const marker = b[p++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (p + 1 >= b.length) break;
      const length = view.getUint16(p);
      if (length < 2 || p + length > b.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        height = view.getUint16(p + 3); width = view.getUint16(p + 5); mime = 'image/jpeg'; break;
      }
      p += length;
    }
  } else if (b.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    const kind = text(12, 4); mime = 'image/webp';
    if (kind === 'VP8X') {
      width = 1 + b[24] + b[25] * 256 + b[26] * 65536; height = 1 + b[27] + b[28] * 256 + b[29] * 65536;
      if (b[20] & 2) throw new Error('Choose a still image. Animated WebP is not supported.');
    } else if (kind === 'VP8L' && b[20] === 47) {
      width = 1 + b[21] + ((b[22] & 63) << 8); height = 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 15) << 10);
    } else if (kind === 'VP8 ' && b[23] === 157 && b[24] === 1 && b[25] === 42) {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    }
  }
  if (!width || !height || !mime) throw new Error('Choose a valid PNG, JPEG or WebP image.');
  if (width > MAX_PIXEL_IMPORT_SIDE || height > MAX_PIXEL_IMPORT_SIDE)
    throw new Error('Use an image up to 2048 pixels on each side.');
  return { width, height, mime };
}

export async function importPixelImage(file: Blob, size: PixelSize, palette: PixelPalette | 'original', dither: boolean): Promise<PixelDocument> {
  if (file.size > MAX_PIXEL_IMPORT_BYTES) throw new Error('Choose an image smaller than 5 MB.');
  const bytes = await file.arrayBuffer(), info = rasterDimensions(bytes);
  // The file header is checked before decoding. Drawing below reduces it to at most 4096 cells.
  const blob = new Blob([bytes], { type: info.mime });
  let source: ImageBitmap | HTMLImageElement | undefined;
  let url: string | undefined;
  try {
    if (typeof createImageBitmap === 'function') source = await createImageBitmap(blob);
    else {
      url = URL.createObjectURL(blob);
      const image = new Image(); image.src = url; await image.decode(); source = image;
    }
    const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
    if (!width || !height || width > MAX_PIXEL_IMPORT_SIDE || height > MAX_PIXEL_IMPORT_SIDE)
      throw new Error('The decoded image is too large. Use an image up to 2048 pixels per side.');
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser could not open the image editor. Try another browser.');
    const scale = Math.min(size / width, size / height), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, size, size); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
    return pixelsFromRgba(ctx.getImageData(0, 0, size, size).data, size, palette === 'original' ? undefined : PIXEL_PALETTES[palette], dither);
  } finally {
    if (source && 'close' in source) source.close();
    if (url) URL.revokeObjectURL(url);
  }
}

export function renderPixelDocument(ctx: CanvasRenderingContext2D, doc: PixelDocument, edge: number) {
  ctx.clearRect(0, 0, edge, edge); ctx.imageSmoothingEnabled = false;
  const step = edge / doc.size;
  if (doc.renderMode === 'ascii') {
    const rows = asciiPixels(doc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.ceil(step * 1.3)}px monospace`;
    rows.forEach((row, y) => [...row].forEach((char, x) => {
      if (char === ' ') return;
      ctx.fillStyle = doc.pixels[y * doc.size + x]!;
      ctx.fillText(char, (x + .5) * step, (y + .5) * step, step);
    }));
  } else doc.pixels.forEach((color, i) => {
    if (!color) return;
    ctx.fillStyle = color;
    const x = i % doc.size, y = Math.floor(i / doc.size);
    ctx.fillRect(Math.floor(x * step), Math.floor(y * step), Math.ceil((x + 1) * step) - Math.floor(x * step), Math.ceil((y + 1) * step) - Math.floor(y * step));
  });
}
export function pixelPng(doc: PixelDocument): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('The artwork could not be rendered. Try again.'));
  renderPixelDocument(ctx, doc, 512);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The PNG could not be created. Your drawing is still here.')), 'image/png'));
}
