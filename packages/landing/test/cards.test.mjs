import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { cards } from '../site/data.js'

// The card faces: every secret word has its item's color, and that color reads well on the card.

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test('every secret word has its own color with at least 4.5:1 on the card face', async () => {
  const css = await readFile(new URL('../site/styles.css', import.meta.url), 'utf8')
  const face = css.match(/--card-face:\s*(#[0-9a-f]{6})/i)[1]
  for (const card of cards) {
    const rule = css.match(new RegExp(`\\.card-word--${card.word}\\s*\\{\\s*color:\\s*(#[0-9a-f]{6})`, 'i'))
    assert.ok(rule, `${card.word} has no color`)
    assert.ok(contrast(rule[1], face) >= 4.5, `${card.word} ${rule[1]} is ${contrast(rule[1], face).toFixed(2)}:1`)
  }
})

test('the VOLCANO card in How it plays uses the same face as the deck', async () => {
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  assert.match(html, /class="card-word card-word--volcano">VOLCANO</)
  assert.match(html, /card-forbidden__label">Forbidden words</)
  assert.doesNotMatch(html, /card-hook|bait-bomb-logo\.png" alt=""/)
})
