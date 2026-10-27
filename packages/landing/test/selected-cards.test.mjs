import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { installSelectedCards } from '../scripts/selected-cards.mjs'
import { cardFace, clueStyles, exactClues, glassOptics, glassRules, parseClueStyle, pauseSelectedReveal, revealSelectedCard, settleSelectedCard, warmSelectedArt, previewArt } from '../selected-cards/selected-cards.js'
import { cards } from '../site/data.js'
import { wrapIndex } from '../site/deck.js'

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture(t, environment = 'dev') {
  const root = await mkdtemp(join(tmpdir(), 'baited-selected-cards-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const stagingSite = join(root, `site-${environment}`)
  await mkdir(join(stagingSite, 'card-lab/backs'), { recursive: true })
  await writeFile(join(stagingSite, 'card-lab/backs/back-mosaic.webp'), 'Mosaic fixture')
  for (const file of ['app.js', 'index.html', 'styles.css', 'deck.js']) await copyFile(new URL(`../site/${file}`, import.meta.url), join(stagingSite, file))
  return stagingSite
}

test('selected presentation is installed only in the dev staging tree', async t => {
  const stagingSite = await fixture(t)
  const sourceFiles = ['app.js', 'index.html', 'styles.css', 'deck.js']
  const before = await Promise.all(sourceFiles.map(file => readFile(new URL(`../site/${file}`, import.meta.url)).then(digest)))
  assert.equal(await installSelectedCards({ environment: 'dev', stagingSite }), true)
  const html = await readFile(join(stagingSite, 'index.html'), 'utf8')
  const app = await readFile(join(stagingSite, 'app.js'), 'utf8')
  assert.match(html, /href="\/card-lab\/landing\/selected-cards\.css"/)
  assert.match(app, /from '\/card-lab\/landing\/selected-cards\.js'/)
  assert.match(app, /selectedCardFace\(card, cards\.length\)/)
  assert.match(app, /prepareSelectedScenes\(cards\)/)
  assert.match(app, /warmSelectedArt\(items, around\)/)
  assert.doesNotMatch(app, /items\.forEach\(\(item, index\) => \{\n    if \(Math\.abs\(wrapOffset/)
  assert.match(app, /onSettle\(index, \{ deliberate \} = \{\}\) \{\n    settleSelectedCard\(items\[index\]\)/)
  assert.match(app, /pauseSelectedReveal\(\)\n    warmArt\(index\)/)
  assert.match(app, /if \(event.button !== 0 \|\| !event.isPrimary \|\| drag\) return\n  pauseSelectedReveal\(\)/)
  assert.doesNotMatch(app, /function cardFace\(/)
  assert.deepEqual((await readdir(join(stagingSite, 'card-lab/landing'))).sort(), ['selected-cards.css', 'selected-cards.js'])
  assert.deepEqual(await Promise.all(sourceFiles.map(file => readFile(new URL(`../site/${file}`, import.meta.url)).then(digest))), before)
  for (const file of ['styles.css', 'deck.js']) assert.equal(digest(await readFile(join(stagingSite, file))), digest(await readFile(new URL(`../site/${file}`, import.meta.url))))
})

test('production installer is a no-op and a dev hook mismatch fails before publication', async t => {
  const prod = await fixture(t, 'prod')
  const before = await Promise.all(['index.html', 'app.js'].map(file => readFile(join(prod, file), 'utf8')))
  assert.equal(await installSelectedCards({ environment: 'prod', stagingSite: prod }), false)
  assert.deepEqual(await Promise.all(['index.html', 'app.js'].map(file => readFile(join(prod, file), 'utf8'))), before)
  assert.deepEqual(await readdir(join(prod, 'card-lab')), ['backs'])
  await assert.rejects(installSelectedCards({ environment: 'dev', stagingSite: prod }), /site-dev/)
  const dev = await fixture(t)
  await writeFile(join(dev, 'app.js'), 'Unexpected landing factory')
  const html = await readFile(join(dev, 'index.html'), 'utf8')
  await assert.rejects(installSelectedCards({ environment: 'dev', stagingSite: dev }), /hook changed/)
  assert.equal(await readFile(join(dev, 'index.html'), 'utf8'), html)
})

test('staged capture-loss handler ignores descendant losses and still ends a hand capture loss', async t => {
  const stagingSite = await fixture(t)
  const original = await readFile(new URL('../site/app.js', import.meta.url), 'utf8')
  await installSelectedCards({ environment: 'dev', stagingSite })
  const app = await readFile(join(stagingSite, 'app.js'), 'utf8')
  const handler = "hand.addEventListener('lostpointercapture', (event) => {\n  if (event.target === hand) endDrag(event)\n})"
  assert.equal(app.split("hand.addEventListener('lostpointercapture'").length - 1, 1, 'keep exactly one capture-loss handler')
  assert.ok(app.includes(handler), 'the staged handler must guard the original event target')
  assert.ok(app.includes("hand.addEventListener('pointerup', (event) => endDrag(event))"))
  assert.ok(app.includes("hand.addEventListener('pointercancel', (event) => endDrag(event, true))"))
  const listeners = new Map()
  const ended = []
  const hand = { addEventListener: (type, listener) => listeners.set(type, listener) }
  runInNewContext(handler, { hand, endDrag: event => ended.push(event) })
  const loss = listeners.get('lostpointercapture')
  const childLoss = { target: { parentElement: hand }, currentTarget: hand, pointerId: 7 }
  loss(childLoss)
  assert.equal(ended.length, 0, 'bubbled implicit capture loss from artwork must not end the hand drag')
  const handLoss = { target: hand, currentTarget: hand, pointerId: 7 }
  loss(handLoss)
  assert.deepEqual(ended, [handLoss], 'genuine hand capture loss still reaches the existing cleanup')
  assert.equal(await readFile(new URL('../site/app.js', import.meta.url), 'utf8'), original, 'production source remains unchanged')
})

test('staged live observer uses the newest entry before notifying selected reveal', async t => {
  const stagingSite = await fixture(t)
  await installSelectedCards({ environment: 'dev', stagingSite })
  const app = await readFile(join(stagingSite, 'app.js'), 'utf8')
  const observers = app.match(/new IntersectionObserver\(\(entries\) => \{[\s\S]*?\}, \{ threshold: 0\.35 \}\)\.observe\(hand\)/g) ?? []
  assert.equal(observers.length, 1, 'keep one live observer')
  assert.equal(app.split('new IntersectionObserver(').length - 1, 2, 'do not add duplicate observer pipelines')
  const items = [{ id: 'first' }, { id: 'second' }]
  const revealed = []
  let live = false
  let callback
  let observed
  const hand = { classList: { toggle(name, value) { assert.equal(name, 'is-live'); live = value } } }
  class IntersectionObserver {
    constructor(next, options) { callback = next; assert.equal(options.threshold, 0.35) }
    observe(target) { observed = target }
  }
  runInNewContext(observers[0], { IntersectionObserver, hand, items, deck: { target: 3 }, wrapIndex, revealSelectedCard: item => revealed.push({ item, live }) })
  assert.equal(observed, hand)
  callback([{ isIntersecting: false }, { isIntersecting: true }])
  assert.equal(live, true, 'a queued offscreen entry must not hide the final onscreen state')
  callback([{ isIntersecting: true }, { isIntersecting: false }])
  assert.equal(live, false, 'the newest offscreen entry must stop live presentation')
  assert.deepEqual(revealed, [{ item: items[1], live: true }, { item: items[1], live: false }], 'reveal sees the final visibility and the current target')
  callback([])
  assert.equal(revealed.length, 2, 'an empty batch must not change presentation')
})

test('staged proximity observer warms and disconnects only when its newest entry is near', async t => {
  const stagingSite = await fixture(t)
  await installSelectedCards({ environment: 'dev', stagingSite })
  const app = await readFile(join(stagingSite, 'app.js'), 'utf8')
  const observers = app.match(/new IntersectionObserver\(\n  \(entries, observer\) => \{[\s\S]*?\n  \{ rootMargin: '800px 0px' \}\n\)\.observe\(hand\)/g) ?? []
  assert.equal(observers.length, 1, 'keep one artwork proximity observer')
  for (const batch of [[false, true], [true, false]]) {
    const warmed = []
    let callback
    let disconnected = 0
    const hand = {}
    class IntersectionObserver {
      constructor(next, options) { callback = next; assert.equal(options.rootMargin, '800px 0px') }
      observe(target) { assert.equal(target, hand) }
    }
    const context = { IntersectionObserver, hand, deckNear: false, deck: { target: 3 }, items: [{}, {}], wrapIndex, warmArt: index => warmed.push(index) }
    runInNewContext(observers[0], context)
    callback(batch.map(isIntersecting => ({ isIntersecting })), { disconnect() { disconnected++ } })
    const near = batch.at(-1)
    assert.equal(context.deckNear, near, 'only the final entry may enable artwork warmup')
    assert.deepEqual(warmed, near ? [1] : [])
    assert.equal(disconnected, near ? 1 : 0, 'stay subscribed if the final entry is outside the proximity margin')
  }
})

test('selected renderer needs neither inline style permission nor live services', async () => {
  const source = await readFile(new URL('../selected-cards/selected-cards.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.style\b|setAttribute\(['"]style|innerHTML|fetch\(|WebSocket|localStorage|\/api\/|getUserMedia/)
  const worker = await readFile(new URL('../src/worker.ts', import.meta.url), 'utf8')
  assert.match(worker, /"style-src 'self'"/)
  assert.match(worker, /isCardLab \? `\$\{CONTENT_POLICY\}; style-src-attr 'unsafe-inline'` : CONTENT_POLICY/)
})

test('native Glass geometry matches the approved small Card Lab optics', async () => {
  const source = await readFile(new URL('../../app/client/CardGlass.tsx', import.meta.url), 'utf8')
  const small = source.match(/^\s+s:\s*\{ pitch: (\d+), line: ([\d.]+), scale: (\d+), frequency: '([^']+)', blur: ([\d.]+) \}/m)
  assert.ok(small)
  assert.deepEqual(glassOptics, { pitch: Number(small[1]), line: Number(small[2]), scale: Number(small[3]), frequency: small[4], blur: Number(small[5]) })
  assert.ok(glassRules(glassOptics.pitch).startsWith('M-600.00 1039.23L600.00 -1039.23'))
  assert.doesNotMatch(glassRules(glassOptics.pitch), /NaN|Infinity/)
  assert.throws(() => glassRules(0), RangeError)
})

test('only the front fan card paints Glass while side cards retain their Mosaic backs', async () => {
  const css = await readFile(new URL('../selected-cards/selected-cards.css', import.meta.url), 'utf8')
  assert.match(css, /\.deck-card-item:not\(\.is-front\) \.selected-card>\.selected-glass-field,\.deck-card-item:not\(\.is-front\) \.selected-glass \{ display:none; \}/)
  assert.match(css, /\.deck-card-item \.selected-card>\.card-art \{ opacity:0; visibility:hidden; \}/)
  assert.match(css, /\.deck-card-item\.is-front \.selected-card>\.card-art \{ opacity:1; visibility:visible; \}/)
  assert.match(css, /\.deck-card-item \.selected-card>\.selected-card__back \{ opacity:1; visibility:visible; \}/)
})

test('clue query accepts only stable IDs and defaults to the provisional Ruled row', () => {
  for (const id of clueStyles) assert.equal(parseClueStyle(`?clue=${id}`), id)
  for (const search of ['', '?clue=__proto__', '?clue=constructor', '?clue=/external.css', '?clue=RAIL', '?clues=pills', null]) assert.equal(parseClueStyle(search), 'rail')
})

test('all 78 native faces preserve exact 0/2/4 clues in every treatment and lazy art with unique local filters', () => {
  const previous = globalThis.document
  const create = tag => ({ tag, dataset: {}, attributes: {}, children: [], textContent: '', setAttribute(key, value) { this.attributes[key] = String(value) }, append(...items) { this.children.push(...items) }, addEventListener() {} })
  globalThis.document = { createElement: create, createElementNS: (_, tag) => create(tag) }
  try {
    const walk = root => [root, ...root.children.flatMap(walk)]
    const ids = new Set()
    for (const card of cards) for (const style of clueStyles) {
      const face = cardFace(card, cards.length, style)
      const nodes = walk(face)
      assert.equal(face.dataset.clue, style)
      const art = nodes.find(item => item.className === 'card-art')
      const illustration = walk(art).find(item => item.tag === 'img')
      assert.equal(illustration.dataset.src, previewArt(card.art))
      assert.equal(illustration.width, 640)
      assert.equal(illustration.height, 640)
      assert.equal(illustration.src, undefined)
      const terms = nodes.filter(item => Object.hasOwn(item.dataset, 'clueWord'))
      assert.deepEqual(terms.map(item => item.textContent), exactClues(card))
      assert.equal(terms.length, { easy: 0, medium: 2, hard: 4 }[card.difficulty])
      assert.ok(!terms.some(item => item.attributes.role || item.attributes.tabindex || item.attributes.title))
      if (terms.length && style !== 'quiet') {
        const list = nodes.find(item => item.className === 'card-clues')
        assert.equal(list.tag, 'ul')
        assert.ok(list.children.every(item => item.tag === 'li' && item.children.length === 1))
        assert.equal(list.attributes['aria-labelledby'], nodes.find(item => item.className === 'card-forbidden__label').id)
      } else if (terms.length) {
        const sentence = nodes.find(item => item.className === 'card-rule')
        const expected = `Keep ${card.clues.slice(0, -1).join(', ')} and ${card.clues.at(-1)} out of chat.`
        assert.equal(sentence.tag, 'p')
        assert.equal(sentence.children.map(item => item.textContent).join(''), expected)
      } else assert.equal(nodes.find(item => item.className === 'card-easy').textContent, 'Only this word is off limits.')
      const own = new Set(nodes.flatMap(item => item.attributes.id ? [item.attributes.id] : []))
      assert.equal(own.size, 2)
      for (const id of own) { assert.ok(!ids.has(id)); ids.add(id) }
      for (const item of nodes) for (const value of Object.values(item.attributes)) {
        const reference = value.match(/^url\(#(.+)\)$/)
        if (reference) assert.ok(own.has(reference[1]))
      }
      assert.ok(!nodes.some(item => item.attributes.style))
      assert.equal(nodes.filter(item => item.tag === 'g' && item.attributes.filter).length, 1)
    }
    assert.equal(ids.size, 780)
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
})

test('art windows release old images and reveal canvases across the full catalogue and wraparound', () => {
  const items = Array.from({ length: 78 }, (_, index) => {
    const image = { dataset: { src: `/art-${index}.webp` }, src: null, getAttribute() { return this.src }, removeAttribute() { this.src = null } }
    const canvas = { width: 160, height: 160 }
    return { image, canvas, querySelector: selector => selector === '.card-art img' ? image : canvas }
  })
  const held = () => items.flatMap((item, index) => item.image.src ? [index] : [])
  warmSelectedArt(items, 0)
  assert.deepEqual(held(), [0, 1, 2, 3, 75, 76, 77])
  for (let index = 0; index < 156; index++) {
    warmSelectedArt(items, index)
    assert.equal(held().length, 7)
  }
  assert.equal(items[20].canvas.width, 1, 'eviction releases the pixel reveal buffer too')
  warmSelectedArt(items, -1, 7, 8)
  assert.equal(held().length, 16, 'ultrawide ribbon uses a larger but bounded window')
  warmSelectedArt(items, -1)
  assert.equal(held().length, 7, 'gathering releases the ribbon lookahead')
  assert.equal(previewArt('/cards/proofs/marshmallow.png'), '/card-lab/landing/art/marshmallow.webp')
  assert.equal(previewArt('/some-other-art.svg'), '/some-other-art.svg')
})

test('pixel reveal waits for settlement and plays only once per card per page', () => {
  const saved = Object.fromEntries(['document', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]))
  const pending = new Map()
  let serial = 0
  let paints = 0
  const classes = (...values) => { const set = new Set(values); return { contains: value => set.has(value), add: value => set.add(value), remove: value => set.delete(value) } }
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  globalThis.requestAnimationFrame = fn => { pending.set(++serial, fn); return serial }
  globalThis.cancelAnimationFrame = id => pending.delete(id)
  const card = () => {
    const art = { classList: classes() }
    const image = { complete: true, naturalWidth: 100, naturalHeight: 100, closest: () => art }
    const canvas = { getContext: () => ({ clearRect() {}, drawImage() { paints++ } }) }
    return { classList: classes('is-front'), closest: () => ({ classList: classes('is-live') }), querySelector: selector => selector === '.card-art img' ? image : canvas }
  }
  try {
    const first = card()
    revealSelectedCard(first)
    assert.equal(pending.size, 0, 'image load/front changes must not start motion before settlement')
    settleSelectedCard(first)
    assert.equal(pending.size, 1)
    const [id, tick] = pending.entries().next().value
    pending.delete(id); tick(0)
    assert.equal(paints, 1)
    pauseSelectedReveal()
    assert.equal(pending.size, 0, 'a new drag cancels in-flight drawing')
    settleSelectedCard(first)
    assert.equal(pending.size, 0, 'returning to a previously shown card does not replay it')
    const next = card()
    settleSelectedCard(next)
    assert.equal(pending.size, 1, 'a different settled card gets its one reveal')
    pauseSelectedReveal()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]
      else globalThis[key] = value
    }
  }
})
