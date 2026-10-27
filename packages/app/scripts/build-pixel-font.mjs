import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Baited Pixel: an original 5 × 7 pixel font for the OBS overlay, in the spirit of a
// block game's chat font. Glyphs are drawn here as bitmaps and written as a TrueType
// file. One font pixel is 125 units of a 1000-unit em, so an 8px font size draws one
// font pixel per CSS pixel; multiples of 8px stay crisp.
// Rows 0-6 sit above the baseline (cap height 7, x-height 5); rows 7-8 are descenders.
const glyphs = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '### .#. .#. .#. .#. .#. ###',
  J: '....# ....# ....# ....# #...# #...# .###.',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #...# #...# #...# #...#',
  N: '#...# ##..# #.#.# #..## #...# #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# .#.#. .#.#. ..#..',
  W: '#...# #...# #...# #...# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  a: '..... ..... .###. ....# .#### #...# .####',
  b: '#.... #.... #.##. ##..# #...# #...# ####.',
  c: '..... ..... .###. #.... #.... #.... .###.',
  d: '....# ....# .##.# #..## #...# #...# .####',
  e: '..... ..... .###. #...# ##### #.... .###.',
  f: '..## .#.. #### .#.. .#.. .#.. .#..',
  g: '..... ..... .#### #...# #...# #...# .#### ....# ####.',
  h: '#.... #.... #.##. ##..# #...# #...# #...#',
  i: '# . # # # # #',
  j: '...# .... ...# ...# ...# ...# ...# #..# .##.',
  k: '#... #... #..# #.#. ##.. #.#. #..#',
  l: '#. #. #. #. #. #. .#',
  m: '..... ..... ##.#. #.#.# #.#.# #...# #...#',
  n: '..... ..... ####. #...# #...# #...# #...#',
  o: '..... ..... .###. #...# #...# #...# .###.',
  p: '..... ..... #.##. ##..# #...# #...# ####. #.... #....',
  q: '..... ..... .##.# #..## #...# #...# .#### ....# ....#',
  r: '..... ..... #.##. ##..# #.... #.... #....',
  s: '..... ..... .#### #.... .###. ....# ####.',
  t: '.#.. .#.. #### .#.. .#.. .#.. ..##',
  u: '..... ..... #...# #...# #...# #...# .####',
  v: '..... ..... #...# #...# #...# .#.#. ..#..',
  w: '..... ..... #...# #...# #.#.# #.#.# .#.#.',
  x: '..... ..... #...# .#.#. ..#.. .#.#. #...#',
  y: '..... ..... #...# #...# #...# #...# .#### ....# ####.',
  z: '..... ..... ##### ...#. ..#.. .#... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '.###. #...# ....# ..##. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. ..#.. ..#.. ..#..',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  '!': '# # # # # . #',
  '"': '#.# #.# ... ... ... ... ...',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  $: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '#...# #..#. ...#. ..#.. .#... .#..# #...#',
  '&': '..#.. .#.#. ..#.. .##.# #..#. #..#. .##.#',
  "'": '# # . . . . .',
  '(': '..# .#. #.. #.. #.. .#. ..#',
  ')': '#.. .#. ..# ..# ..# .#. #..',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  ',': '.. .. .. .. .. .# .# #.',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '.': '. . . . . . #',
  '/': '....# ...#. ...#. ..#.. .#... .#... #....',
  ':': '. # . . . # .',
  ';': '.. .# .. .. .. .# .# #.',
  '<': '...# ..#. .#.. #... .#.. ..#. ...#',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '>': '#... .#.. ..#. ...# ..#. .#.. #...',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '@': '.###. #...# #.### #.#.# #.### #.... .###.',
  '[': '### #.. #.. #.. #.. #.. ###',
  '\\': '#.... .#... .#... ..#.. ...#. ...#. ....#',
  ']': '### ..# ..# ..# ..# ..# ###',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... ..... #####',
  '`': '#. .# .. .. .. .. ..',
  '{': '..## .#.. .#.. #... .#.. .#.. ..##',
  '|': '# # # # # # #',
  '}': '##.. ..#. ..#. ...# ..#. ..#. ##..',
  '~': '..... ..... .##.# #..#. ..... ..... .....',
  '·': '. . . # . . .',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '°': '.#. #.# .#. ... ... ... ...',
  '‘': '#. .# .. .. .. .. ..',
  '’': '.# #. .. .. .. .. ..',
  '“': '#.#. .#.# .... .... .... .... ....',
  '”': '.#.# #.#. .... .... .... .... ....',
  '–': '.... .... .... #### .... .... ....',
  '—': '....... ....... ....... ####### ....... ....... .......',
  '…': '..... ..... ..... ..... ..... ..... #.#.#',
};

