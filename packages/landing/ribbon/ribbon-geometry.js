// The spread deck's row, after a spatial cards slider: the cards stand on the inside of a wide
// curve, so the ones toward the ends turn to face the middle and come a little nearer, and the row
// runs to the edges of its sheet, where it is cut off (ribbon.css): `inset` in from the deck's left
// edge, where the sheet stops short of the screen, and at its right edge, where the sheet runs off
// the screen. The row stands in the middle between the two cuts. `room` is already in the deck's
// unscaled pixels, and so is `inset`; only input thresholds convert back to screen pixels with `zoom`.
const ROW_SCALE = 0.86 // a card in the row against the front card of the fan
const EDGE_TURN = 38 // degrees a card has turned once its centre reaches a cut
const DEPTH = 2.6 // the eye's distance from the curve, in radii of it: nearer looks deeper
const MAX_TURN = 80 // degrees; a card further round faces away and is not drawn
const MAX_SIDE = 6
// At rest the cards at the ends stand across the cuts: each one's middle within CUT_BAND card widths
// of its cut, so it shows between about a third and two thirds of itself. To get there the row
// closes up, keeping at least MIN_GAP card widths between neighbours, or opens out by at most
// MAX_STRETCH, whichever changes it less.
const CUT_BAND = 0.15
const MIN_GAP = 0.02
const MAX_STRETCH = 1.25
const clamp = value => Math.min(1, Math.max(0, value))
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t) }
const mix = (from, to, t) => from + (to - from) * t
const positive = value => Number.isFinite(value) && value > 0

// Vertical visibility, independent of the row's width. The rising footer can
// cover the pinned cards without moving their rectangles out of the viewport.
export function visibleCardFraction(card, { top = 0, bottom, coverTop = bottom }) {
  const height = card.bottom - card.top
  if (![card.top, card.bottom, top, bottom, coverTop].every(Number.isFinite) || height <= 0) return 0
  return clamp((Math.min(card.bottom, bottom, coverTop) - Math.max(card.top, top)) / height)
}

export const rowGap = width => width <= 260 ? 12 : Math.round(width * 0.067)
// Centre to centre of two row cards, along the curve, before the row is fitted to its cuts.
export const rowPitch = width => ROW_SCALE * width + rowGap(width)

// A narrow deck (a phone) draws its row smaller, down to 70%, so the neighbours of the middle card
// still show at its sides; a wide one draws it at the fan's own size.
export const rowFit = ({ room, width, inset = 0 }) => Math.min(1, Math.max(0.7, (room / 2 - inset) / (1.15 * width)))
// Centre to centre of two neighbouring cards in the row as drawn.
export const rowSpacing = metrics => {
  const { radius, step } = rowCurve(metrics)
  return 2 * radius * Math.sin(step / 2)
}

// How far out the middle of the card `k` places from the middle stands, `step` radians apart on a
// curve of `radius`, for cards `width` wide (the middle card's own swell included).
function placeOf(k, step, radius, width) {
  const angle = Math.min((MAX_TURN * Math.PI) / 180, k * step)
  return (radius * Math.sin(angle) * DEPTH) / (DEPTH - 1 + Math.cos(angle)) + ((1 - ROW_SCALE) * width) / 2
}

// The angle between neighbours that leaves a card standing across each cut (CUT_BAND, above), from
// the angle the cards' own pitch gives. Unchanged when a card already stands across the cut, or
// when no card can be brought there within the limits.
function acrossTheCuts(natural, { cut, radius, width }) {
  const band = CUT_BAND * width
  const closest = 2 * Math.asin(Math.min(1, ((ROW_SCALE + MIN_GAP) * width) / (2 * radius)))
  let best = natural
  for (let k = 1; k <= MAX_SIDE; k++) {
    const place = placeOf(k, natural, radius, width)
    if (Math.abs(place - cut) <= band) return natural
    // Further round is further out: halve the range of angles down to the one that brings card k
    // to the near side of the band.
    const target = place > cut ? cut + band : cut - band
    let [low, high] = [0, (MAX_TURN * Math.PI) / 180 / k]
    for (let i = 0; i < 48; i++) {
      const middle = (low + high) / 2
      if (placeOf(k, middle, radius, width) < target) low = middle
      else high = middle
    }
    const step = (low + high) / 2
    if (step < closest || step > natural * MAX_STRETCH) continue
    if (best === natural || Math.abs(step / natural - 1) < Math.abs(best / natural - 1)) best = step
  }
  return best
}

// The curve for a deck `room` wide and cut `inset` in on its left: half the width between the cuts,
// the curve's radius, and the angle between neighbours (radians). A card turned EDGE_TURN has its
// centre at a cut, seen in perspective from DEPTH radii away; the cards' spacing is then fitted so
// that the row's ends are cut at rest.
export function rowCurve(metrics) {
  const { room, inset = 0 } = metrics
  const width = metrics.width * rowFit(metrics)
  const cut = room / 2 - inset / 2
  const half = Math.max(width, cut)
  const edge = (EDGE_TURN * Math.PI) / 180
  const radius = (half * (DEPTH - 1 + Math.cos(edge))) / (DEPTH * Math.sin(edge))
  const natural = 2 * Math.asin(Math.min(1, rowPitch(width) / (2 * radius)))
  return { half, radius, step: acrossTheCuts(natural, { cut, radius, width }) }
}

export function ribbonPose(offset, metrics) {
  const { room, height, inset = 0 } = metrics
  if (!Number.isFinite(offset) || ![room, metrics.width, height].every(positive) || !(inset >= 0) || !Number.isFinite(inset)) throw new RangeError('Ribbon geometry requires finite offsets and positive dimensions.')
  const distance = Math.abs(offset)
  const side = Math.sign(offset)
  const fit = rowFit(metrics)
  const width = metrics.width * fit
  const { radius, step } = rowCurve(metrics)
  const angle = Math.min((MAX_TURN * Math.PI) / 180, distance * step)
  // Nearer cards look bigger, as in perspective; the middle card keeps the front card's size, and
  // its neighbours make room for it.
  const depth = DEPTH / (DEPTH - 1 + Math.cos(angle))
  const scale = fit * (ROW_SCALE + (1 - ROW_SCALE) * (1 - smooth(distance))) * depth
  const swell = ((1 - ROW_SCALE) * width / 2) * smooth(distance)
  const out = radius * Math.sin(angle) * depth + swell
  // Drawn while any of the card is inside the cuts.
  const inner = out - (scale * metrics.width / 2) * Math.cos(angle)
  const visible = distance <= MAX_SIDE && distance * step < (MAX_TURN * Math.PI) / 180 && inner < room / 2 - inset / 2
  const turned = angle / ((EDGE_TURN * Math.PI) / 180)
  // Half the left cut over, so the row stands in the middle between the cuts.
  const x = side * out + inset / 2
  return {
    x,
    y: 0,
    rotate: 0,
    scale,
    // Degrees about the upright: each card faces the middle of the row (ribbon.css).
    turn: (-side * angle * 180) / Math.PI || 0,
    dim: Math.min(0.26, 0.08 * smooth(distance) + 0.14 * turned * turned),
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
