// The BAITED wordmark as pixel art: the owner's letters sampled onto a 37 × 10 grid. Sampled, the
// I stepped one column left in its top three rows, so it is redrawn as a mirror of the T's stem
// (three pixels wide, its bottom row cut on the left where the T's is cut on the right) and the
// T's crossbar starts one column later,
// centred over its own stem. Every logo on the site
// is drawn from this grid: the navigation paints it on a canvas (nav.js), and
// scripts/build-pixel-logo.mjs writes the SVG files in site/assets/brand/ that the rest uses.
export const PIXEL_LOGO = [
  '#####...####..###.#####..####.######.',
  '######.######.###.#####.#####.######.',
  '##..##.##.###.###.####..#####.###.##.',
  '######.######.###..###..##....##..###',
  '######.######.###..###..####..##..###',
  '###.##.######.###..###.#####..##..###',
  '##..##.##.###.###..###.###....##..###',
  '##..##.##.###.###..###.######.#######',
  '######.##.###.###..###.######.#######',
  '#####..##.###..##..##..######.#####..',
]
export const PIXEL_LOGO_COLS = 37
export const PIXEL_LOGO_ROWS = PIXEL_LOGO.length

// The filled cells as indexes into the grid, row by row.
export function pixelLogoCells(grid = PIXEL_LOGO) {
  const cells = []
  grid.forEach((row, y) => {
    for (let x = 0; x < PIXEL_LOGO_COLS; x++) if (row[x] === '#') cells.push(y * PIXEL_LOGO_COLS + x)
  })
  return cells
}

// One SVG path, a rectangle per horizontal run, so a scaled-down logo has no seams between pixels.
export function pixelLogoPath(grid = PIXEL_LOGO, cols = PIXEL_LOGO_COLS) {
  let d = ''
  grid.forEach((row, y) => {
    for (const run of row.slice(0, cols).matchAll(/#+/g)) d += `M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`
  })
  return d
}

// A circle drawn in square pixels on an n × n grid: every cell whose centre lies inside it. The
// footer's "Get in touch" button uses it as its mask.
export const PIXEL_CIRCLE_SIZE = 14
export function pixelCircleRows(n = PIXEL_CIRCLE_SIZE) {
  const r = n / 2
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r ? '#' : '.')).join(''),
  )
}
export function pixelCircleSvg(n = PIXEL_CIRCLE_SIZE) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n * 10}" height="${n * 10}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${pixelLogoPath(pixelCircleRows(n), n)}"/></svg>\n`
}

// The favicon, the owner's pick: the wordmark's B (its first six columns) in deep ink on the violet,
// centred in a square 13 pixels wide. scripts/build-pixel-logo.mjs writes it as an SVG and a PNG.
export const PIXEL_FAVICON = { size: 13, cols: 6, ground: '#7721e5', ink: '#160033' }
export const pixelFaviconRows = () => PIXEL_LOGO.map((row) => row.slice(0, PIXEL_FAVICON.cols))
export function pixelFaviconSvg() {
  const { size, cols, ground, ink } = PIXEL_FAVICON
  const [x, y] = [(size - cols) / 2, (size - PIXEL_LOGO_ROWS) / 2]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 20}" height="${size * 20}" viewBox="${-x} ${-y} ${size} ${size}" shape-rendering="crispEdges"><title>baited</title><rect x="${-x}" y="${-y}" width="${size}" height="${size}" fill="${ground}"/><path fill="${ink}" d="${pixelLogoPath(pixelFaviconRows(), cols)}"/></svg>\n`
}

export function pixelLogoSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIXEL_LOGO_COLS * 10}" height="${PIXEL_LOGO_ROWS * 10}" viewBox="0 0 ${PIXEL_LOGO_COLS} ${PIXEL_LOGO_ROWS}" shape-rendering="crispEdges"><title>BAITED</title><path fill="${color}" d="${pixelLogoPath()}"/></svg>\n`
}
