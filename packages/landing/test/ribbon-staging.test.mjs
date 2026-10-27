import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { installSelectedCards } from '../scripts/selected-cards.mjs'
import { installPresentedDeck } from '../scripts/presented-deck.mjs'
import { installRibbon } from '../scripts/ribbon.mjs'

const sourceFiles = ['app.js', 'index.html', 'styles.css', 'deck.js']
const ribbonFiles = ['ribbon.js', 'ribbon-geometry.js', 'ribbon.css']

async function fixture(t, { environment = 'dev', presentation = 'presented' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'baited-ribbon-staging-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const stagingSite = join(root, `site-${environment}`)
  await mkdir(stagingSite, { recursive: true })
  for (const file of sourceFiles) await copyFile(new URL(`../site/${file}`, import.meta.url), join(stagingSite, file))
  if (presentation !== 'none') {
    await mkdir(join(stagingSite, 'assets/card-deck'), { recursive: true })
    await writeFile(join(stagingSite, 'assets/card-deck/back-prism.webp'), 'Prism fixture')
    await installSelectedCards({ environment, stagingSite })
    if (presentation === 'presented') await installPresentedDeck({ environment, stagingSite })
  }
  return stagingSite
}

async function installed(t) {
  const stagingSite = await fixture(t)
  await installRibbon({ environment: 'dev', stagingSite })
  return { stagingSite, app: await readFile(join(stagingSite, 'app.js'), 'utf8') }
}

test('ribbon staging adds public modules and passes existing deck dependencies through its wrapper', async t => {
  const stagingSite = await fixture(t)
  const original = await Promise.all(sourceFiles.map(file => readFile(new URL(`../site/${file}`, import.meta.url), 'utf8')))
  const stagedDeck = await readFile(join(stagingSite, 'deck.js'), 'utf8')
  const stagedStyles = await readFile(join(stagingSite, 'styles.css'), 'utf8')
  assert.equal(await installRibbon({ environment: 'dev', stagingSite }), true)
  const html = await readFile(join(stagingSite, 'index.html'), 'utf8')
  const app = await readFile(join(stagingSite, 'app.js'), 'utf8')
  assert.equal(html.split('href="/assets/card-deck/ribbon.css"').length - 1, 1)
  assert.ok(html.indexOf('selected-cards.css') < html.indexOf('ribbon.css'), 'ribbon styles follow the selected presentation')
  assert.ok(app.startsWith("import { createRibbonDeck } from '/assets/card-deck/ribbon.js'\n"))
  assert.ok(app.includes("from '/assets/card-deck/presented-deck.js'"))
  assert.ok(!app.includes('const deck = createDeck({'), 'the original constructor is replaced, not duplicated')
  for (const file of ribbonFiles) assert.deepEqual(await readFile(join(stagingSite, 'assets/card-deck', file)), await readFile(new URL(`../ribbon/${file}`, import.meta.url)))
  assert.deepEqual((await readdir(join(stagingSite, 'assets/card-deck'))).sort(), ['back-prism.webp', 'presented-deck.js', ...ribbonFiles, 'selected-cards.css', 'selected-cards.js'].sort())
  assert.equal(await readFile(join(stagingSite, 'deck.js'), 'utf8'), stagedDeck)
  assert.equal(await readFile(join(stagingSite, 'styles.css'), 'utf8'), stagedStyles)
  assert.deepEqual(await Promise.all(sourceFiles.map(file => readFile(new URL(`../site/${file}`, import.meta.url), 'utf8'))), original, 'production source stays byte-identical')

  const start = app.indexOf('const deck = createRibbonDeck({')
  const end = app.indexOf('\n})', start) + '\n})'.length
  assert.ok(start >= 0 && end > start)
  const nodes = new Map([['deck-status', {}], ['deck-help', {}]])
  const callbacks = []
  const context = {
    createRibbonDeck: options => options, createDeck() {}, hand: {}, items: [{}], cards: [{ word: 'first', difficulty: 'easy' }],
    $: id => nodes.get(id), window: { gsap: {} }, reduced: { matches: false },
    pauseSelectedReveal: () => callbacks.push('pause'), settleSelectedCard: item => callbacks.push(item), warmArt: index => callbacks.push(index),
    deckNear: false, warmSelectedArt: (...args) => callbacks.push(args),
  }
  runInNewContext(app.slice(start, end).replace('const deck =', 'globalThis.options ='), context)
  const options = context.options
  for (const name of ['createDeck', 'hand', 'items', 'cards', 'reduced']) assert.equal(options[name], context[name])
  assert.equal(options.gsap, context.window.gsap)
  assert.equal(options.status, nodes.get('deck-status'))
  assert.equal(options.help, nodes.get('deck-help'))
  assert.equal(options.pauseReveal, context.pauseSelectedReveal)
  assert.equal(options.settleReveal, context.settleSelectedCard)
  options.onFront(0)
  options.onSettle(0)
  assert.deepEqual(callbacks, ['pause', 0, context.items[0]], 'the wrapper receives the existing front and settle callbacks')
  options.warmArt(4, 2, 3)
  assert.equal(callbacks.length, 3, 'the ribbon does not load artwork before the deck approaches')
  context.deckNear = true
  options.warmArt(4, 2, 3)
  assert.deepEqual(callbacks.at(-1), [context.items, 4, 2, 3], 'fan and ribbon share the same resource window')
})

test('production gets the approved ribbon; missing, duplicate or reordered staging hooks fail before writes', async t => {
  const prod = await fixture(t, { environment: 'prod' })
  assert.equal(await installRibbon({ environment: 'prod', stagingSite: prod }), true)
  const prodApp = await readFile(join(prod, 'app.js'), 'utf8')
  assert.ok(prodApp.includes("from '/assets/card-deck/ribbon.js'"))
  assert.doesNotMatch(prodApp, /\/card-lab\//)
  assert.ok(!(await readdir(prod)).includes('card-lab'))
  await assert.rejects(installRibbon({ environment: 'dev', stagingSite: prod }), /site-dev/)
  await assert.rejects(installRibbon({ environment: 'unknown', stagingSite: prod }), /site-dev/)
  for (const presentation of ['none', 'selected']) {
    const stagingSite = await fixture(t, { presentation })
    const before = await readFile(join(stagingSite, 'app.js'), 'utf8')
    await assert.rejects(installRibbon({ environment: 'dev', stagingSite }))
    assert.equal(await readFile(join(stagingSite, 'app.js'), 'utf8'), before)
  }
  for (const [file, mutate] of [
    ['app.js', text => text + '\nconst deck = createDeck({\n  hand,\n  items,\n})\n'],
    ['app.js', text => text.replace('  if (event.target === hand) endDrag(event)\n', '  endDrag(event)\n')],
    ['index.html', text => text.replace('href="/assets/card-deck/selected-cards.css"', 'href="/changed.css"')],
  ]) {
    const stagingSite = await fixture(t)
    await writeFile(join(stagingSite, file), mutate(await readFile(join(stagingSite, file), 'utf8')))
    const before = await Promise.all(['app.js', 'index.html'].map(name => readFile(join(stagingSite, name), 'utf8')))
    const assets = (await readdir(join(stagingSite, 'assets/card-deck'))).sort()
    await assert.rejects(installRibbon({ environment: 'dev', stagingSite }), /hook changed/)
    assert.deepEqual(await Promise.all(['app.js', 'index.html'].map(name => readFile(join(stagingSite, name), 'utf8'))), before)
    assert.deepEqual((await readdir(join(stagingSite, 'assets/card-deck'))).sort(), assets, 'a broken hook must not publish ribbon assets')
  }
})

test('staged cancellation clears pointer state and calls ribbon cancellation before either original release path', async t => {
  const { app } = await installed(t)
  const start = app.indexOf('function endDrag(event, cancelled = false) {')
  const end = app.indexOf("\nhand.addEventListener('pointerup'", start)
  assert.ok(start >= 0 && end > start)
  const functionSource = app.slice(start, end)
  for (const active of [false, true]) {
    const calls = []
    const context = {
      drag: { id: 7, active, from: 4, unit: 100, samples: [{ x: 100, time: 10 }, { x: 80, time: 30 }] },
      suppressClickUntil: 0, performance: { now: () => 40 },
      hand: { classList: { remove: name => calls.push(['remove', name]) }, hasPointerCapture: id => id === 7, releasePointerCapture: id => calls.push(['releaseCapture', id]) },
      deck: { cancel: () => calls.push(['cancel']), to: () => calls.push(['to']), release: () => calls.push(['release']) },
    }
    runInNewContext(`${functionSource}\nglobalThis.end = endDrag`, context)
    context.end({ pointerId: 6 }, true)
    assert.equal(calls.length, 0, 'unrelated pointers cannot cancel input')
    context.end({ pointerId: 7 }, true)
    assert.equal(context.drag, null)
    assert.deepEqual(calls, [['remove', 'is-dragging'], ['releaseCapture', 7], ['cancel']])
    context.end({ pointerId: 7 }, true)
    assert.equal(calls.length, 3, 'nested capture loss cannot cancel an ended gesture twice')
  }
})

test('staged ribbon cancellation and genuine hand capture loss reach the existing input cleanup', async t => {
  const { app } = await installed(t)
  const inputStart = app.indexOf("hand.addEventListener('ribboncancelinput'")
  const inputEnd = app.indexOf('\n})', inputStart) + '\n})'.length
  const lossStart = app.indexOf("hand.addEventListener('lostpointercapture'")
  const lossEnd = app.indexOf('\n})', lossStart) + '\n})'.length
  const listeners = new Map()
  const calls = []
  const context = { drag: null, hand: { addEventListener: (type, listener) => listeners.set(type, listener) }, endDrag: (...args) => calls.push(args) }
  runInNewContext(`${app.slice(inputStart, inputEnd)}\n${app.slice(lossStart, lossEnd)}`, context)
  listeners.get('ribboncancelinput')()
  assert.equal(calls.length, 0)
  context.drag = { id: 7 }
  listeners.get('ribboncancelinput')()
  assert.equal(calls[0][0].pointerId, 7)
  assert.equal(calls[0][1], true)
  listeners.get('lostpointercapture')({ target: {} })
  assert.equal(calls.length, 1, 'bubbled descendant loss remains ignored')
  const loss = { target: context.hand, pointerId: 7 }
  listeners.get('lostpointercapture')(loss)
  assert.equal(calls[1][0], loss)
  assert.equal(calls[1][1], true, 'real capture loss cancels rather than flinging the deck')
})
