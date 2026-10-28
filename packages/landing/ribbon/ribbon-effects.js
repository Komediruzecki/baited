// The spread deck's effects:
// - Hp Vlct (after Fiddle.Digital): as the row moves fast the art splits into red and cyan and
//   leans with the motion, and settles again as it slows. A resting row shows none of it.
// - Momentum hover (after a momentum-based hover study): a mouse passing over a card pushes it
//   along with the pointer's speed and spins it by where it was struck, and the card springs back.
// The ribbon (ribbon.js) reports where it is; the looks are in ribbon.css.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const GLITCH_FROM = 0.8 // cards per second before the row starts to glitch…
export const GLITCH_FULL = 4 // …and the speed at which it is at full strength

export function glitchAmount(speed) {
  return clamp((Math.abs(speed) - GLITCH_FROM) / (GLITCH_FULL - GLITCH_FROM), 0, 1)
}

export const PUSH_SPRING = 12 // rad/s: how quickly a pushed card swings back
export const PUSH_DAMPING = 0.45 // damping ratio: a little overshoot, then still
export const PUSH_GAIN = 300 // px/s of push for each px/ms of pointer speed
export const SPIN_GAIN = 160 // deg/s of spin for each px/ms of pointer speed across the card
export const PUSH_MAX = 1100 // px/s
export const SPIN_MAX = 420 // deg/s

// The kick a card takes from a pointer moving at (vx, vy) px/ms that enters it (dx, dy) px from its
// centre: a push along the pointer's path, and a spin from the torque about the centre (struck
// above the middle while moving right, it turns clockwise).
export function kick(vx, vy, dx, dy) {
  const torque = (dx * vy - dy * vx) / (Math.hypot(dx, dy) || 1)
  // (`|| 0` turns a -0 from a still axis into 0.)
  return {
    vx: clamp(vx * PUSH_GAIN, -PUSH_MAX, PUSH_MAX) || 0,
    vy: clamp(vy * PUSH_GAIN, -PUSH_MAX, PUSH_MAX) || 0,
    vr: clamp(torque * SPIN_GAIN, -SPIN_MAX, SPIN_MAX) || 0,
  }
}

// One step of the springs that bring a pushed card back to rest; `s` holds x, y (px) and r (deg)
// with their speeds, and is changed in place.
export function stepSpring(s, seconds) {
  const stiffness = PUSH_SPRING * PUSH_SPRING
  const friction = 2 * PUSH_DAMPING * PUSH_SPRING
  for (const [place, speed] of [['x', 'vx'], ['y', 'vy'], ['r', 'vr']]) {
    s[speed] += (-stiffness * s[place] - friction * s[speed]) * seconds
    s[place] += s[speed] * seconds
  }
  return s
}

export const atRest = s =>
  Math.abs(s.x) < 0.1 && Math.abs(s.y) < 0.1 && Math.abs(s.r) < 0.05 && Math.abs(s.vx) < 2 && Math.abs(s.vy) < 2 && Math.abs(s.vr) < 1

