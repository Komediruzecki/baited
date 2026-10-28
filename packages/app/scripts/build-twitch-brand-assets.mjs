import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIXEL_FAVICON, PIXEL_LOGO_ROWS, pixelFaviconRows, pixelFaviconSvg, pixelLogoPath } from '../../landing/site/pixel-logo.js';

// Format exports of the approved identity, not another generated logo variant. Every listing
// image is the taskbar icon's design: the landing's pixel B favicon, the wordmark's B in deep ink
// on the violet, drawn from the landing's grid with each square on whole pixels, so no renderer
// blurs an edge. Keep the original identity and earlier listing exports intact; this script only
// writes the selected listing folder.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = { version: '0.0.3', outDir: undefined };
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--help') {
    console.log('Usage: node scripts/build-twitch-brand-assets.mjs [--version SEMVER] [--out-dir PATH]');
    process.exit(0);
  }
  if (flag !== '--version' && flag !== '--out-dir') throw new Error(`Unknown option: ${flag}`);
  const value = process.argv[++index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  options[flag === '--version' ? 'version' : 'outDir'] = value;
}
if (!/^\d+\.\d+\.\d+$/.test(options.version)) throw new Error('Use a three-part Extension version, for example 0.0.3.');
const out = resolve(options.outDir ?? resolve(app, `assets/twitch/v${options.version}`));
const archive = resolve(app, 'assets/twitch/v0.0.1');
const archiveRelative = relative(archive, out);
if (!archiveRelative || (!archiveRelative.startsWith('..') && !archiveRelative.startsWith('/'))) {
  throw new Error('The v0.0.1 listing exports are archived. Choose a new version or another output folder.');
}
const hash = (data) => createHash('sha256').update(data).digest('hex');
const { cols, ground, ink } = PIXEL_FAVICON;
const rows = pixelFaviconRows();

// The B centred on the violet, `cell` pixels to a square of the grid.
function placement(width, height, cell) {
  const x = (width - cols * cell) / 2, y = (height - PIXEL_LOGO_ROWS * cell) / 2;
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error(`The B does not sit on whole pixels at ${width} × ${height}.`);
  return { x, y };
}
function svg(width, height, cell, title) {
  const { x, y } = placement(width, height, cell);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><title>${title}</title><rect width="${width}" height="${height}" fill="${ground}"/><path fill="${ink}" transform="translate(${x} ${y}) scale(${cell})" d="${pixelLogoPath(rows, cols)}"/></svg>\n`;
}

// An 8-bit RGB PNG painted square by square, as the landing writes its favicon PNG.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}
function png(width, height, cell) {
  const { x: left, y: top } = placement(width, height, cell);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  const paint = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) raw.set(color, y * stride + 1 + x * 3);
  };
  paint(0, 0, width, height, rgb(ground));
  rows.forEach((row, y) => {
    for (let x = 0; x < cols; x++) if (row[x] === '#') paint(left + x * cell, top + y * cell, cell, cell, rgb(ink));
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(out, { recursive: true });
const assets = [];
for (const [name, width, height, cell, title, purpose] of [
  ['logo-100', 100, 100, 7, 'Baited Extension logo', 'Twitch Extension logo'],
  ['icon-24', 24, 24, 2, 'Baited B icon', 'Optional video-component taskbar icon; not required by the panel'],
  ['discovery-300x200', 300, 200, 14, 'Baited card game for Twitch chat', 'Twitch discovery image'],
]) {
  const image = png(width, height, cell);
  await writeFile(resolve(out, `${name}.svg`), svg(width, height, cell, title));
  await writeFile(resolve(out, `${name}.png`), image);
  assets.push({ file: `${name}.png`, source: `${name}.svg`, width, height, square: cell, bytes: image.length, sha256: hash(image), purpose });
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify({
  extensionVersion: options.version, category: 'Games in Extensions',
  identity: 'The taskbar icon design on every listing image: the landing pixel B favicon, without an added hook',
  source: 'packages/landing/site/pixel-logo.js (PIXEL_FAVICON)',
  sourceSha256: hash(pixelFaviconSvg()), renderer: 'scripts/build-twitch-brand-assets.mjs, whole-pixel squares',
  licensing: 'Project identity supplied by the owner. No Twitch marks or third-party game marks used. Existing A/B/C explorations preserved.',
  screenshots: 'Capture the actual running panel and studio. No staged landing film or generated interface is included as a screenshot.',
  assets,
}, null, 2) + '\n');
console.log(`Exported ${assets.length} Twitch brand assets to ${out}`);
