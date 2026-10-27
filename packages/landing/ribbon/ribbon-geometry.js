// Opus Ribbon Spread geometry. `room` is already in the deck's unscaled pixels;
// only input thresholds convert it back to screen pixels with `zoom`.
const ROW_SCALE = 0.8
const MAX_SIDE = 6
const clamp = value => Math.min(1, Math.max(0, value))
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t) }
const mix = (from, to, t) => from + (to - from) * t
const positive = value => Number.isFinite(value) && value > 0

export function ribbonPose(offset, metrics) {
  const { room, width, height } = metrics
  if (!Number.isFinite(offset) || ![room, width, height].every(positive)) throw new RangeError('Ribbon geometry requires finite offsets and positive dimensions.')
  const distance = Math.abs(offset)
  const side = Math.sign(offset)
  const gap = width <= 260 ? 12 : Math.round(width * 0.067)
  const pitch = ROW_SCALE * width + gap
  const swell = (1 - ROW_SCALE) * width / 2
  const half = room / 2
  const x = side * (distance * pitch + swell * smooth(distance))
  const arcPosition = Math.min(1.15, Math.abs(x) / half)
  const slope = 2 * 0.05 * height * Math.abs(x) / (half * half)
  const visible = distance <= MAX_SIDE && Math.abs(x) <= half + width
  return {
    x,
    y: 0.05 * height * arcPosition * arcPosition,
    rotate: side * Math.min(3.5, Math.atan(slope) * 180 / Math.PI),
    scale: ROW_SCALE + (1 - ROW_SCALE) * (1 - smooth(distance)),
    dim: Math.min(0.34, 0.14 * smooth(distance) + 0.05 * Math.max(0, distance - 1)),
    opacity: visible ? 1 : 0,
    visible,
  }
}

// Openness is the already-eased transition progress. Smoothstep is used for the
// early visibility fade; position/size retain the lead designer's interpolation.
export function blendPose(original, ribbon, openness) {
  if (!Number.isFinite(openness)) throw new RangeError('Ribbon openness must be finite.')
  const t = clamp(openness)
  if (t === 0) return { ...original }
  if (t === 1) return { ...ribbon }
  const opacity = mix(original.opacity, ribbon.opacity, smooth(t / 0.35))
  return {
    x: mix(original.x, ribbon.x, t),
    y: mix(original.y, ribbon.y, t),
    rotate: mix(original.rotate, ribbon.rotate, t),
    scale: mix(original.scale, ribbon.scale, t),
    dim: mix(original.dim, ribbon.dim, t),
    opacity,
    visible: opacity > 0 && (original.visible || ribbon.visible),
  }
}

function validOpeningMetrics(metrics, viewportWidth) {
  return !!metrics && [metrics.width, metrics.room, metrics.zoom, viewportWidth].every(positive)
}

export function openingDistance(metrics, viewportWidth) {
  if (!validOpeningMetrics(metrics, viewportWidth)) throw new RangeError('Ribbon opening requires positive screen and deck dimensions.')
  const visibleWidth = Math.min(viewportWidth, metrics.room * metrics.zoom)
  const dragUnit = 1.87 * metrics.width * metrics.zoom
  return Math.min(dragUnit, Math.max(0.56 * visibleWidth, 170))
}

// Distance and speed are screen pixels / screen pixels per second. Either pull
// direction is valid; a short, fast or insufficiently held gesture stays a flick.
export function qualifiesSpread({ distance, heldMs, speed, metrics, viewportWidth }) {
  if (![distance, heldMs, speed].every(Number.isFinite) || !validOpeningMetrics(metrics, viewportWidth)) return false
  const visibleWidth = Math.min(viewportWidth, metrics.room * metrics.zoom)
  return Math.abs(distance) >= openingDistance(metrics, viewportWidth) && heldMs >= 260 && Math.abs(speed) <= 1.6 * visibleWidth
}
