import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewMark } from '../site/brand.js'

test('logo proofs are selectable only on the local and development hosts', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'dev.baited.maff.app']) {
    for (const mark of ['a', 'b', 'c']) assert.equal(reviewMark(host, `?mark=${mark}`), mark)
  }
  for (const host of [
    'baited.maff.app', 'baited.maff.app.', 'dev.baited.maff.app.example.com',
    'bait.maff.app', 'dev.bait.maff.app', 'dev.bait.maff.app.example.com', 'example.com',
  ]) {
    assert.equal(reviewMark(host, '?mark=a'), null)
  }
})

test('a proof query cannot choose an arbitrary asset path', () => {
  for (const query of ['', '?mark=d', '?mark=', '?mark=../../file', '?mark=https%3A%2F%2Fexample.com', '?mark=A']) {
    assert.equal(reviewMark('localhost', query), null)
  }
})

test('the navigation shows the black logo and the white footer the violet one', async () => {
  const { readFile, stat } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
  assert.match(header, /<nav class="site-nav"[^]*src="\/assets\/brand\/baited-logo-black\.webp"/)
  assert.doesNotMatch(header, /class="brand"|brand-hand/, 'the header brand and its card hand are gone')
  assert.match(footer, /src="\/assets\/brand\/baited-logo-violet-large\.webp"/)
  assert.doesNotMatch(header + footer, /baited-logo\.webp|bait-bomb-logo/)
  for (const name of ['baited-logo-black.webp', 'baited-logo-white.webp', 'baited-logo-violet-large.webp']) {
    assert.ok((await stat(new URL(`../site/assets/brand/${name}`, import.meta.url))).size > 0)
  }
})
