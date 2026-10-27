import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { installPresentedDeck } from '../scripts/presented-deck.mjs'
import { installSelectedCards } from '../scripts/selected-cards.mjs'
import { createDeck as originalDeck } from '../site/deck.js'

async function fixture(t, environment = 'dev', selected = true) {
  const root = await mkdtemp(join(tmpdir(), 'baited-presented-deck-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  const stagingSite = join(root, `site-${environment}`)
  await mkdir(join(stagingSite, 'assets/card-deck'), { recursive: true })
  await writeFile(join(stagingSite, 'assets/card-deck/back-prism.webp'), 'Prism fixture')
  for (const file of ['app.js', 'index.html', 'styles.css', 'deck.js']) await copyFile(new URL(`../site/${file}`, import.meta.url), join(stagingSite, file))
  if (selected) await installSelectedCards({ environment, stagingSite })
  return stagingSite
}

async function installed(t) {
  const stagingSite = await fixture(t)
  await installPresentedDeck({ environment: 'dev', stagingSite })
  return import(pathToFileURL(join(stagingSite, 'assets/card-deck/presented-deck.js')).href)
}

function scene({ width = 300, height = 420, room = 1440, zoom = 1, count = 9 } = {}) {
  let reads = 0
  const list = { offsetWidth: room, getBoundingClientRect() { reads++; return { width: room * zoom } } }
  const items = Array.from({ length: count }, () => {
    const classes = new Set()
    const shade = { style: {} }
    return {
      get offsetWidth() { reads++; return width },
      get offsetHeight() { reads++; return height },
      parentElement: list,
      style: {},
      attributes: {},
      classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name) }, contains: name => classes.has(name) },
      setAttribute(name, value) { this.attributes[name] = value },
      querySelector(selector) { assert.equal(selector, '.card-shade'); return shade },
      snapshot() { return { style: { ...this.style }, attributes: { ...this.attributes }, classes: [...classes].sort(), shade: { ...shade.style } } },
    }
  })
  return { hand: { get clientWidth() { reads++; return room } }, items, reduced: { matches: false }, get reads() { return reads }, snapshot: () => items.map(item => item.snapshot()) }
}

function clock() {
  const tweens = []
  return {
    tweens,
    to(target, options) {
      const key = Object.hasOwn(options, 'position') ? 'position' : 'progress'
      const start = target[key]
      const tween = { killed: false, finished: false, kill() { this.killed = true }, tick(progress) {
        if (this.killed || this.finished) return
        const eased = typeof options.ease === 'function' ? options.ease(progress) : progress
        target[key] = start + (options[key] - start) * eased
        options.onUpdate?.call({ targets: () => [target] })
        if (progress === 1) { this.finished = true; options.onComplete?.() }
      } }
      tweens.push(tween)
      return tween
    },
    tick(progress) { for (const tween of [...tweens]) tween.tick(progress) },
  }
}

test('presented installer replaces the deck import after selected staging', async t => {
  const stagingSite = await fixture(t)
  const files = ['app.js', 'deck.js', 'styles.css', 'index.html']
  const source = await Promise.all(files.map(file => readFile(new URL(`../site/${file}`, import.meta.url), 'utf8')))
  const before = await Promise.all(files.map(file => readFile(join(stagingSite, file), 'utf8')))
  assert.equal(await installPresentedDeck({ environment: 'dev', stagingSite }), true)
  const after = await Promise.all(files.map(file => readFile(join(stagingSite, file), 'utf8')))
  assert.equal(after[0], before[0].replace("from './deck.js'", "from '/assets/card-deck/presented-deck.js'"))
  assert.deepEqual(after.slice(1), before.slice(1), 'original staged deck and static files stay byte-identical')
  assert.deepEqual(await Promise.all(files.map(file => readFile(new URL(`../site/${file}`, import.meta.url), 'utf8'))), source)
  assert.deepEqual((await readdir(join(stagingSite, 'assets/card-deck'))).sort(), ['back-prism.webp', 'presented-deck.js', 'selected-cards.css', 'selected-cards.js'])
})

test('production gets the same presentation seam; missing, duplicate or reordered hooks fail before writing', async t => {
  const prod = await fixture(t, 'prod')
  assert.equal(await installPresentedDeck({ environment: 'prod', stagingSite: prod }), true)
  assert.ok((await readFile(join(prod, 'app.js'), 'utf8')).includes("from '/assets/card-deck/presented-deck.js'"))
  assert.ok(!(await readdir(prod)).includes('card-lab'))
  await assert.rejects(installPresentedDeck({ environment: 'dev', stagingSite: prod }), /site-dev/)
  const unselected = await fixture(t, 'dev', false)
  await assert.rejects(installPresentedDeck({ environment: 'dev', stagingSite: unselected }))
  for (const [file, mutate] of [
    ['deck.js', source => source.replace('  function render() {', '  function paint() {')],
    ['app.js', source => source + "\nimport { createDeck, wrapIndex, wrapOffset } from './deck.js'\n"],
  ]) {
    const stagingSite = await fixture(t)
    await writeFile(join(stagingSite, file), mutate(await readFile(join(stagingSite, file), 'utf8')))
    const beforeApp = await readFile(join(stagingSite, 'app.js'), 'utf8')
    const beforeDeck = await readFile(join(stagingSite, 'deck.js'), 'utf8')
    await assert.rejects(installPresentedDeck({ environment: 'dev', stagingSite }), /hook changed/)
    assert.equal(await readFile(join(stagingSite, 'app.js'), 'utf8'), beforeApp)
    assert.equal(await readFile(join(stagingSite, 'deck.js'), 'utf8'), beforeDeck)
    assert.deepEqual((await readdir(join(stagingSite, 'assets/card-deck'))).sort(), ['back-prism.webp', 'selected-cards.css', 'selected-cards.js'])
  }
})