const PX = 125;
const UPM = 1000;
const ASCENT = 1000;
const DESCENT = 250;
const SPACE = 4;

// Each run of lit pixels becomes a rectangle, merged downwards when the next row repeats it.
function outline(rows) {
  const done = [];
  let open = [];
  rows.forEach((row, r) => {
    const runs = [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      let end = x;
      while (row[end + 1] === '#') end++;
      runs.push([x, end + 1]);
      x = end;
    }
    const next = [];
    for (const [x0, x1] of runs) {
      const same = open.find((rect) => rect.x0 === x0 && rect.x1 === x1);
      if (same) {
        same.r1 = r + 1;
        next.push(same);
      } else next.push({ x0, x1, r0: r, r1: r + 1 });
    }
    done.push(...open.filter((rect) => !next.includes(rect)));
    open = next;
  });
  done.push(...open);
  // Row r spans from (6 - r) to (7 - r) pixels above the baseline.
  return done.map(({ x0, x1, r0, r1 }) => ({ x0: x0 * PX, x1: x1 * PX, y0: (7 - r1) * PX, y1: (7 - r0) * PX }));
}

const order = Object.keys(glyphs).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
const font = [
  { code: null, advance: 4 * PX, rects: [] }, // .notdef
  { code: 32, advance: SPACE * PX, rects: [] },
  ...order.map((char) => {
    const rows = glyphs[char].split(' ');
    if (rows.length < 7 || rows.length > 9 || rows.some((row) => row.length !== rows[0].length))
      throw new Error(`Bad glyph ${char}`);
    return { code: char.codePointAt(0), advance: (rows[0].length + 1) * PX, rects: outline(rows) };
  }),
];

class Writer {
  bytes = [];
  u8(v) { this.bytes.push(v & 255); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { return this.u16(Math.floor(v / 65536)).u16(v % 65536); }
  tag(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  pad() { while (this.bytes.length % 4) this.u8(0); return this; }
}

const glyf = new Writer();
const offsets = [];
const bounds = [];
for (const glyph of font) {
  offsets.push(glyf.bytes.length);
  if (!glyph.rects.length) { bounds.push(null); continue; }
  const xs = glyph.rects.flatMap((r) => [r.x0, r.x1]);
  const ys = glyph.rects.flatMap((r) => [r.y0, r.y1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  bounds.push(box);
  glyf.i16(glyph.rects.length).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
  glyph.rects.forEach((_, i) => glyf.u16(i * 4 + 3));
  glyf.u16(0);
  // Clockwise squares with every point on the curve.
  const points = glyph.rects.flatMap((r) => [[r.x0, r.y0], [r.x0, r.y1], [r.x1, r.y1], [r.x1, r.y0]]);
  points.forEach(() => glyf.u8(1));
  let last = 0;
  for (const [x] of points) { glyf.i16(x - last); last = x; }
  last = 0;
  for (const [, y] of points) { glyf.i16(y - last); last = y; }
  glyf.pad();
}
offsets.push(glyf.bytes.length);

const loca = new Writer();
for (const offset of offsets) loca.u32(offset);

const hmtx = new Writer();
font.forEach((glyph, i) => hmtx.u16(glyph.advance).i16(bounds[i]?.[0] ?? 0));

const lit = bounds.filter(Boolean);
const box = [Math.min(...lit.map((b) => b[0])), Math.min(...lit.map((b) => b[1])), Math.max(...lit.map((b) => b[2])), Math.max(...lit.map((b) => b[3]))];
const maxPoints = Math.max(...font.map((g) => g.rects.length * 4));
const maxContours = Math.max(...font.map((g) => g.rects.length));

const head = new Writer()
  .u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(UPM)
  .u32(0).u32(0xe7059a00).u32(0).u32(0xe7059a00) // 2026-10-27, seconds since 1904
  .i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3])
  .u16(0).u16(8).i16(2).i16(1).i16(0);

const hhea = new Writer()
  .u32(0x00010000).i16(ASCENT).i16(-DESCENT).i16(0)
  .u16(Math.max(...font.map((g) => g.advance)))
  .i16(Math.min(...lit.map((b) => b[0])))
  .i16(Math.min(...font.flatMap((g, i) => (bounds[i] ? [g.advance - bounds[i][2]] : []))))
  .i16(Math.max(...lit.map((b) => b[2])))
  .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0)
  .u16(font.length);

const maxp = new Writer()
  .u32(0x00010000).u16(font.length).u16(maxPoints).u16(maxContours)
  .u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

const codes = font.filter((g) => g.code !== null).map((g) => g.code);
const os2 = new Writer()
  .u16(4).i16(Math.round(font.reduce((sum, g) => sum + g.advance, 0) / font.length))
  .u16(400).u16(5).u16(0)
  .i16(500).i16(500).i16(0).i16(125).i16(500).i16(500).i16(0).i16(375)
  .i16(PX).i16(375).i16(0);
for (let i = 0; i < 10; i++) os2.u8(0);
// Basic Latin, Latin-1 Supplement and General Punctuation.
os2.u32(0x80000003).u32(0).u32(0).u32(0).tag('BAIT')
  .u16(0x00c0).u16(Math.min(...codes)).u16(Math.min(Math.max(...codes), 0xffff))
  .i16(ASCENT).i16(-DESCENT).i16(0).u16(ASCENT).u16(DESCENT)
  .u32(1).u32(0).i16(5 * PX).i16(7 * PX).u16(0).u16(32).u16(1);

// Format 4: one segment per run of consecutive characters, then the 0xFFFF terminator.
const segments = [];
font.forEach((glyph, id) => {
  if (glyph.code === null) return;
  const last = segments.at(-1);
  if (last && glyph.code === last.end + 1 && id === last.id + glyph.code - last.start) last.end = glyph.code;
  else segments.push({ start: glyph.code, end: glyph.code, id });
});
segments.push({ start: 0xffff, end: 0xffff, id: 0 });
const count = segments.length;
const search = 2 * 2 ** Math.floor(Math.log2(count));
const sub = new Writer().u16(4).u16(16 + 8 * count).u16(0).u16(count * 2).u16(search)
  .u16(Math.floor(Math.log2(count))).u16(count * 2 - search);
for (const s of segments) sub.u16(s.end);
sub.u16(0);
for (const s of segments) sub.u16(s.start);
for (const s of segments) sub.u16(s.start === 0xffff ? 1 : (s.id - s.start + 65536) % 65536);
for (const _ of segments) sub.u16(0);
const cmap = new Writer().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20);
cmap.bytes.push(...sub.bytes);

