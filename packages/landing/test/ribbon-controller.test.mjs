import assert from 'node:assert/strict'
import test from 'node:test'
import { createRibbonDeck } from '../ribbon/ribbon.js'

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
  document.querySelector = selector => selector === '.site-footer' ? footer : null
  const window = new Node()
  window.innerWidth = 1440
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
    Node, document, window, observers,
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
    const image = { dataset: { src: `/proof-${index}.webp` }, src: '', getAttribute() { return this.src || null } }
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
  assert.ok(view.clock.frames > 0, 'ordinary spread is cruising before the interruption')
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

test('an unattended cruising ribbon gathers after idle and stops its frame loop', t => {
  const view = scene(t)
  view.api.spread()
  view.clock.advance(700)
  assert.ok(view.clock.frames > 0)
  assert.equal(view.clock.timers, 1, 'the ordinary spread has one idle deadline')
  view.clock.advance(7_900)
  assert.equal(view.api.mode, 'fan')
  assert.equal(view.api.openness, 0)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  assert.equal(view.settled.length, 1)
  view.clock.advance(10_000)
  assert.equal(view.settled.length, 1, 'idle work cannot gather a completed fan again')
})

test('a reduced-motion spread stays still without an idle or frame loop', t => {
  const view = scene(t, { reduced: true })
  view.api.spread()
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.api.openness, 1)
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
  view.api.play()
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
  const newlyVisible = view.items[17].querySelector('.card-art img')
  assert.equal(newlyVisible.getAttribute('src'), null)
  view.metrics.room = view.clock.window.innerWidth = 1440
  view.api.refresh()
  assert.ok(loaded() > before, 'newly visible neighbours warm even when the rounded position is unchanged')
  assert.equal(newlyVisible.src, newlyVisible.dataset.src)
  assert.equal(view.api.position, 0)
  assert.equal(view.api.mode, 'paused')
  assert.equal(view.clock.frames, 0)
  assert.equal(view.clock.timers, 0)
})

test('visible cruise travels at the same wall-time pace with normal and delayed frames', async t => {
  const samples = []
  for (const frameInterval of [16, 50, 100]) {
    await t.test(`${frameInterval}ms visible frame interval`, subtest => {
      const view = scene(subtest)
      view.api.spread({ paused: true })
      view.clock.advance(700)
      assert.equal(view.api.mode, 'paused')
      const from = view.api.position
      view.api.play()
      view.clock.advance(2_000, frameInterval)
      const startupTravel = view.api.position - from
      assert.ok(startupTravel > 0, 'play visibly advances the cards during startup')
      view.clock.advance(1_000, frameInterval)
      const steadyFrom = view.api.position
      view.clock.advance(2_000, frameInterval)
      const steadyTravel = view.api.position - steadyFrom
      samples.push({ frameInterval, startupTravel, steadyTravel })
      assert.ok(Math.abs(steadyTravel - .5) < .005,
        `${frameInterval}ms frames moved ${steadyTravel} cards in two seconds; cruise should move approximately half a card`)
      assert.equal(view.api.mode, 'cruise')
      assert.equal(view.clock.document.hidden, false)
    })
  }
  const startup = samples.map(sample => sample.startupTravel)
  const steady = samples.map(sample => sample.steadyTravel)
  assert.ok(Math.max(...startup) - Math.min(...startup) < .005,
    `startup travel must depend on elapsed time rather than frame count: ${JSON.stringify(samples)}`)
  assert.ok(Math.max(...steady) - Math.min(...steady) < .005,
    `steady cruise must depend on elapsed time rather than frame count: ${JSON.stringify(samples)}`)
})

test('direct spreading starts its cruise at the same elapsed time across visible frame intervals', async t => {
  const samples = []
  for (const frameInterval of [16, 50, 100, 250]) {
    await t.test(`${frameInterval}ms visible frame interval`, subtest => {
      const view = scene(subtest)
      view.api.spread()
      view.clock.advance(2_000, frameInterval)
      samples.push({ frameInterval, position: view.api.position })
      assert.ok(view.api.position > 0 && view.api.position < .5, 'the deck unfolds before beginning its slow cruise')
      assert.equal(view.api.openness, 1)
      assert.equal(view.api.mode, 'cruise')
      assert.equal(view.clock.document.hidden, false)
    })
  }
  const positions = samples.map(sample => sample.position)
  assert.ok(Math.max(...positions) - Math.min(...positions) < .005,
    `unfold completion must not count its last frame as extra cruise time: ${JSON.stringify(samples)}`)
})
