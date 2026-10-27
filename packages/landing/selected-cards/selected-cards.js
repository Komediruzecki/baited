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
  Object.assign(mark, { src: `/assets/brand/baited-logo-${ink}.webp`, alt: 'BAITED', width: 764, height: 225, draggable: false, decoding: 'async' })
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
  image.addEventListener('load', () => revealSelectedCard(face.closest('.deck-card-item')))
  const square = node('span', 'selected-card__square')
  square.append(image, canvas)
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
  let started = null
  let previous = -1
  const steps = [8, 12, 20, 32, 56, 96, 160]
  const stop = () => {
    cancelAnimationFrame(frame)
    art.classList.remove('is-resolving')
    reduced.removeEventListener('change', stop)
    document.removeEventListener('visibilitychange', stop)
  }
  cleanup = stop
  played.add(item)
  const tick = now => {
    if (item !== settled || document.hidden || reduced.matches || !item.classList.contains('is-front')) return stop()
    if (started === null) started = now
    const elapsed = now - started
    if (elapsed >= 630) return stop()
    const index = Math.min(steps.length - 1, Math.floor(elapsed / 90))
    if (index !== previous) {
      canvas.width = steps[index]
      canvas.height = Math.max(1, Math.round(canvas.width * image.naturalHeight / image.naturalWidth))
      drawing.imageSmoothingEnabled = false
      try { drawing.clearRect(0, 0, canvas.width, canvas.height); drawing.drawImage(image, 0, 0, canvas.width, canvas.height) } catch { return stop() }
      previous = index
      art.classList.add('is-resolving')
    }
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
