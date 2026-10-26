import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EDGE_FADE,
  EDGE_ROWS,
  edgeColumns,
  markGrid,
  pixelOpacity,
  pixelThreshold,
  seededRandom,
} from '../site/footer.js'

// The footer's pixel edge. Its drawing and the pinned deck are checked in a browser.

test('the edge uses about 90 px squares, and never fewer than eight across', () => {
  assert.equal(edgeColumns(1440), 16)
  assert.equal(edgeColumns(1920), 21)
  assert.equal(edgeColumns(390), 8)
  assert.equal(edgeColumns(200), 8)
})

test('rows nearer the footer fill first, and every pixel is full before the wipe ends', () => {
  for (let row = 0; row < EDGE_ROWS; row++) {
    const earliest = pixelThreshold(row, EDGE_ROWS, 0)
    const latest = pixelThreshold(row, EDGE_ROWS, 0.999999)
    if (row > 0) assert.ok(earliest > pixelThreshold(row - 1, EDGE_ROWS, 0))
    assert.ok(latest + EDGE_FADE <= 1, `row ${row} ends at ${latest + EDGE_FADE}`)
  }
})

test('a pixel fades in over a short stretch and stays within 0 and 1', () => {
  assert.equal(pixelOpacity(0.2, 0.3), 0)
  assert.ok(Math.abs(pixelOpacity(0.3 + EDGE_FADE / 2, 0.3) - 0.5) < 1e-9)
  assert.equal(pixelOpacity(0.9, 0.3), 1)
  let previous = 0
  for (let progress = 0; progress <= 1; progress += 0.01) {
    const opacity = pixelOpacity(progress, 0.42)
    assert.ok(opacity >= previous)
    previous = opacity
  }
})

test('the pattern is random but the same on every visit', () => {
  const first = seededRandom(7)
  const second = seededRandom(7)
  const values = Array.from({ length: 64 }, () => first())
  assert.deepEqual(values, Array.from({ length: 64 }, () => second()))
  assert.ok(values.every((value) => value >= 0 && value < 1))
  assert.ok(new Set(values).size === values.length)
})

test('the squares over the logo are about square', () => {
  // The cropped logo: 1440 and 1920 wide desktops, a short 1280 x 720 screen, a phone.
  for (const [width, height] of [
    [1440, 222],
    [1920, 296],
    [1280, 154],
    [390, 73],
  ]) {
    const { rows, columns } = markGrid(width, height)
    const ratio = width / columns / (height / rows)
    assert.ok(ratio > 0.85 && ratio < 1.15, `${width}x${height}: ${columns}x${rows} squares are ${ratio.toFixed(2)}`)
  }
})
