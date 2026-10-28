// Approved Cut Open / Glass / Prism, projected without the Lab or game session.
// The open face keeps the small Glass rules, without an inner lens or filter.
export const selectedCardStyle = Object.freeze({ edition: 'cut-open', finish: 'glass', back: 'prism', artFrame: 'open' })
export const glassOptics = { pitch: 12, line: 1.5 }
export function glassRules(pitch) {
  if (!Number.isFinite(pitch) || pitch < 1) throw new RangeError('Glass line pitch must be at least one pixel.')
  const [nx, ny, reach] = [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3), 1200]
  let path = ''
  for (let step = 0; step * pitch <= nx * 400 + ny * 760; step++) {
    const [x, y] = [nx * step * pitch, ny * step * pitch]
    path += `M${(x - ny * reach).toFixed(2)} ${(y + nx * reach).toFixed(2)}L${(x + ny * reach).toFixed(2)} ${(y - nx * reach).toFixed(2)}`
  }
  return path
}
const ruledLight = glassRules(glassOptics.pitch)
const namespace = 'http://www.w3.org/2000/svg'
let serial = 0
function node(tag, className, text) {
  const item = document.createElement(tag)
  if (className) item.className = className
  if (text !== undefined) item.textContent = text
  return item
}
function svg(tag, attributes = {}, children = []) {
  const item = document.createElementNS(namespace, tag)
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value))
  item.append(...children)
  return item
}
function rules(opacity) {
  return svg('path', { d: ruledLight, fill: 'none', stroke: '#fffdf7', 'stroke-opacity': opacity, 'stroke-width': glassOptics.line })
}
function glass() {
  return svg('svg', { class: 'selected-glass-field', 'aria-hidden': true, focusable: false }, [rules(0.22)])
}
function logo(ink = 'white') {
  const mark = node('img')
  Object.assign(mark, { src: `/assets/brand/baited-pixel-${ink}.svg`, alt: 'BAITED', width: 370, height: 100, draggable: false, decoding: 'async' })
  return mark
}

const artWindows = new WeakMap()
// A catalogue is not an image cache. Release references outside the visible
// window so a long browsing session does not retain every decoded illustration.
export function warmSelectedArt(items, around, before = 3, after = 3) {
  const whole = Math.round(around)
  const key = `${whole}:${before}:${after}`
  let window = artWindows.get(items)
  if (!window) {
    window = { key: null, images: items.map(item => item.querySelector('.card-art img')), held: new Set() }
    artWindows.set(items, window)
  }
  if (window.key === key) return
  const keep = new Set()
  for (let offset = -before; offset <= after; offset++) keep.add(((whole + offset) % items.length + items.length) % items.length)
  for (const index of window.held) {
    if (keep.has(index)) continue
    window.images[index]?.removeAttribute('src')
    const canvas = items[index].querySelector('.selected-card__pixels')
    if (canvas) canvas.width = canvas.height = 1
    items[index].querySelector('.card-art')?.classList?.remove('is-pixelated')
  }
  for (const index of keep) {
    const image = window.images[index]
    if (image && !image.getAttribute('src')) image.src = image.dataset.src
  }
  window.held = keep
  window.key = key
}

export function previewArt(path) {
  const name = /^\/cards\/proofs\/([a-z0-9-]+)\.png$/.exec(path)?.[1]
  return name ? `/assets/card-deck/art/${name}.webp` : path
}