export function createRibbonEffects({ hand, items, reduced }) {
  // Without a real page (the ribbon's unit tests) there is nothing to draw on.
  if (typeof document === 'undefined' || typeof hand?.append !== 'function') {
    return { open() {}, move() {}, close() {}, destroy() {} }
  }
  let open = false
  let lastP = null
  let lastT = 0
  let speed = 0
  let shown = -1
  let settleFrame = 0
  const springs = new Map()
  let springFrame = 0
  let springTime = 0
  let trail = []
  let hovered = null

  function setGlitch(value) {
    const amount = Math.round(value * 100) / 100
    if (amount === shown) return
    shown = amount
    hand.style.setProperty('--ribbon-glitch', amount)
    hand.style.setProperty('--ribbon-direction', speed < 0 ? -1 : 1)
    hand.classList.toggle('is-ribbon-glitching', amount > 0)
  }
  // When the row stops being drawn, its speed dies away over a few frames instead of snapping off.
  function settle(now) {
    settleFrame = 0
    if (now - lastT > 40) speed *= Math.exp(-(now - lastT) / 160)
    setGlitch(glitchAmount(speed))
    if (shown > 0) settleFrame = requestAnimationFrame(settle)
  }
  function move(p, now = performance.now()) {
    if (!open || reduced.matches) return
    // Several draws inside one frame would make a tiny gap look like a huge speed: wait for 8ms.
    if (lastP !== null && now - lastT < 8) return
    if (lastP !== null) speed += ((p - lastP) * 1000 / (now - lastT) - speed) * 0.35
    lastP = p
    lastT = now
    setGlitch(glitchAmount(speed))
    if (!settleFrame && shown > 0) settleFrame = requestAnimationFrame(settle)
  }

  const write = (item, s) => {
    item.style.setProperty('--push-x', `${s.x.toFixed(2)}px`)
    item.style.setProperty('--push-y', `${s.y.toFixed(2)}px`)
    item.style.setProperty('--push-r', `${s.r.toFixed(2)}deg`)
  }
  const unpush = item => {
    for (const name of ['--push-x', '--push-y', '--push-r']) item.style.removeProperty(name)
  }
  function swing(now) {
    springFrame = 0
    // Two half steps keep the spring steady through a slow frame.
    const seconds = Math.min(0.034, Math.max(0, (now - springTime) / 1000)) / 2
    springTime = now
    for (const [item, s] of springs) {
      stepSpring(stepSpring(s, seconds), seconds)
      if (atRest(s)) {
        springs.delete(item)
        unpush(item)
      } else write(item, s)
    }
    if (springs.size) springFrame = requestAnimationFrame(swing)
  }
  // A resting mouse that moves onto a card that shows its face gives it a kick; a drag or a touch
  // moves the row instead.
  function onPointer(event) {
    if (!open || event.pointerType !== 'mouse' || event.buttons || reduced.matches) {
      hovered = null
      trail = []
      return
    }
    const now = event.timeStamp
    trail.push({ x: event.clientX, y: event.clientY, t: now })
    trail = trail.filter(sample => now - sample.t <= 80)
    const item = event.target?.closest?.('.deck-card-item')
    const face = item && items.includes(item) && item.classList.contains('is-ribbon-face') ? item : null
    if (face === hovered) return
    hovered = face
    const first = trail[0]
    const last = trail.at(-1)
    if (!face || last.t <= first.t) return
    const box = face.getBoundingClientRect()
    const push = kick(
      (last.x - first.x) / (last.t - first.t),
      (last.y - first.y) / (last.t - first.t),
      event.clientX - (box.left + box.width / 2),
      event.clientY - (box.top + box.height / 2)
    )
    const s = springs.get(face) ?? { x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0 }
    s.vx += push.vx
    s.vy += push.vy
    s.vr += push.vr
    springs.set(face, s)
    if (!springFrame) {
      springTime = performance.now()
      springFrame = requestAnimationFrame(swing)
    }
  }
  function onLeave() {
    hovered = null
    trail = []
  }
  hand.addEventListener('pointermove', onPointer, { passive: true })
  hand.addEventListener('pointerdown', onPointer, { passive: true })
  hand.addEventListener('pointerleave', onLeave, { passive: true })

  return {
    open() {
      open = true
      lastP = null
      speed = 0
    },
    move,
    close() {
      open = false
      speed = 0
      onLeave()
      cancelAnimationFrame(settleFrame)
      settleFrame = 0
      setGlitch(0)
      cancelAnimationFrame(springFrame)
      springFrame = 0
      for (const item of springs.keys()) unpush(item)
      springs.clear()
    },
    destroy() {
      this.close()
      hand.removeEventListener('pointermove', onPointer)
      hand.removeEventListener('pointerdown', onPointer)
      hand.removeEventListener('pointerleave', onLeave)
    },
  }
}
