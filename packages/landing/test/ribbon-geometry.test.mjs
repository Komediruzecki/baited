import assert from 'node:assert/strict'
import test from 'node:test'
import { fanPose, fanSpread } from '../site/deck.js'
import { blendPose, openingDistance, qualifiesSpread, ribbonPose, rowCurve, rowFit, rowGap, visibleCardFraction } from '../ribbon/ribbon-geometry.js'

const near = (value, expected, tolerance = 1e-9) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} differs from ${expected}`)
// `inset` is the gap the sheet leaves at the screen's left edge (8px on phones, 40px wider up), in
// deck px; the row is cut there and at the screen's right edge, and stands in the middle between.
const fixtures = [
  { viewportWidth: 320, width: 248, height: 350, room: 320, zoom: 1, inset: 8 },
  { viewportWidth: 390, width: 260, height: 364, room: 390, zoom: 1, inset: 8 },
  { viewportWidth: 768, width: 300, height: 420, room: 768, zoom: 1, inset: 40 },
  { viewportWidth: 1440, width: 300, height: 420, room: 1440, zoom: 1, inset: 40 },
  { viewportWidth: 1440, width: 300, height: 420, room: 1440 / 0.68, zoom: 0.68, inset: 40 / 0.68 },
  { viewportWidth: 3440, width: 330, height: 462, room: 3440, zoom: 1, inset: 40 },
]
// How far a card reaches either side of its centre, as drawn (turned and in perspective).
const reach = (pose, metrics) => (pose.scale * metrics.width / 2) * Math.cos((pose.turn * Math.PI) / 180)

test('gather visibility uses the card height, viewport clipping and footer coverage', () => {
  const card = { top: 200, bottom: 600 }
  near(visibleCardFraction(card, { bottom: 900, coverTop: 850 }), 1)
  near(visibleCardFraction(card, { bottom: 900, coverTop: 520 }), .8)
  near(visibleCardFraction(card, { bottom: 900, coverTop: 400 }), .5)
  assert.ok(visibleCardFraction(card, { bottom: 900, coverTop: 399 }) < .5)
  near(visibleCardFraction({ top: -160, bottom: 240 }, { bottom: 844 }), .6)
  near(visibleCardFraction({ top: 644, bottom: 1044 }, { bottom: 844 }), .5)
  near(visibleCardFraction(card, { top: 400, bottom: 844 }), .5)
  assert.equal(visibleCardFraction(card, { bottom: 900, coverTop: 100 }), 0)
  assert.equal(visibleCardFraction({ top: 1000, bottom: 1400 }, { bottom: 900 }), 0)
  assert.equal(visibleCardFraction({ top: 0, bottom: 0 }, { bottom: 900 }), 0)
})

test('the middle card stands upright at the size the row allows, the others turn to face it', () => {
  for (const metrics of fixtures) {
    const fit = rowFit(metrics)
    const middle = metrics.inset / 2
    assert.deepEqual(ribbonPose(0, metrics), { x: middle, y: 0, rotate: 0, scale: fit, turn: 0, dim: 0, opacity: 1, visible: true })
    assert.equal(fit, metrics.room >= 1440 ? 1 : fit, 'desktops draw the row at the fan size')
    assert.ok(fit >= 0.7 && fit <= 1)
    let previous = ribbonPose(0, metrics)
    for (let offset = 0.125; offset <= 7; offset += 0.125) {
      const right = ribbonPose(offset, metrics)
      const left = ribbonPose(-offset, metrics)
      near(left.x - middle, middle - right.x)
      near(left.turn, -right.turn)
      near(left.scale, right.scale)
      assert.equal(left.visible, right.visible)
      assert.equal(right.y, 0)
      assert.equal(right.rotate, 0, 'the row stands upright; its cards turn about their uprights instead')
      assert.ok(right.turn < 0 && right.turn >= -80, 'a card right of the middle turns to face left')
      if (right.visible) assert.ok(right.x > previous.x && right.turn < previous.turn, 'further out, further turned')
      assert.ok(right.dim >= 0 && right.dim <= 0.26)
      assert.ok(Object.values(right).every(value => typeof value === 'boolean' || Number.isFinite(value)))
      previous = right
    }
  }
})

test('cards toward the ends come nearer, as on the inside of a curve', () => {
  for (const metrics of fixtures) {
    const one = ribbonPose(1, metrics)
    const two = ribbonPose(2, metrics)
    assert.ok(two.scale > one.scale, `${metrics.room}: the second card out is drawn larger than the first`)
  }
})

test('neighbouring cards in the row never overlap, at rest or between cards', () => {
  for (const metrics of fixtures) {
    for (let offset = -4; offset < 4; offset += 0.0625) {
      const left = ribbonPose(offset, metrics)
      const right = ribbonPose(offset + 1, metrics)
      if (!left.visible || !right.visible) continue
      assert.ok(right.x - reach(right, metrics) - (left.x + reach(left, metrics)) >= -1e-6, `${metrics.room} at ${offset}`)
    }
  }
})

test('the row turns its cards most at the edges of its sheet and draws none wholly outside the deck', () => {
  for (const metrics of fixtures) {
    const { half, step } = rowCurve(metrics)
    for (const fraction of [0, 0.1, 0.5, 0.9]) {
      const visible = []
      for (let index = -39; index <= 39; index++) {
        const offset = index - fraction
        const pose = ribbonPose(offset, metrics)
        if (pose.visible) {
          visible.push(offset)
          assert.ok(Math.abs(offset) <= 6)
          assert.ok(Math.abs(pose.x) - reach(pose, metrics) < metrics.room / 2, 'some of it is inside the deck')
          assert.equal(pose.opacity, 1)
        } else assert.equal(pose.opacity, 0)
      }
      assert.ok(visible.length <= 13 && visible.length >= 2, `${metrics.room}: ${visible.length} cards`)
    }
    // A card turned 38 degrees has its centre at the cuts (past the room the bigger middle card takes).
    const edge = 38 / ((step * 180) / Math.PI)
    const width = metrics.width * rowFit(metrics)
    const swell = ((1 - 0.86) * width) / 2
    if (half > width) near(ribbonPose(edge, metrics).x - metrics.inset / 2 - swell, half, 1e-6)
    // At rest the last card drawn at either end stands across its cut, about half of it showing:
    // its middle within 0.15 card widths of the cut, which lies half the room less half the inset
    // out from the row's middle.
    const cut = metrics.room / 2 - metrics.inset / 2
    let last = 0
    while (ribbonPose(last + 1, metrics).visible) last++
    const out = ribbonPose(last, metrics).x - metrics.inset / 2
    assert.ok(Math.abs(out - cut) <= 0.15 * width + 1e-6, `${metrics.room}: card ${last} stands ${Math.round(out - cut)}px from the cut`)
  }
  const phone = fixtures[1]
  assert.equal(ribbonPose(1, phone).visible, true, 'on a phone the neighbours show at the sides')
  assert.equal(ribbonPose(2, phone).visible, false)
})

test('unscaled room is not divided by zoom again', () => {
  const metrics = fixtures[4]
  assert.deepEqual(ribbonPose(2, metrics), ribbonPose(2, { ...metrics, zoom: 1 }), 'geometry uses unscaled room independently of zoom')
  assert.notEqual(ribbonPose(2, metrics).x, ribbonPose(2, { ...metrics, room: metrics.room / metrics.zoom }).x)
})

test('the gap between row cards follows the card size', () => {
  assert.equal(rowGap(248), 12)
  assert.equal(rowGap(300), 20)
  assert.equal(rowGap(330), 22)
})

test('blend endpoints preserve both poses exactly and intermediate opacity uses smoothstep', () => {
  for (const metrics of fixtures) for (let offset = -7; offset <= 7; offset += 0.25) {
    const original = fanPose(offset, metrics.width, metrics.height, fanSpread(metrics.room, metrics.width, metrics.height))
    const ribbon = ribbonPose(offset, metrics)
    assert.deepEqual(blendPose(original, ribbon, 0), original)
    assert.deepEqual(blendPose(original, ribbon, 1), ribbon)
    assert.deepEqual(blendPose(original, ribbon, -1), original)
    assert.deepEqual(blendPose(original, ribbon, 2), ribbon)
    for (const openness of [0.01, 0.175, 0.35, 0.6, 0.99]) {
      const pose = blendPose(original, ribbon, openness)
      assert.ok(Object.values(pose).every(value => typeof value === 'boolean' || Number.isFinite(value)))
      assert.ok(pose.opacity >= 0 && pose.opacity <= 1)
      near(pose.x, original.x + (ribbon.x - original.x) * openness)
    }
  }
  const metrics = fixtures.at(-1)
  const original = fanPose(3, metrics.width, metrics.height)
  const ribbon = ribbonPose(3, metrics)
  near(blendPose(original, ribbon, 0.175).opacity, 0.5)
  assert.equal(blendPose(original, ribbon, 0.175).visible, true)
  near(blendPose(original, ribbon, 0.35).opacity, 1)
})

test('opening distances match the authored phone, desktop, zoomed and ultrawide boundaries', () => {
  const expected = [179.2, 218.4, 430.08, 561, 381.48, 617.1]
  fixtures.forEach((metrics, index) => near(openingDistance(metrics, metrics.viewportWidth), expected[index]))
  const metrics = { width: 300, height: 420, room: 800, zoom: 0.5 }
  near(openingDistance(metrics, 320), 179.2, 1e-9)
  near(openingDistance(metrics, 1000), 224, 1e-9)
  near(openingDistance({ ...metrics, room: 200 }, 1000), 170)
})

test('opening requires distance, hold time and speed together, in either direction', () => {
  for (const metrics of fixtures) {
    const viewportWidth = metrics.viewportWidth
    const distance = openingDistance(metrics, viewportWidth)
    const speed = 1.6 * Math.min(viewportWidth, metrics.room * metrics.zoom)
    const gesture = { distance, heldMs: 260, speed, metrics, viewportWidth }
    assert.equal(qualifiesSpread(gesture), true)
    assert.equal(qualifiesSpread({ ...gesture, distance: -distance, speed: -speed }), true)
    assert.equal(qualifiesSpread({ ...gesture, distance: distance - 0.001 }), false)
    assert.equal(qualifiesSpread({ ...gesture, heldMs: 259.999 }), false)
    assert.equal(qualifiesSpread({ ...gesture, speed: speed + 0.001 }), false)
    assert.equal(qualifiesSpread({ ...gesture, distance: distance * 2, heldMs: 150, speed: speed * 2 }), false)
  }
})

test('invalid geometry is rejected rather than producing NaN, and invalid gestures stay closed', () => {
  const metrics = fixtures[1]
  for (const key of ['width', 'height', 'room']) for (const value of [0, -1, NaN, Infinity]) assert.throws(() => ribbonPose(0, { ...metrics, [key]: value }), RangeError)
  for (const value of [-1, NaN, Infinity]) assert.throws(() => ribbonPose(0, { ...metrics, inset: value }), RangeError)
  for (const offset of [NaN, Infinity, -Infinity]) assert.throws(() => ribbonPose(offset, metrics), RangeError)
  for (const openness of [NaN, Infinity, -Infinity]) assert.throws(() => blendPose({}, {}, openness), RangeError)
  for (const key of ['width', 'room', 'zoom']) assert.throws(() => openingDistance({ ...metrics, [key]: 0 }, 390), RangeError)
  const gesture = { distance: 240, heldMs: 500, speed: 0, metrics, viewportWidth: 390 }
  for (const key of ['distance', 'heldMs', 'speed', 'viewportWidth']) assert.equal(qualifiesSpread({ ...gesture, [key]: NaN }), false)
  assert.equal(qualifiesSpread({ ...gesture, metrics: null }), false)
  assert.equal(qualifiesSpread({ ...gesture, heldMs: -500 }), false)
})