const names = [
  [0, 'Copyright 2026 the baited authors. Original artwork, MIT licensed.'],
  [1, 'Baited Pixel'],
  [2, 'Regular'],
  [3, 'Baited Pixel Regular 1.000'],
  [4, 'Baited Pixel Regular'],
  [5, 'Version 1.000'],
  [6, 'BaitedPixel-Regular'],
];
const strings = names.map(([, text]) => [...text].flatMap((c) => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255]));
const name = new Writer().u16(0).u16(names.length).u16(6 + 12 * names.length);
let at = 0;
names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x0409).u16(id).u16(strings[i].length).u16(at); at += strings[i].length; });
for (const s of strings) name.bytes.push(...s);

const post = new Writer().u32(0x00030000).u32(0).i16(-PX).i16(PX).u32(0).u32(0).u32(0).u32(0).u32(0);

const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
const tags = Object.keys(tables).sort();
const checksum = (bytes) => {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4)
    sum = (sum + ((bytes[i] << 24) >>> 0) + ((bytes[i + 1] ?? 0) << 16) + ((bytes[i + 2] ?? 0) << 8) + (bytes[i + 3] ?? 0)) >>> 0;
  return sum;
};
const out = new Writer().u32(0x00010000).u16(tags.length);
const power = 2 ** Math.floor(Math.log2(tags.length));
out.u16(power * 16).u16(Math.log2(power)).u16(tags.length * 16 - power * 16);
let offset = 12 + 16 * tags.length;
for (const tag of tags) {
  const bytes = tables[tag].bytes;
  out.tag(tag).u32(checksum(bytes)).u32(offset).u32(bytes.length);
  offset += Math.ceil(bytes.length / 4) * 4;
}
for (const tag of tags) { out.bytes.push(...tables[tag].bytes); out.pad(); }
// head.checkSumAdjustment makes the whole file sum to 0xB1B0AFBA.
const headAt = 12 + 16 * tags.length + tags.slice(0, tags.indexOf('head')).reduce((n, t) => n + Math.ceil(tables[t].bytes.length / 4) * 4, 0);
const adjust = (0xb1b0afba - checksum(out.bytes) + 2 ** 32) % 2 ** 32;
[adjust >>> 24, (adjust >>> 16) & 255, (adjust >>> 8) & 255, adjust & 255].forEach((b, i) => { out.bytes[headAt + 8 + i] = b; });

const target = fileURLToPath(new URL('../public/fonts/baited-pixel.ttf', import.meta.url));
writeFileSync(target, Buffer.from(out.bytes));
console.log(`Wrote ${font.length} glyphs, ${out.bytes.length} bytes to ${target}.`);
