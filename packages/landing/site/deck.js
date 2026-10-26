// Pick a card: a fan of cards that follows a drag and flicks one card at a time.
// Geometry and timing were measured from the flick-cards reference video (1440 x 900):
// the neighbours sit at 9.8 degrees and the outer cards at 15 degrees, a drag of about
// 1.87 card widths moves the fan by one card, and a release springs to the next card
// with a slight overshoot while the arriving card lifts for a moment.
//
// The pure helpers below are unit tested; createDeck drives them with GSAP in the browser.

// Pose of a card by its distance from the front slot (0, 1, 2, 3 cards away).
// x and y are fractions of the card's width and height; dim is the black shade on top.
// Slots 1 and 2 fit the reference's resting fan and its mid-drag frames with straight
// interpolation; slot 3 is extrapolated and fully transparent.
export const FAN = {
  angle: [0, 9.76, 14.97, 18],
  x: [0, 0.2495, 0.451, 0.61],
  y: [0, 0.0118, 0.0491, 0.105],
  scale: [1, 0.905, 0.801, 0.7],
  dim: [0, 0.27, 0.52, 0.75],
  opacity: [1, 1, 1, 0],
}
export const HIDDEN_FROM = 3 // cards this far away (or further) are not drawn
export const DRAG_WIDTHS_PER_CARD = 1.87
export const FLICK_DISTANCE = 0.05 // of a card, about a sixth of a card width of pointer travel
export const FLICK_VELOCITY = 0.6 // cards per second
export const SPRING_SECONDS = 0.6

// Linear interpolation along one of the FAN rows for a distance between 0 and 3.
export function along(values, distance) {
  const d = Math.min(values.length - 1, Math.max(0, distance))
  const i = Math.min(values.length - 2, Math.floor(d))
  return values[i] + (values[i + 1] - values[i]) * (d - i)
}

// `spread` closes the fan up on narrow screens (see fanSpread); 1 is the reference fan.
export function fanPose(offset, width, height, spread = 1) {
  const side = Math.sign(offset)
  const distance = Math.abs(offset)
  return {
    x: side * along(FAN.x, distance) * width * spread,
    y: along(FAN.y, distance) * height,
    rotate: side * along(FAN.angle, distance),
    scale: along(FAN.scale, distance),
    dim: along(FAN.dim, distance),
    opacity: along(FAN.opacity, distance),
    visible: distance < HIDDEN_FROM,
  }
}

// How far the fan may open in `room` px of width: on a phone it closes up so the cards two away
// from the front (the outermost ones at rest) stay `margin` px inside the screen. 1 is the full
// reference fan; wide screens always get it.
export const FAN_MARGIN = 10
export function fanSpread(room, width, height, margin = FAN_MARGIN) {
  const scale = FAN.scale[2]
  const angle = (FAN.angle[2] * Math.PI) / 180
  const half = ((scale * width) / 2) * Math.cos(angle) + ((scale * height) / 2) * Math.sin(angle)
  const spread = (room / 2 - margin - half) / (FAN.x[2] * width)
  return Math.min(1, Math.max(0, spread))
}

// Signed distance of card `index` from a fan position, wrapped into (-count/2, count/2].
export function wrapOffset(index, position, count) {
  let d = (index - position) % count
  if (d > count / 2) d -= count
  if (d <= -count / 2) d += count
  return d
}

export const wrapIndex = (index, count) => ((Math.round(index) % count) + count) % count

// Where a released drag goes. `from` is the fan position when the pointer went down.
// Past the halfway point it keeps the nearest card; otherwise a short drag or a quick
// flick moves exactly one card in that direction, and anything less springs back.
export function releaseTarget({ from, position, velocity = 0 }) {
  const anchor = Math.round(from)
  const nearest = Math.round(position)
  if (nearest !== anchor) return nearest
  const moved = position - from
  if (Math.abs(moved) >= FLICK_DISTANCE) return anchor + Math.sign(moved)
  if (Math.abs(velocity) >= FLICK_VELOCITY) return anchor + Math.sign(velocity)
  return anchor
}

// Release motion, fitted to the reference video: a damped spring (damping ratio 0.72,
// 14.25 rad/s) that leaves with a push (18.8 card-distances per second). It passes the
// target after about 90 ms, peaks 17% beyond it at 165 ms and settles by 0.6 s.
const SPRING = { zeta: 0.723, omega: 14.25, push: 18.84 }
export function springEase(progress) {
  if (progress >= 1) return 1
  if (progress <= 0) return 0
  const t = progress * SPRING_SECONDS
  const { zeta, omega, push } = SPRING
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + ((zeta * omega - push) / damped) * Math.sin(damped * t))
}

