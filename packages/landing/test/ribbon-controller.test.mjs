import assert from 'node:assert/strict'
import test from 'node:test'
import { createRibbonDeck } from '../ribbon/ribbon.js'
import { warmSelectedArt } from '../selected-cards/selected-cards.js'

// A deterministic browser clock exercises the actual controller's scheduling
// and event listeners without approximating CSS layout or emulating its state.
function platform() {
  let now = 0
  let id = 0
  const frames = new Map()
  const timers = new Map()
  const previous = new Map()
  const install = (name, value) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  class Node extends EventTarget {
    constructor() {
      super()
      this.childNodes = []
      this.dataset = {}
      this.attributes = new Map()
      const classes = new Set()
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, active = !classes.has(name)) => { active ? classes.add(name) : classes.delete(name); return active },
      }
      const properties = new Map()
      this.style = { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) }
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)) }
    replaceChildren(...children) { this.childNodes = children }
    matches() { return false }
    contains(node) { return node === this || this.childNodes.includes(node) }
    getBoundingClientRect() { return { top: 100, bottom: 700 } }
    focus() { document.activeElement = this }
  }
  const document = new Node()
  document.hidden = false
  document.activeElement = null
  document.createElement = () => new Node()
  const footer = new Node()
  footer.getBoundingClientRect = () => ({ top: 1200, bottom: 2000 })
  document.querySelector = selector => selector === '.site-footer' ? footer : null
  const window = new Node()
  window.innerWidth = 1440
  window.innerHeight = 900
  window.location = { search: '' }
  const observers = []
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe(target) { this.target = target }
    disconnect() { this.target = null }
  }
  install('document', document)
  install('window', window)
  install('performance', { now: () => now })
  install('IntersectionObserver', IntersectionObserver)
  install('requestAnimationFrame', callback => { frames.set(++id, callback); return id })
  install('cancelAnimationFrame', key => frames.delete(key))
  install('setTimeout', (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id })
  install('clearTimeout', key => timers.delete(key))
  return {
    Node, document, window, footer, observers,
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    },
    get frames() { return frames.size },
    get timers() { return timers.size },
    advance(milliseconds, frameInterval = 16) {
      const end = now + milliseconds
      while (now < end) {
        now = Math.min(end, now + frameInterval)
        const due = [...timers].filter(([, timer]) => timer.at <= now).sort((left, right) => left[1].at - right[1].at)
        for (const [key, timer] of due) if (timers.delete(key)) timer.callback()
        const requested = [...frames]
        frames.clear()
        for (const [, callback] of requested) callback(now)
      }
    },
  }
}

function scene(t, { reduced = false, room = 1440 } = {}) {
  const clock = platform()
  let api
  t.after(() => { try { api?.destroy() } finally { clock.restore() } })
  const hand = new clock.Node()
  hand.id = 'deck-hand'
  const help = new clock.Node()
  const originalHelp = new clock.Node()
  help.replaceChildren(originalHelp)
  const status = new clock.Node()
  const items = Array.from({ length: 20 }, (_, index) => {
    const item = new clock.Node()
    const image = { dataset: { src: `/proof-${index}.webp` }, src: '', getAttribute() { return this.src || null }, removeAttribute() { this.src = '' } }
    item.querySelector = selector => selector === '.card-art img' ? image : null
    return item
  })
  const settled = []
  let paused = 0
  let inner
  const metrics = { room, width: 300, height: 420, zoom: 1, count: items.length }
  clock.window.innerWidth = room
  const createDeck = options => {
    let position = 0
    let target = 0
    const render = () => options.presentation.onRender({ position, metrics, visibleIndices: [0, 1, 2, 18, 19] })
    inner = {
      get position() { return position },
      get target() { return target },
      get front() { return ((Math.round(target) % items.length) + items.length) % items.length },
      moving: false,
      get metrics() { return { ...metrics } },
      dragUnit: () => 561,
      hold: () => position,
      drag(next) { position = next; render() },
      suspend: () => position,
      snap(next, details) { position = target = Math.round(next); render(); settled.push(target); options.onSettle(inner.front, details) },
      to(next) { this.snap(next) },
      next() { this.snap(target + 1) },
      previous() { this.snap(target - 1) },
      release() { this.snap(position) },
      refresh: render,
      finish() { this.snap(target) },
    }
    return inner
  }
  api = createRibbonDeck({
    createDeck, hand, items, help, status,
    cards: items.map((_, index) => ({ word: `word-${index}`, difficulty: 'easy' })),
    reduced: { matches: reduced }, gsap: {}, pauseReveal: () => paused++,
    warmArt: (around, before, after) => warmSelectedArt(items, around, before, after),
  })
  return { clock, hand, help, originalHelp, status, api, settled, metrics, items, get paused() { return paused } }
}

