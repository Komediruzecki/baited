import { crc32, deflateSync } from 'node:zlib';

/** Synthetic PNGs: flat colour, or arbitrary IDAT bytes when only the framing matters. */
export function chunk(type: string, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function ihdr(width: number, height: number, depth = 8, colour = 6) {
  const data = new Uint8Array(13), view = new DataView(data.buffer);
  view.setUint32(0, width); view.setUint32(4, height);
  data[8] = depth; data[9] = colour;
  return chunk('IHDR', data);
}
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => { out.set(part, at); return at + part.length; }, 0);
  return out;
};
export const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
export function png(width: number, height: number, options: { before?: Uint8Array[]; after?: Uint8Array[]; idat?: Uint8Array; rgba?: [number, number, number, number] } = {}) {
  const [r, g, b, a] = options.rgba ?? [240, 180, 40, 255];
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set([r, g, b, a], y * (1 + width * 4) + 1 + x * 4);
  return concat([SIGNATURE, ihdr(width, height), ...(options.before ?? []), chunk('IDAT', options.idat ?? deflateSync(raw)), chunk('IEND'), ...(options.after ?? [])]);
}
export { concat };
