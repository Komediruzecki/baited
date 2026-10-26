import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { curtainSize, leavesForPage, pixelColumns } from '../site/pixels.js'
import { AWAY_AT, FLOAT_AT, FOLD_AT, navAway, navState } from '../site/nav.js'
import { splitWords, typeStagger, TYPE_MAX } from '../site/reveal.js'

// The pixel layer: the curtain between pages, the floating navigation and the typed text.
// Their drawing and timing are checked in a browser.

test('the curtain uses big squares and always covers the whole screen', () => {
  assert.equal(pixelColumns(1440), 8)
  assert.equal(pixelColumns(800), 6)
  assert.equal(pixelColumns(390), 4)
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1920, 1080],
    [390, 844],
    [768, 1024],
  ]) {
    const { columns, rows, cell } = curtainSize(width, height)
    assert.equal(columns * cell, width)
    assert.ok(rows * cell >= height, `${width}x${height} leaves a gap`)
    assert.ok((rows - 1) * cell < height, `${width}x${height} has a spare row`)
  }
})

test('only a plain click to another page of the site gets the curtain', () => {
  const here = 'https://baited.maff.app/'
  const leaves = (href, extra = {}) => leavesForPage({ href, here, ...extra })
  assert.equal(leaves('/terms'), true)
  assert.equal(leaves('/privacy?from=footer'), true)
  assert.equal(leaves('/?mark=b'), true)
  assert.equal(leaves('#how'), false)
  assert.equal(leaves('/#contact'), false)
  assert.equal(leaves('mailto:hello@irchiinnuss.com'), false)
  assert.equal(leaves('https://www.twitch.tv/komediruzecki7'), false)
  assert.equal(leaves('/terms', { target: '_blank' }), false)
  assert.equal(leaves('/terms', { target: '_self' }), true)
  assert.equal(leaves('/terms', { modified: true }), false)
  assert.equal(leaves('/terms', { download: true }), false)
  assert.equal(leaves('/terms', { optOut: true }), false)
})

test('the navigation floats once the page scrolls and folds only while scrolling down', () => {
  let state = navState({ y: 0, lastY: 0, folded: false })
  assert.deepEqual(state, { floating: false, folded: false })
  state = navState({ y: FLOAT_AT + 20, lastY: 0, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: false })
  state = navState({ y: FOLD_AT + 200, lastY: FOLD_AT + 100, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: true })
  state = navState({ y: FOLD_AT + 202, lastY: FOLD_AT + 200, folded: state.folded })
  assert.equal(state.folded, true, 'a little jitter changes nothing')
  state = navState({ y: FOLD_AT + 150, lastY: FOLD_AT + 202, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: false })
  state = navState({ y: 10, lastY: 400, folded: true })
  assert.deepEqual(state, { floating: false, folded: false })
  // The footer has its own buttons: the bar steps away once the footer reaches the top.
  assert.equal(navAway(900), false)
  assert.equal(navAway(AWAY_AT + 1), false)
  assert.equal(navAway(AWAY_AT), true)
  assert.equal(navAway(-400), true)
})

test('headings type at a steady pace but never take too long, and spaces split words', () => {
  assert.equal(typeStagger(0), 0)
  assert.ok(Math.abs(typeStagger(10) * 10 - 0.45) < 1e-9)
  assert.ok(Math.abs(typeStagger(200) * 200 - TYPE_MAX) < 1e-9)
  assert.deepEqual(splitWords('say it. Now'), ['say it.', ' ', 'Now'])
  assert.deepEqual(splitWords('  two\n words '), ['  ', 'two', '\n ', 'words', ' '])
})

test('every page loads the curtain early, and nothing on the site is yellow', async () => {
  const site = new URL('../site/', import.meta.url)
  for (const page of ['index.html', 'terms/index.html', 'privacy/index.html']) {
    const html = await readFile(new URL(page, site), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    assert.match(head, /<script src="\/pixel-boot\.js"><\/script>/, `${page} covers the first paint`)
    assert.match(head, /<script type="module" src="\/pixels\.js"><\/script>/, `${page} clears the curtain`)
    assert.match(head, /<link rel="stylesheet" href="\/pixels\.css" \/>/, `${page} styles the curtain`)
  }
  const files = (await readdir(site)).filter((name) => /\.(css|js|html)$/.test(name))
  files.push('terms/index.html', 'privacy/index.html')
  for (const name of files) {
    const text = await readFile(new URL(name, site), 'utf8')
    assert.doesNotMatch(text, /#fffc79|--yellow|255 252 121/i, `${name} still uses the old yellow`)
  }
})