test('hiding during a fan drag commits the nearest card without announcing or resuming', t => {
  const view = scene(t)
  view.status.textContent = 'Existing announcement'
  const from = view.api.hold()
  view.api.drag(from + .65)
  assert.equal(view.api.position, .65)
  assert.equal(view.api.mode, 'fan')
  assert.equal(view.clock.timers, 1, 'the unfinished gesture has an opening recheck to cancel')
  view.clock.document.hidden = true
  view.clock.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(view.api.position, 1)
  assert.equal(view.api.target, 1)
  assert.equal(view.api.mode, 'fan')
  assert.deepEqual(view.settled, [1])
  assert.equal(view.status.textContent, 'Existing announcement')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  assert.ok(view.paused > 0, 'hidden artwork cannot start or retain a reveal')
  view.clock.document.hidden = false
  view.clock.document.dispatchEvent(new Event('visibilitychange'))
  view.clock.advance(10_000)
  assert.equal(view.api.position, 1)
  assert.equal(view.api.mode, 'fan')
  assert.deepEqual(view.settled, [1])
  assert.equal(view.status.textContent, 'Existing announcement')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
})

test('hiding halfway through a fold lands once and leaves no frames or timers to resume', t => {
  const view = scene(t)
  view.api.spread()
  view.clock.advance(700)
  assert.equal(view.api.openness, 1)
  view.api.gather()
  view.clock.advance(160)
  assert.equal(view.api.mode, 'folding')
  assert.ok(view.api.openness > 0 && view.api.openness < 1)
  view.clock.document.hidden = true
  view.clock.document.dispatchEvent(new Event('visibilitychange'))
  assert.equal(view.api.mode, 'fan', 'an instant hidden stop must override an in-progress fold')
  assert.equal(view.api.openness, 0)
  assert.equal(view.api.moving, false)
  assert.equal(view.hand.classList.contains('is-ribbon-open'), false)
  assert.equal(view.hand.classList.contains('is-ribbon-changing'), false)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  assert.equal(view.settled.length, 1, 'the interrupted fold commits exactly one fan card')
  assert.equal(Number.isInteger(view.api.position), true)
  view.clock.document.hidden = false
  view.clock.document.dispatchEvent(new Event('visibilitychange'))
  view.clock.advance(10_000)
  assert.equal(view.api.mode, 'fan')
  assert.equal(view.settled.length, 1)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
})

test('an open row never moves or closes by itself: no autoplay, no frame loop, no deadline', t => {
  const view = scene(t)
  view.api.spread()
  view.clock.advance(700)
  assert.equal(view.api.openness, 1)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  view.clock.advance(20_000)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.api.position, 0)
  assert.equal(view.api.openness, 1)
  assert.equal(view.settled.length, 0, 'still spread out')
  assert.equal(view.api.play, undefined, 'there is nothing to play')
  assert.deepEqual(view.help.childNodes.map(node => node.className), ['ribbon-help-prefix', 'ribbon-toggle'], 'and no Pause button')
})

test('a reduced-motion spread stays still without an idle or frame loop', t => {
  const view = scene(t, { reduced: true })
  view.api.spread()
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.api.openness, 1)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  view.clock.advance(10_000)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  view.api.gather()
  assert.equal(view.api.mode, 'fan')
  assert.equal(view.settled.length, 1)
})

