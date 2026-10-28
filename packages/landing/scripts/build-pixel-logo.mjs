import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { PIXEL_FAVICON, PIXEL_LOGO_ROWS, pixelCircleSvg, pixelFaviconRows, pixelFaviconSvg, pixelLogoSvg } from '../site/pixel-logo.js'

// The pixel wordmark files, one per ink, from the grid in site/pixel-logo.js, the pixel circle the
// footer button is masked with, and the favicon (an SVG, and a PNG for browsers that want one). Run it
// after editing any of them:
// node packages/landing/scripts/build-pixel-logo.mjs
export const PIXEL_LOGO_INKS = { black: '#17131e', white: '#ffffff', violet: '#7721e5' }

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const check = Buffer.alloc(4)
  check.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, check])
}

// The favicon as an RGB PNG `side` pixels square, every square of the B on whole pixels, so its
// edges stay as sharp as the SVG's.
export function pixelFaviconPng(side = 256) {
  const { size, cols, ground, ink } = PIXEL_FAVICON
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const edge = (n) => Math.round((n * side) / size)
  const [left, top] = [(size - cols) / 2, (size - PIXEL_LOGO_ROWS) / 2]
  const stride = side * 3 + 1
  const raw = Buffer.alloc(stride * side)
  const paint = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) raw.set(color, y * stride + 1 + x * 3)
  }
  paint(0, 0, side, side, rgb(ground))
  pixelFaviconRows().forEach((row, y) => {
    for (let x = 0; x < cols; x++) if (row[x] === '#') paint(edge(left + x), edge(top + y), edge(left + x + 1), edge(top + y + 1), rgb(ink))
  })
  const header = Buffer.alloc(13)
  header.writeUInt32BE(side, 0)
  header.writeUInt32BE(side, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [name, color] of Object.entries(PIXEL_LOGO_INKS)) {
    await writeFile(new URL(`../site/assets/brand/baited-pixel-${name}.svg`, import.meta.url), pixelLogoSvg(color))
  }
  await writeFile(new URL('../site/assets/brand/pixel-circle.svg', import.meta.url), pixelCircleSvg())
  await writeFile(new URL('../site/assets/brand/baited-favicon.svg', import.meta.url), pixelFaviconSvg())
  await writeFile(new URL('../site/assets/brand/baited-favicon.png', import.meta.url), pixelFaviconPng())
}
