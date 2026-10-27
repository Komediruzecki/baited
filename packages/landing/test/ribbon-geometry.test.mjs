import assert from 'node:assert/strict'
import test from 'node:test'
import { fanPose, fanSpread } from '../site/deck.js'
import { blendPose, openingDistance, qualifiesSpread, ribbonPose } from '../ribbon/ribbon-geometry.js'

const near = (value, expected, tolerance = 1e-9) => assert.ok(Math.abs(value - expected) <= tolerance, `${value} differs from ${expected}`)
const fixtures = [
  { viewportWidth: 320, width: 248, height: 350, room: 320, zoom: 1 },
  { viewportWidth: 390, width: 260, height: 364, room: 390, zoom: 1 },
  { viewportWidth: 768, width: 300, height: 420, room: 768, zoom: 1 },
  { viewportWidth: 1440, width: 300, height: 420, room: 1440, zoom: 1 },
  { viewportWidth: 1440, width: 300, height: 420, room: 1440 / 0.68, zoom: 0.68 },
  { viewportWidth: 3440, width: 330, height: 462, room: 3440, zoom: 1 },
]

test('ribbon keeps the center full-size and upright, with symmetric bounded side poses', () => {
  for (const metrics of fixtures) {
    assert.deepEqual(ribbonPose(0, metrics), { x: 0, y: 0, rotate: 0, scale: 1, dim: 0, opacity: 1, visible: true })
    for (let offset = 0.125; offset <= 7; offset += 0.125) {
      const right = ribbonPose(offset, metrics)
      const left = ribbonPose(-offset, metrics)
      near(left.x, -right.x)
      near(left.rotate, -right.rotate)
      near(left.y, right.y)
      assert.equal(left.visible, right.visible)
      assert.ok(right.scale >= 0.8 && right.scale <= 1)
      assert.ok(right.rotate >= 0 && right.rotate <= 3.5)
      assert.ok(right.dim >= 0 && right.dim <= 0.34)
      assert.ok(Object.values(right).every(value => typeof value === 'boolean' || Number.isFinite(value)))
    }
  }
})

test('unrotated card edges retain the authored gap throughout the center swell', () => {
  for (const metrics of fixtures) {
    const gap = metrics.width <= 260 ? 12 : Math.round(metrics.width * 0.067)
    for (let offset = -5; offset < 5; offset += 0.03125) {
      const left = ribbonPose(offset, metrics)
      const right = ribbonPose(offset + 1, metrics)
      near(right.x - left.x - (right.scale + left.scale) * metrics.width / 2, gap)
    }
  }
})

test('visibility caps six cards per side and excludes centers beyond the viewport plus one card', () => {
  for (const metrics of fixtures) for (const fraction of [0, 0.1, 0.5, 0.9]) {
    const visible = []
    for (let index = -39; index <= 39; index++) {
      const offset = index - fraction
      const pose = ribbonPose(offset, metrics)
      if (pose.visible) {
        visible.push(offset)
        assert.ok(Math.abs(offset) <= 6)
        assert.ok(Math.abs(pose.x) <= metrics.room / 2 + metrics.width)
        assert.equal(pose.opacity, 1)
      } else assert.equal(pose.opacity, 0)
    }
    assert.ok(visible.length <= 13)
  }
  const wide = fixtures.at(-1)
  assert.equal(ribbonPose(6, wide).visible, true)
  assert.equal(ribbonPose(6.0001, wide).visible, false)
  const phone = fixtures[1]
  assert.equal(ribbonPose(1, phone).visible, true)
  assert.equal(ribbonPose(2, phone).visible, false)
})

test('unscaled room is not divided by zoom again', () => {
  const metrics = fixtures[4]
  const reference = ribbonPose(2, { ...metrics, zoom: 1 })
  assert.deepEqual(ribbonPose(2, metrics), reference, 'geometry uses unscaled room independently of zoom')
  const x = reference.x
  near(reference.y, 0.05 * metrics.height * (x / (metrics.room / 2)) ** 2)
  assert.notEqual(reference.y, ribbonPose(2, { ...metrics, room: metrics.room / metrics.zoom }).y)
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
  for (const offset of [NaN, Infinity, -Infinity]) assert.throws(() => ribbonPose(offset, metrics), RangeError)
  for (const openness of [NaN, Infinity, -Infinity]) assert.throws(() => blendPose({}, {}, openness), RangeError)
  for (const key of ['width', 'room', 'zoom']) assert.throws(() => openingDistance({ ...metrics, [key]: 0 }, 390), RangeError)
  const gesture = { distance: 240, heldMs: 500, speed: 0, metrics, viewportWidth: 390 }
  for (const key of ['distance', 'heldMs', 'speed', 'viewportWidth']) assert.equal(qualifiesSpread({ ...gesture, [key]: NaN }), false)
  assert.equal(qualifiesSpread({ ...gesture, metrics: null }), false)
  assert.equal(qualifiesSpread({ ...gesture, heldMs: -500 }), false)
})