test('a paused ribbon refresh warms its expanded art window without advancing the selection', t => {
  const view = scene(t, { room: 390 })
  view.api.spread({ paused: true })
  view.clock.advance(700)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.api.position, 0)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  const loaded = () => view.items.filter(item => item.querySelector('.card-art img').getAttribute('src')).length
  const before = loaded()
  const newlyVisible = view.items[16].querySelector('.card-art img')
  assert.equal(newlyVisible.getAttribute('src'), null)
  view.metrics.room = view.clock.window.innerWidth = 1440
  view.api.refresh()
  assert.ok(loaded() > before, 'newly visible neighbours warm even when the rounded position is unchanged')
  assert.equal(newlyVisible.src, newlyVisible.dataset.src)
  assert.equal(view.api.position, 0)
  assert.equal(view.api.mode, 'paused')
  view.clock.advance(16) // One queued visibility check, not a continuous loop.
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
})

test('scroll visibility is coalesced and gathers only below half a card, including footer coverage', t => {
  const view = scene(t)
  view.items.forEach(item => { item.getBoundingClientRect = () => ({ top: 200, bottom: 600 }) })
  view.api.spread({ paused: true })
  view.clock.advance(700)
  view.clock.footer.getBoundingClientRect = () => ({ top: 520, bottom: 1500 })
  for (let count = 0; count < 10; count++) view.clock.window.dispatchEvent(new Event('scroll'))
  assert.equal(view.clock.frames, 1, 'many scroll events share one visibility read')
  view.clock.advance(16)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.clock.frames, 0)
  view.clock.footer.getBoundingClientRect = () => ({ top: 400, bottom: 1500 })
  view.clock.window.dispatchEvent(new Event('scroll'))
  view.clock.advance(16)
  assert.equal(view.api.mode, 'paused', 'exactly half the card remains available')
  view.clock.footer.getBoundingClientRect = () => ({ top: 399, bottom: 1500 })
  view.clock.window.dispatchEvent(new Event('scroll'))
  view.clock.advance(16)
  assert.equal(view.api.mode, 'fan')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
})

test('a thrown row coasts to a stop on a whole card, the same at any frame rate', async t => {
  const samples = []
  for (const frameInterval of [16, 50, 100]) {
    await t.test(`${frameInterval}ms visible frame interval`, subtest => {
      const view = scene(subtest)
      view.api.spread()
      view.clock.advance(700, frameInterval)
      assert.equal(view.api.mode, 'paused')
      const from = view.api.hold()
      view.api.drag(from - .25)
      const dragged = view.api.position
      assert.ok(dragged < -.4, 'the row follows the drag')
      view.api.release(from, -2)
      assert.equal(view.api.mode, 'coast')
      view.clock.advance(150, frameInterval)
      assert.ok(view.api.position < dragged, 'it carries on the way it was thrown')
      view.clock.advance(3_000, frameInterval)
      samples.push({ frameInterval, position: view.api.position })
      assert.equal(view.api.mode, 'paused')
      assert.equal(Number.isInteger(view.api.position), true, 'it settles on a card')
      assert.equal(view.clock.frames, 0)
      assert.equal(view.clock.timers, 0)
    })
  }
  const positions = samples.map(sample => sample.position)
  assert.equal(new Set(positions).size, 1, `the throw must depend on elapsed time rather than frame count: ${JSON.stringify(samples)}`)
})

test('spreading unfolds and then holds still, whatever the frame rate', async t => {
  for (const frameInterval of [16, 50, 100, 250]) {
    await t.test(`${frameInterval}ms visible frame interval`, subtest => {
      const view = scene(subtest)
      view.api.spread()
      view.clock.advance(2_000, frameInterval)
      assert.equal(view.api.position, 0)
      assert.equal(view.api.openness, 1)
      assert.equal(view.api.mode, 'paused')
      assert.equal(view.clock.frames, 0)
      assert.equal(view.clock.document.hidden, false)
    })
  }
})