export const clueStyles = ['baseline', 'rail', 'pills', 'tokens', 'quiet']
// Ruled matches the approved Cut Open reference. Other studies remain linkable.
export function parseClueStyle(search) {
  const value = new URLSearchParams(typeof search === 'string' ? search : '').get('clue')
  return clueStyles.includes(value) ? value : 'rail'
}
export function exactClues(card) {
  return card.clues.slice(0, card.difficulty === 'hard' ? 4 : card.difficulty === 'medium' ? 2 : 0)
}
function restrictions(card, style) {
  const clues = exactClues(card)
  if (!clues.length) return node('p', 'card-easy', 'Only this word is off limits.')
  if (style === 'quiet') {
    const sentence = node('p', 'card-rule')
    sentence.append(node('span', '', 'Keep '))
    clues.forEach((word, index) => {
      if (index) sentence.append(node('span', '', index === clues.length - 1 ? ' and ' : ', '))
      const term = node('span', 'card-term', word)
      term.dataset.clueWord = ''
      sentence.append(term)
    })
    sentence.append(node('span', '', ' out of chat.'))
    return sentence
  }
  const block = node('div', 'card-forbidden')
  const label = node('p', 'card-forbidden__label', 'Keep out of chat')
  label.id = `landing-clues-${serial}`
  const list = node('ul', 'card-clues')
  list.dataset.count = String(clues.length)
  list.setAttribute('aria-labelledby', label.id)
  for (const word of clues) {
    const item = node('li')
    const term = node('span', '', word)
    term.dataset.clueWord = ''
    if (word.length >= 12) item.dataset.long = ''
    item.append(term)
    list.append(item)
  }
  block.append(label, list)
  return block
}

export function cardFace(card, total, style = parseClueStyle(globalThis.location?.search ?? '')) {
  serial++
  const face = node('div', 'bait-card selected-card')
  Object.assign(face.dataset, selectedCardStyle)
  face.dataset.clue = clueStyles.includes(style) ? style : 'rail'
  face.setAttribute('role', 'group')
  face.setAttribute('aria-roledescription', 'card')
  face.setAttribute('aria-label', `${card.word.toUpperCase()}, ${card.difficulty}`)
  const field = glass()
  const back = node('span', 'selected-card__back')
  back.setAttribute('aria-hidden', 'true')
  back.append(logo('black'))
  const top = node('span', 'card-top')
  const number = node('span', '', String(card.index + 1).padStart(2, '0'))
  number.append(node('small', '', `/ ${total}`))
  const pips = node('span', 'card-pips')
  pips.setAttribute('aria-hidden', 'true')
  const level = { easy: 1, medium: 2, hard: 3 }[card.difficulty]
  for (let index = 0; index < 3; index++) pips.append(node('i', index < level ? 'is-filled' : ''))
  top.append(number, pips)
  const art = node('span', 'card-art')
  const image = node('img')
  Object.assign(image, { alt: '', width: 640, height: 640, decoding: 'async', draggable: false })
  image.dataset.src = previewArt(card.art)
  const canvas = node('canvas', 'selected-card__pixels')
  canvas.setAttribute('aria-hidden', 'true')
  image.addEventListener('load', () => {
    pixelateSelectedCard(face.closest('.deck-card-item'))
    revealSelectedCard(face.closest('.deck-card-item'))
  })
  const square = node('span', 'selected-card__square')
  square.append(image, canvas)
  // A mouse moving over the picture of a card that shows its face leaves a trail of blocks.
  square.addEventListener('pointermove', (event) => {
    const item = face.closest('.deck-card-item')
    if (event.pointerType !== 'mouse' || !item) return
    if (item.classList.contains('is-front') || item.classList.contains('is-ribbon-face')) trailSelectedCard(item, event)
  })
  square.addEventListener('pointerleave', () => {
    const trail = trails.get(art)
    if (trail) trail.last = null
  })
  art.append(field, square)
  const plate = node('div', 'selected-card__plate')
  const word = node('span', `card-word card-word--${card.word}${card.word.length > 10 ? ' card-word--long' : ''}`, card.word.toUpperCase())
  const forbidden = restrictions(card, face.dataset.clue)
  const footer = node('span', 'card-footer')
  const signature = node('span', 'selected-card__signature', 'BAITED')
  signature.setAttribute('role', 'img')
  signature.setAttribute('aria-label', 'BAITED')
  footer.append(signature)
  plate.append(word, forbidden, node('span', 'card-question', card.question), footer)
  const shade = node('span', 'card-shade')
  shade.setAttribute('aria-hidden', 'true')
  face.append(back, top, art, plate, shade)
  return face
}