test('default presentation preserves original poses, spring, lift and navigation', async t => {
  const { createDeck } = await installed(t)
  for (const geometry of [{}, { width: 260, height: 364, room: 390 }, { width: 300, height: 420, room: 1024, zoom: 0.68 }]) {
    const oldScene = scene(geometry)
    const newScene = scene(geometry)
    const oldClock = clock()
    const newClock = clock()
    const oldDeck = originalDeck({ ...oldScene, gsap: oldClock })
    const newDeck = createDeck({ ...newScene, gsap: newClock })
    const same = () => {
      assert.deepEqual(newScene.snapshot(), oldScene.snapshot())
      assert.deepEqual([newDeck.position, newDeck.target, newDeck.front, newDeck.dragUnit()], [oldDeck.position, oldDeck.target, oldDeck.front, oldDeck.dragUnit()])
    }
    same()
    for (const position of [0.3, -0.8, 8.4, 19.25]) { oldDeck.drag(position); newDeck.drag(position); same() }
    oldDeck.to(2); newDeck.to(2)
    for (const progress of [0.2, 0.36, 0.7, 1]) { oldClock.tick(progress); newClock.tick(progress); same() }
    oldDeck.next(); newDeck.next(); oldClock.tick(1); newClock.tick(1); same()
    oldDeck.previous(); newDeck.previous(); oldDeck.finish(); newDeck.finish(); same()
    oldDeck.drag(2.1); newDeck.drag(2.1); oldDeck.release(2, 0); newDeck.release(2, 0); oldClock.tick(1); newClock.tick(1); same()
  }
})

test('presentation receives measured metrics and complete post-paint frames without per-redraw layout reads', async t => {
  const { createDeck } = await installed(t)
  const view = scene({ room: 1000, zoom: 0.8 })
  const frames = []
  const poses = []
  const deck = createDeck({ ...view, presentation: {
    pose(offset, metrics, originalPose) { poses.push({ offset, metrics, originalPose }); return { ...originalPose, x: originalPose.x + 17, visible: Math.abs(offset) <= 1 } },
    onRender(frame) {
      assert.deepEqual(frame.visibleIndices, view.items.flatMap((item, index) => item.classList.contains('is-out') ? [] : [index]), 'frame follows all visibility writes')
      assert.ok(frame.visibleIndices.every(index => view.items[index].style.transform), 'visible transforms have been painted')
      frames.push(frame)
    },
  } })
  assert.deepEqual(deck.metrics, { width: 300, height: 420, zoom: 0.8, room: 1250, count: 9 })
  assert.deepEqual(frames[0], { position: 0, target: 0, front: 0, metrics: deck.metrics, visibleIndices: [0, 1, 8] })
  assert.match(view.items[0].style.transform, /^translate3d\(17\.00px,/)
  const measured = view.reads
  deck.redraw()
  deck.drag(2.4)
  assert.equal(view.reads, measured, 'redraw, drag and metrics access must not remeasure layout')
  assert.equal(frames.at(-1).position, 2.4)
  assert.ok(poses.every(({ metrics }) => metrics.room === 1250 && metrics.count === 9))
  const copy = deck.metrics
  copy.room = 0
  assert.equal(deck.metrics.room, 1250, 'callers cannot overwrite stored measurements through a snapshot')
  deck.refresh()
  assert.ok(view.reads > measured)
})

test('suspend kills position and lift together, zeros lift and preserves position without settling', async t => {
  const { createDeck } = await installed(t)
  const view = scene()
  const gsap = clock()
  const settled = []
  const deck = createDeck({ ...view, gsap, onSettle: (...args) => settled.push(args) })
  deck.to(1)
  gsap.tick(0.36)
  assert.equal(gsap.tweens.length, 2)
  const position = deck.position
  assert.equal(deck.suspend(), position)
  assert.equal(deck.position, position)
  assert.equal(deck.moving, false)
  assert.ok(gsap.tweens.every(tween => tween.killed))
  assert.equal(settled.length, 0)
  const flat = scene()
  const flatDeck = originalDeck(flat)
  flatDeck.to(1)
  flatDeck.drag(position)
  assert.deepEqual(view.snapshot(), flat.snapshot(), 'suspended frame contains no residual front lift')
  const paused = view.snapshot()
  gsap.tick(1)
  assert.deepEqual(view.snapshot(), paused, 'killed animation callbacks cannot resume painting')
})

test('snap synchronously commits the nearest unwrapped index with one front change and one settlement', async t => {
  const { createDeck } = await installed(t)
  const view = scene()
  const gsap = clock()
  const fronts = []
  const settled = []
  const deck = createDeck({ ...view, gsap, onFront: (...args) => fronts.push(args), onSettle: (...args) => settled.push(args) })
  deck.to(1)
  gsap.tick(0.2)
  fronts.length = 0
  const detail = { deliberate: true }
  deck.snap(10.6, detail)
  assert.deepEqual([deck.position, deck.target, deck.front, deck.moving], [11, 11, 2, false])
  assert.deepEqual(fronts, [[2, detail]])
  assert.deepEqual(settled, [[2, detail]])
  assert.equal(gsap.tweens.length, 2, 'snap creates no new spring or lift')
  assert.ok(gsap.tweens.every(tween => tween.killed))
  deck.snap(11)
  assert.equal(fronts.length, 1, 'same logical card does not repeat onFront')
  assert.equal(settled.length, 2, 'each snap settles once even when the logical card is unchanged')
  assert.equal(settled[1][0], 2)
})
