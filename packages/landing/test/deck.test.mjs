import assert from 'node:assert/strict'
import test from 'node:test'
import { createFan } from '../site/deck.js'

// Exercise the controller's public interaction contract without a browser or
// real-time sleeps. Browser acceptance still covers pointer events and paint.
function harness(t) {
  let now = 0
  let nextId = 1
  const pending = new Map()
  const original = new Map()
  const replace = (name, value) => {
    original.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  replace('performance', { now: () => now })
  replace('requestAnimationFrame', (callback) => {
    const id = nextId++
    pending.set(id, callback)
    return id
  })
  replace('cancelAnimationFrame', (id) => pending.delete(id))
  t.after(() => {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })

  const items = Array.from({ length: 18 }, () => {
    const classes = new Set()
    const attributes = new Map()
    const buttonAttributes = new Map()
    const image = { dataset: { ready: 'true' } }
    const shade = { style: {} }
    return {
      style: {},
      classList: {
        toggle(name, force) {
          if (force) classes.add(name)
          else classes.delete(name)
        },
        contains: (name) => classes.has(name),
      },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
      firstElementChild: {
        tabIndex: -1,
        setAttribute: (name, value) => buttonAttributes.set(name, value),
        getAttribute: (name) => buttonAttributes.get(name),
      },
      querySelector(selector) {
        if (selector === 'img') return image
        if (selector === '.card-shade') return shade
        assert.fail(`Unexpected selector ${selector}`)
      },
    }
  })
  const reduced = { matches: false }
  const frontChanges = []
  const settlements = []
  const fan = createFan({
    items,
    reduced,
    phone: { matches: false },
    onFront: (index) => frontChanges.push(index),
    onSettle: (index, details) => settlements.push({ index, ...details }),
  })
  fan.refresh()

  function frame(elapsed = 16) {
    now += elapsed
    const callbacks = [...pending.values()]
    pending.clear()
    for (const callback of callbacks) callback(now)
  }
  function flush() {
    let frames = 0
    while (pending.size && frames++ < 1000) frame()
    assert.equal(pending.size, 0, 'animation must stop scheduling after settling')
  }
  function assertFront(index, inspected = false) {
    assert.deepEqual(
      items.flatMap((item, i) => (item.firstElementChild.tabIndex === 0 ? [i] : [])),
      [index]
    )
    assert.deepEqual(
      items.flatMap((item, i) => (item.getAttribute('aria-hidden') === 'false' ? [i] : [])),
      [index]
    )
    assert.equal(items[index].classList.contains('is-out'), false)
    assert.equal(items[index].classList.contains('is-pending'), false)
    assert.equal(items[index].firstElementChild.getAttribute('aria-pressed'), String(inspected))
    assert.equal(frontChanges.at(-1), index)
  }
  return { fan, items, reduced, frame, flush, assertFront, settlements, pending }
}

test('deck wraps in both directions with only the settled front card focusable', (t) => {
  const h = harness(t)
  h.assertFront(0)
  h.fan.to(-1)
  h.flush()
  h.assertFront(17)
  h.fan.to(0)
  h.flush()
  h.assertFront(0)
  h.fan.to(18)
  h.flush()
  h.assertFront(0)
  assert.deepEqual(
    h.settlements.map(({ index }) => index),
    [17, 0, 0]
  )
})

test('rapid retargeting settles only the latest choice, without stale callbacks', (t) => {
  const h = harness(t)
  h.fan.to(1, 420, true)
  h.frame(80)
  h.fan.to(2, 420, true)
  h.frame(60)
  h.fan.to(3, 420, true)
  h.fan.to(2, 420, true)
  h.flush()
  h.assertFront(2)
  assert.deepEqual(h.settlements, [{ index: 2, deliberate: true, repeated: true }])
  h.frame(2000)
  assert.equal(h.settlements.length, 1)
})

test('pressing during motion freezes the hand and a tap can resume then inspect', (t) => {
  const h = harness(t)
  h.fan.to(1)
  h.frame(70)
  const held = h.fan.freeze()
  assert.ok(held.position > 0 && held.position < 1)
  assert.equal(held.target, 1)
  h.flush()
  assert.equal(h.fan.position, held.position)
  assert.equal(h.settlements.length, 0)

  h.fan.to(held.target)
  h.fan.inspect(true)
  h.flush()
  h.assertFront(1, true)
  assert.equal(h.settlements.length, 1)
  const inspectedTransform = h.items[1].style.transform
  h.fan.inspect(false)
  h.flush()
  h.assertFront(1)
  assert.notEqual(h.items[1].style.transform, inspectedTransform)
})

test('turning reduced motion on mid-flight finishes and cancels every animation frame', (t) => {
  const h = harness(t)
  h.fan.to(2, 420, true)
  h.frame(80)
  h.fan.inspect(true)
  h.reduced.matches = true
  // The app's media-query listener calls finish() before refreshing semantics.
  h.fan.finish()
  assert.equal(h.fan.moving, false)
  assert.equal(h.pending.size, 0)
  h.assertFront(2, true)
  assert.deepEqual(
    h.settlements.map(({ index }) => index),
    [2]
  )
  h.frame(2000)
  assert.equal(h.settlements.length, 1)

  h.fan.to(3)
  h.assertFront(3)
  assert.equal(h.pending.size, 0)
})

test('inspection requested during movement waits for the chosen card to settle', (t) => {
  const h = harness(t)
  h.fan.to(1)
  h.fan.inspect(true)
  assert.equal(h.fan.inspected, true, 'queued inspection must already suspend autoplay')
  assert.equal(
    h.items.some((item) => item.firstElementChild.getAttribute('aria-pressed') === 'true'),
    false
  )
  h.frame(80)
  assert.equal(h.settlements.length, 0)
  h.flush()
  h.assertFront(1, true)
  assert.deepEqual(
    h.settlements.map(({ index }) => index),
    [1]
  )
})

test('putting a queued inspection back prevents it reopening at settle', (t) => {
  const h = harness(t)
  h.fan.to(1)
  h.fan.inspect(true)
  h.frame(80)
  h.fan.inspect(false)
  h.flush()
  h.assertFront(1)
  assert.equal(h.fan.inspected, false)
  assert.equal(h.settlements.length, 1)
})
