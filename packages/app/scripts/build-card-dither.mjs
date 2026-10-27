import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const DITHER_SEED = 0x00ba17ed
export const DITHER_WIDTH = 72
export const DITHER_HEIGHT = 101
const palette = ['#9146ff', '#3b1a7a', '#1f0e42', '#0d0a12', '#c9a8ff']
const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const output = new URL('../public/card-lab/finishes/dither.svg', import.meta.url)

function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ state >>> 15, 1 | state)
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value)
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296
  }
}

export function ditherCells() {
  const cells = new Array(DITHER_WIDTH * DITHER_HEIGHT)
  const random = seededRandom(DITHER_SEED)
  for (let index = 0; index < cells.length / 2; index++) {
    const x = index % DITHER_WIDTH
    const y = Math.floor(index / DITHER_WIDTH)
    const distance = Math.min(x, y, DITHER_WIDTH - 1 - x, DITHER_HEIGHT - 1 - y)
    const threshold = (bayer[y % 4][x % 4] + 0.5) / 16
    let color = palette[3]
    if (distance <= 1) color = palette[0]
    else if (distance <= 3) color = threshold < (distance - 1) / 3 ? palette[1] : palette[0]
    else if (distance <= 7) color = threshold < (distance - 3) / 5 ? palette[2] : palette[1]
    else if (distance <= 13) color = threshold < (distance - 7) / 7 ? palette[3] : palette[2]
    if (distance <= 6 && random() < 1 / 180) color = palette[4]
    cells[index] = color
    cells[cells.length - 1 - index] = color
  }
  return cells
}

export function renderDither() {
  const cells = ditherCells()
  const paths = new Map(palette.filter(color => color !== palette[3]).map(color => [color, []]))
  for (let y = 0; y < DITHER_HEIGHT; y++) {
    for (let x = 0; x < DITHER_WIDTH;) {
      const start = x
      const color = cells[y * DITHER_WIDTH + x]
      while (x < DITHER_WIDTH && cells[y * DITHER_WIDTH + x] === color) x++
      if (paths.has(color)) paths.get(color).push(`M${start} ${y}h${x - start}v1h-${x - start}z`)
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${DITHER_WIDTH}" height="${DITHER_HEIGHT}" viewBox="0 0 ${DITHER_WIDTH} ${DITHER_HEIGHT}" shape-rendering="crispEdges">`,
    `<rect width="${DITHER_WIDTH}" height="${DITHER_HEIGHT}" fill="${palette[3]}"/>`,
    ...[...paths].map(([color, segments]) => `<path fill="${color}" d="${segments.join('')}"/>`),
    '</svg>', '',
  ].join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: node scripts/build-card-dither.mjs [--check]')
  const svg = renderDither()
  if (args[0] === '--check') {
    if (await readFile(output, 'utf8') !== svg) throw new Error('Dither SVG is stale; run node scripts/build-card-dither.mjs')
    console.log('Dither SVG matches the seeded generator.')
    return
  }
  const temporary = fileURLToPath(new URL(`.dither-${process.pid}.svg.tmp`, output))
  await writeFile(temporary, svg)
  await rename(temporary, output)
  console.log(`Generated ${fileURLToPath(output)} (${Buffer.byteLength(svg)} bytes, seed ${DITHER_SEED}).`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
