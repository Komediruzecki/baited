import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FAN,
  FAN_MARGIN,
  HIDDEN_FROM,
  along,
  fanPose,
  fanSpread,
  liftAt,
  releaseTarget,
  springEase,
  wrapIndex,
  wrapOffset,
} from '../site/deck.js'

// The fan's pure geometry and release rules. Pointer handling and paint are covered in a browser.
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)

test('the front card is upright, full size and unshaded', () => {
  const pose = fanPose(0, 300, 420)
  assert.deepEqual(
    { x: pose.x, y: pose.y, rotate: pose.rotate, scale: pose.scale, dim: pose.dim, opacity: pose.opacity },
    { x: 0, y: 0, rotate: 0, scale: 1, dim: 0, opacity: 1 }
  )
})

test('neighbours and outer cards match the measured reference slots, mirrored left and right', () => {
  for (const [distance, angle, scale] of [
    [1, 9.76, 0.905],
    [2, 14.97, 0.801],
  ]) {
    const right = fanPose(distance, 300, 420)
    const left = fanPose(-distance, 300, 420)
    near(right.rotate, angle)
    near(left.rotate, -angle)
    near(right.scale, scale)
    near(right.x, -left.x)
    near(right.y, left.y)
    assert.ok(right.x > 0 && right.y > 0)
  }
})

test('cards fade out toward the third slot and are not drawn beyond it', () => {
  assert.equal(fanPose(2, 300, 420).opacity, 1)
  near(fanPose(2.5, 300, 420).opacity, 0.5)
  assert.equal(fanPose(HIDDEN_FROM, 300, 420).visible, false)
  assert.equal(fanPose(-2.99, 300, 420).visible, true)
  assert.equal(along(FAN.dim, 10), FAN.dim.at(-1))
})

test('poses change continuously between slots, so a drag moves the whole fan smoothly', () => {
  let previous = fanPose(0, 300, 420)
  for (let d = 0.05; d <= 2.95; d += 0.05) {
    const pose = fanPose(d, 300, 420)
    assert.ok(pose.rotate >= previous.rotate && pose.scale <= previous.scale && pose.dim >= previous.dim)
    assert.ok(Math.abs(pose.x - previous.x) < 6, 'no jumps in x')
    previous = pose
  }
})

test('offsets wrap around the deck in both directions', () => {
  assert.equal(wrapOffset(0, 0, 18), 0)
  assert.equal(wrapOffset(17, 0, 18), -1)
  assert.equal(wrapOffset(1, 17, 18), 2)
  near(wrapOffset(0, 17.6, 18), 0.4)
  assert.equal(wrapIndex(-1, 18), 17)
  assert.equal(wrapIndex(18, 18), 0)
  assert.equal(wrapIndex(37, 18), 1)
})

test('a released drag springs back, flicks one card, or keeps the nearest card', () => {
  assert.equal(releaseTarget({ from: 0, position: 0.02 }), 0, 'a tiny drag springs back')
  assert.equal(releaseTarget({ from: 0, position: 0.15 }), 1, 'a short drag left takes the next card')
  assert.equal(releaseTarget({ from: 0, position: -0.15 }), -1, 'a short drag right takes the previous card')
  assert.equal(releaseTarget({ from: 0, position: 0.01, velocity: 2 }), 1, 'a quick flick is enough')
  assert.equal(releaseTarget({ from: 0, position: 0.01, velocity: -2 }), -1)
  assert.equal(releaseTarget({ from: 0, position: 1.7 }), 2, 'past halfway keeps the nearest card')
  assert.equal(releaseTarget({ from: 4.6, position: 4.6 }), 5, 'a press mid-flight continues to that card')
})

test('the release spring overshoots slightly and lands exactly on the card', () => {
  let peak = 0
  for (let p = 0; p <= 1; p += 0.001) peak = Math.max(peak, springEase(p))
  assert.ok(peak > 1.1 && peak < 1.2, `peak ${peak}`)
  assert.equal(springEase(0), 0)
  assert.equal(springEase(1), 1)
  near(springEase(0.999), 1, 0.005)
})

test('the arriving card lifts once and comes back to rest', () => {
  assert.equal(liftAt(0), 0)
  near(liftAt(0.36), 1)
  assert.equal(liftAt(1), 0)
  near(liftAt(0.99), 0, 0.001)
})

// The horizontal reach of a card's rotated and scaled box, from the centre of the fan.
function reach(offset, width, height, spread) {
  const pose = fanPose(offset, width, height, spread)
  const angle = (Math.abs(pose.rotate) * Math.PI) / 180
  const half = ((pose.scale * width) / 2) * Math.cos(angle) + ((pose.scale * height) / 2) * Math.sin(angle)
  return Math.abs(pose.x) + half
}

test('the fan keeps its reference spread on wide screens', () => {
  assert.equal(fanSpread(1440, 300, 420), 1)
  assert.equal(fanSpread(1024, 300, 420), 1)
  assert.equal(fanPose(1, 300, 420).x, fanPose(1, 300, 420, 1).x)
})

test('on a phone the fan closes up so the outer cards stay on the screen', () => {
  for (const [room, width, height] of [
    [390, 260, 364],
    [375, 260, 364],
    [360, 260, 364],
    [320, 248, 350],
  ]) {
    const spread = fanSpread(room, width, height)
    assert.ok(spread > 0.1 && spread < 1, `${room}: ${spread}`)
    for (const offset of [-2, -1, 1, 2]) {
      assert.ok(reach(offset, width, height, spread) <= room / 2 - FAN_MARGIN + 1e-9, `${room} px, card ${offset}`)
    }
    assert.ok(Math.abs(reach(2, width, height, spread) - (room / 2 - FAN_MARGIN)) < 1e-9, 'the outer cards reach the margin')
    assert.ok(fanPose(1, width, height, spread).x < fanPose(2, width, height, spread).x, 'the fan keeps its order')
  }
})

test('a screen narrower than one closed fan stacks the cards', () => {
  assert.equal(fanSpread(200, 260, 364), 0)
  assert.equal(fanPose(2, 260, 364, 0).x, 0)
})