// Short lift of the card arriving at the front: it grows by 1.7% while the spring peaks,
// then eases back. Returns 0..1.
export const LIFT_SECONDS = 0.45
export function liftAt(progress) {
  if (progress <= 0 || progress >= 1) return 0
  const peak = 0.36
  return progress < peak ? Math.sin((Math.PI / 2) * (progress / peak)) : 0.5 * (1 + Math.cos((Math.PI * (progress - peak)) / (1 - peak)))
}

export function createDeck({ hand, items, gsap, reduced, onFront, onSettle }) {
  const count = items.length
  const shades = items.map((item) => item.querySelector('.card-shade'))
  const state = { position: 0 }
  let target = 0
  let front = -1
  let tween = null
  let lift = { index: -1, value: 0 }
  let liftTween = null
  let width = 0
  let height = 0
  let zoom = 1
  let spread = 1

  // Poses use the cards' own size; a drag uses their size on screen, since short screens scale the deck down.
  // The fan closes up to fit the width it has (in the deck's own, unscaled pixels).
  function measure() {
    width = items[0].offsetWidth || 300
    height = items[0].offsetHeight || 420
    const list = items[0].parentElement
    zoom = (list && list.offsetWidth && list.getBoundingClientRect().width / list.offsetWidth) || 1
    spread = hand.clientWidth ? fanSpread(hand.clientWidth / zoom, width, height) : 1
  }

  function render() {
    const direction = Math.sign(target - state.position)
    items.forEach((item, index) => {
      const d = wrapOffset(index, state.position, count)
      const pose = fanPose(d, width, height, spread)
      item.classList.toggle('is-out', !pose.visible)
      if (!pose.visible) return
      const raise = lift.index === index ? lift.value : 0
      item.style.transform =
        `translate3d(${pose.x.toFixed(2)}px, ${(pose.y + 0.0032 * height * raise).toFixed(2)}px, 0) ` +
        `rotate(${pose.rotate.toFixed(3)}deg) scale(${(pose.scale * (1 + 0.017 * raise)).toFixed(4)})`
      item.style.opacity = pose.opacity.toFixed(3)
      item.style.zIndex = String(100 - Math.round(Math.abs(d) * 20) + (Math.sign(d) === direction ? 1 : 0))
      if (shades[index]) shades[index].style.opacity = pose.dim.toFixed(3)
    })
  }

  function setFront(index, details) {
    const next = wrapIndex(index, count)
    items.forEach((item, i) => {
      const isFront = i === next
      item.classList.toggle('is-front', isFront)
      item.setAttribute('aria-hidden', String(!isFront))
    })
    if (next !== front) {
      front = next
      onFront?.(front, details)
    }
  }

  function settle(details) {
    tween = null
    state.position = target
    render()
    onSettle?.(wrapIndex(target, count), details)
  }

  function popFront(index) {
    liftTween?.kill()
    if (!gsap || reduced.matches) return
    lift = { index: wrapIndex(index, count), value: 0 }
    liftTween = gsap.to(
      { progress: 0 },
      {
        progress: 1,
        duration: LIFT_SECONDS,
        ease: 'none',
        onUpdate() {
          lift.value = liftAt(this.targets()[0].progress)
          render()
        },
        onComplete() {
          lift.value = 0
          render()
        },
      }
    )
  }

  // Move to a card index (unwrapped; the fan keeps counting past the ends).
  function to(next, details = {}) {
    tween?.kill()
    const changed = Math.round(next) !== Math.round(target)
    target = Math.round(next)
    setFront(target, details)
    if (changed) popFront(target)
    if (!gsap || reduced.matches || Math.abs(target - state.position) < 0.0005) {
      settle(details)
      return
    }
    tween = gsap.to(state, {
      position: target,
      duration: SPRING_SECONDS,
      ease: springEase,
      onUpdate: render,
      onComplete: () => settle(details),
    })
  }

  // Dragging: the fan follows the pointer directly; release decides the card.
  function hold() {
    tween?.kill()
    tween = null
    return state.position
  }
  function drag(position) {
    state.position = position
    render()
  }
  function release(from, velocity) {
    to(releaseTarget({ from, position: state.position, velocity }), { deliberate: true })
  }
  const dragUnit = () => DRAG_WIDTHS_PER_CARD * (width || 300) * zoom

  measure()
  setFront(0)
  render()
  return {
    get position() {
      return state.position
    },
    get target() {
      return target
    },
    get front() {
      return front
    },
    get moving() {
      return !!tween
    },
    to,
    next: () => to(target + 1, { deliberate: true }),
    previous: () => to(target - 1, { deliberate: true }),
    hold,
    drag,
    release,
    dragUnit,
    refresh() {
      measure()
      render()
    },
    finish() {
      tween?.kill()
      liftTween?.kill()
      lift.value = 0
      settle({})
    },
  }
}