let settled = null
const played = new WeakSet()
let frame = 0
let cleanup = () => {}
// The picture's pixels, after 1minus1.com's case-study cards: the art as blocks of its own colors
// (each block the average of its patch), coarse blocks splitting into finer ones at random moments
// until the finest clear to the picture, so blocks of every size are on the card at once.
// - Waiting: a picture shows as its coarsest blocks until its card's reveal.
// - Reveal: those blocks split, split again and clear.
// - Trail: a mouse moving over the picture turns the squares it passes into blocks (below).
export const pixelSizes = [8, 16, 32] // blocks across the art, coarse to fine
export const revealSplit = 120 // ms the most each block waits before it splits…
export const revealClear = 160 // …and the most a finest block waits before it clears
export const revealEnd = (pixelSizes.length - 1) * revealSplit + revealClear
// The trail, after 1minus1.com's work cards: the squares near the pointer turn into blocks of their
// own colour, TRAIL_SIZE across the picture, and each clears again on its own a moment after the
// pointer has gone, so the trail breaks up behind it.
export const TRAIL_SIZE = 16
export const TRAIL_REACH = 1.6 // blocks from the pointer to a block's middle
export const TRAIL_HOLD = [380, 950] // ms a block stays after the pointer was last near it
// For every level, when each block shows and when it splits (or, at the finest level, clears):
// [start, end] in ms. The coarsest blocks are there from the start; a finer block appears when its
// parent splits.
export function pixelPlan({ sizes = pixelSizes, split = revealSplit, clear = revealClear, random = Math.random } = {}) {
  const plan = []
  sizes.forEach((size, level) => {
    const blocks = []
    const parentSize = sizes[level - 1]
    for (let i = 0; i < size * size; i++) {
      let start = 0
      if (level) {
        const ratio = size / parentSize
        const parent = Math.floor(Math.floor(i / size) / ratio) * parentSize + Math.floor((i % size) / ratio)
        start = plan[level - 1][parent][1]
      }
      blocks.push([start, start + random() * (level === sizes.length - 1 ? clear : split)])
    }
    plan.push(blocks)
  })
  return plan
}
// The picture has to be under the blocks by the time the first of the finest clears.
export const swapTime = (plan) => Math.min(...plan.at(-1).map(([, end]) => end))
// The average color of every block at every level, from the picture.
function pixelColors(image, sizes, scratch) {
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return sizes.map((size) => {
    scratch.width = scratch.height = size
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(image, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    return Array.from({ length: size * size }, (_, i) => `rgb(${data[i * 4]} ${data[i * 4 + 1]} ${data[i * 4 + 2]} / ${(data[i * 4 + 3] / 255).toFixed(3)})`)
  })
}
// The coarsest blocks alone, one canvas pixel each: how a picture waits for its reveal.
function drawCoarsest(canvas, image) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const [size] = pixelSizes
  let colors
  try {
    ;[colors] = pixelColors(image, [size], document.createElement('canvas'))
  } catch {
    return false
  }
  canvas.width = canvas.height = size
  colors.forEach((color, i) => {
    ctx.fillStyle = color
    ctx.fillRect(i % size, Math.floor(i / size), 1, 1)
  })
  return true
}
// Draws the blocks showing at time `t` on a canvas as wide as the finest level.
function drawPixels(ctx, plan, colors, sizes, t) {
  const side = sizes.at(-1)
  ctx.clearRect(0, 0, side, side)
  sizes.forEach((size, level) => {
    const cell = side / size
    plan[level].forEach(([start, end], i) => {
      if (t < start || t >= end) return
      ctx.fillStyle = colors[level][i]
      ctx.fillRect((i % size) * cell, Math.floor(i / size) * cell, cell, cell)
    })
  })
}
// The blocks of a size × size grid whose middles lie within `reach` of a point (in blocks).
export function trailCells([x, y], size = TRAIL_SIZE, reach = TRAIL_REACH) {
  const cells = []
  for (let row = Math.max(0, Math.floor(y - reach)); row <= Math.min(size - 1, Math.floor(y + reach)); row++)
    for (let column = Math.max(0, Math.floor(x - reach)); column <= Math.min(size - 1, Math.floor(x + reach)); column++)
      if (Math.hypot(column + 0.5 - x, row + 0.5 - y) <= reach) cells.push(row * size + column)
  return cells
}
// The blocks the pointer passes from one point to the next, half a block at a time, so a quick
// stroke leaves no gaps in its trail.
export function trailPath(from, to, size = TRAIL_SIZE, reach = TRAIL_REACH) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.5))
  const cells = new Set()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    for (const cell of trailCells([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], size, reach)) cells.add(cell)
  }
  return [...cells]
}
const trails = new WeakMap()
// While a trail shows, the canvas carries the whole picture with the blocks in place of its
// squares, and the picture itself hides: the art has see-through parts, which a block laid over
// the picture would let it show through.
function paintTrail(canvas, image, trail, now) {
  const ctx = canvas.getContext('2d')
  const side = image.naturalWidth
  if (canvas.width !== side || canvas.height !== side) canvas.width = canvas.height = side
  ctx.clearRect(0, 0, side, side)
  ctx.drawImage(image, 0, 0, side, side)
  const cell = side / TRAIL_SIZE
  trail.until.forEach((until, i) => {
    if (until <= now) return
    const [x, y] = [(i % TRAIL_SIZE) * cell, Math.floor(i / TRAIL_SIZE) * cell]
    ctx.clearRect(x, y, cell, cell)
    ctx.fillStyle = trail.colors[i]
    ctx.fillRect(x, y, cell, cell)
  })
}
// A mouse moving over a card's picture (the trail above).
export function trailSelectedCard(item, event) {
  const art = item?.querySelector('.card-art')
  const image = art?.querySelector('img')
  const canvas = art?.querySelector('.selected-card__pixels')
  const hand = item.closest('.deck-hand')
  if (!art || !canvas?.getContext('2d') || !image?.complete || !image.naturalWidth) return false
  // A picture that waits for its reveal shows anyway in the spread deck (ribbon.css), so it leaves
  // a trail there like the rest.
  const waiting = art.classList.contains('is-pixelated') && !hand?.classList.contains('is-ribbon-open')
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || art.classList.contains('is-resolving') || waiting || hand?.classList.contains('is-dragging')) return false
  let trail = trails.get(art)
  if (!trail || trail.source !== image.currentSrc) {
    let colors
    try {
      ;[colors] = pixelColors(image, [TRAIL_SIZE], document.createElement('canvas'))
    } catch {
      return false
    }
    trail = { source: image.currentSrc, colors, until: new Float64Array(TRAIL_SIZE * TRAIL_SIZE), shown: '', last: null, frame: 0 }
    trails.set(art, trail)
  }
  // Where the pointer is on the picture, which sits 4px inside its square (selected-cards.css). The
  // offset is in the square's own space, however the card is turned.
  const side = event.currentTarget.clientWidth - 8
  if (side <= 0) return false
  const point = [((event.offsetX - 4) / side) * TRAIL_SIZE, ((event.offsetY - 4) / side) * TRAIL_SIZE]
  const now = performance.now()
  for (const cell of trailPath(trail.last ?? point, point)) trail.until[cell] = now + TRAIL_HOLD[0] + Math.random() * (TRAIL_HOLD[1] - TRAIL_HOLD[0])
  trail.last = point
  if (trail.frame) return true
  const step = (time) => {
    if (art.classList.contains('is-resolving') || !image.complete || !image.naturalWidth) return stopTrail(art)
    // Painted again only when a block has come or gone.
    let shown = ''
    trail.until.forEach((until, i) => {
      if (until > time) shown += `${i},`
    })
    if (!shown) return stopTrail(art)
    if (shown !== trail.shown) {
      trail.shown = shown
      paintTrail(canvas, image, trail, time)
    }
    trail.frame = requestAnimationFrame(step)
  }
  paintTrail(canvas, image, trail, now)
  art.classList.add('is-trailing')
  trail.frame = requestAnimationFrame(step)
  return true
}
function stopTrail(art) {
  const trail = trails.get(art)
  if (!trail) return
  cancelAnimationFrame(trail.frame)
  Object.assign(trail, { frame: 0, shown: '', last: null })
  trail.until.fill(0)
  art.classList.remove('is-trailing')
  // Back in the deck a waiting picture shows its canvas, which holds its coarsest blocks.
  const canvas = art.querySelector('.selected-card__pixels')
  const image = art.querySelector('img')
  if (art.classList.contains('is-pixelated') && canvas && image?.complete) drawCoarsest(canvas, image)
}
// Until a card's picture has been revealed it shows as its coarsest blocks, so the picture is there
// from the start, in pixels, and comes clear out of them.
export function pixelateSelectedCard(item) {
  if (!item || played.has(item) || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const art = item.querySelector('.card-art')
  const image = art?.querySelector('img')
  const canvas = art?.querySelector('.selected-card__pixels')
  if (!canvas || !image?.complete || !image.naturalWidth) return
  if (drawCoarsest(canvas, image)) art.classList.add('is-pixelated')
}
export function pauseSelectedReveal() {
  settled = null
  cleanup()
}
export function settleSelectedCard(item) {
  cleanup()
  settled = item
  revealSelectedCard(item)
}
export function revealSelectedCard(item) {
  if (!item || item !== settled || !item.classList.contains('is-front')) return
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const image = item.querySelector('.card-art img')
  const canvas = item.querySelector('.selected-card__pixels')
  if (!item.closest('.deck-hand')?.classList.contains('is-live') || document.hidden || reduced.matches) { cleanup(); return }
  if (played.has(item) || !image?.complete || !image.naturalWidth || !canvas) return
  const drawing = canvas.getContext('2d')
  if (!drawing) return
  const art = image.closest('.card-art')
  stopTrail(art)
  const plan = pixelPlan()
  const swap = swapTime(plan)
  let started = null
  const stop = () => {
    cancelAnimationFrame(frame)
    art.classList.remove('is-resolving', 'is-pixelated', 'is-swapped')
    reduced.removeEventListener('change', stop)
    document.removeEventListener('visibilitychange', stop)
  }
  cleanup = stop
  played.add(item)
  let colors
  try {
    colors = pixelColors(image, pixelSizes, document.createElement('canvas'))
  } catch {
    return stop()
  }
  canvas.width = canvas.height = pixelSizes.at(-1)
  // Resizing cleared the waiting blocks: put them back before this frame is painted.
  drawPixels(drawing, plan, colors, pixelSizes, 0)
  const tick = now => {
    if (item !== settled || document.hidden || reduced.matches || !item.classList.contains('is-front')) return stop()
    if (started === null) started = now
    const elapsed = now - started
    if (elapsed >= revealEnd) return stop()
    drawPixels(drawing, plan, colors, pixelSizes, elapsed)
    art.classList.add('is-resolving')
    if (elapsed >= swap) art.classList.add('is-swapped')
    frame = requestAnimationFrame(tick)
  }
  reduced.addEventListener('change', stop)
  document.addEventListener('visibilitychange', stop)
  frame = requestAnimationFrame(tick)
}

export function prepareSelectedScenes(cards) {
  const old = document.querySelector('.why-deal__face')
  const volcano = cards.find(card => card.word === 'volcano')
  if (old && volcano) {
    const face = cardFace(volcano, cards.length)
    face.classList.add('why-deal__face')
    // Only the gallery controller fades this dimmer; the How scene owns its flip.
    face.querySelector('.card-shade').remove()
    const image = face.querySelector('.card-art img')
    image.loading = 'lazy'
    image.src = image.dataset.src
    old.replaceWith(face)
  }
  for (const back of document.querySelectorAll('.why-deal__back, .why-stream__back')) back.classList.add('selected-prism')
}
