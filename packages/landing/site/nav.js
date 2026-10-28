// The navigation, after monochrome-studio.com's header: a white bar centred at the top with the
// logo, the section links and the chat button. While the visitor keeps scrolling down it folds to
// the logo and the chat button, and it opens again as soon as they scroll up, reach the top, or
// move keyboard focus into it. When the footer fills the top of the screen the bar steps away: the
// footer has its own contact button, pages and way back to the top.
// The styles are in styles.css (.site-nav); without JavaScript the bar simply stays open.

import { PIXEL_LOGO_COLS, PIXEL_LOGO_ROWS, pixelLogoCells } from './pixel-logo.js'
import { scrollPageTo } from './smooth-scroll.js'

export const FLOAT_AT = 80 // px scrolled before the bar becomes a pill
export const FOLD_AT = 320 // px scrolled before scrolling down folds it
export const AWAY_AT = 72 // the bar steps away once the footer's top is this close to the top

// The next state of the bar for a new scroll position. A few pixels of jitter change nothing.
export function navState({ y, lastY, folded }) {
  const floating = y > FLOAT_AT
  if (!floating || y < FOLD_AT) return { floating, folded: false }
  if (y > lastY + 4) return { floating, folded: true }
  if (y < lastY - 4) return { floating, folded: false }
  return { floating, folded }
}

export const navAway = (footerTop) => footerTop <= AWAY_AT

// Smooth only deliberate navigation. Global CSS smoothing also animates the browser's reload
// restoration and ScrollTrigger's measurement scrolls, leaving fragment links at the wrong place.
// Where Lenis eases the wheel (smooth-scroll.js) it eases these trips too.
export function initAnchorNavigation() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.target.closest('a[href^="#"]')
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
    const hash = link.getAttribute('href')
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    event.preventDefault()
    if (location.hash !== hash) history.pushState(history.state, '', hash)
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1')
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
    }
    target.focus({ preventScroll: true })
    scrollPageTo(target, { smooth: !matchMedia('(prefers-reduced-motion: reduce)').matches })
  })
}

// The logo's hover fill: square pixels that each light up at their own random moment.
export const LOGO_COLUMNS = 10
export const LOGO_ROWS = 4
function logoPixels(nav) {
  const grid = nav.querySelector('.nav-logo__pixels')
  if (!grid || grid.childElementCount) return
  grid.style.setProperty('--logo-cols', LOGO_COLUMNS)
  for (let i = 0; i < LOGO_COLUMNS * LOGO_ROWS; i++) {
    const pixel = document.createElement('i')
    pixel.style.setProperty('--d', `${(0.03 + Math.random() * 0.35).toFixed(3)}s`)
    grid.append(pixel)
  }
}

// A link's word turns into its icon on hover: the word breaks into 2px pixels in its own color,
// the pixels fly to the icon's pixels and turn white as the violet square fades in under them, and
// the pixels the icon does not need fade away. Leaving plays the same timeline backwards from
// wherever it is. Without JavaScript the CSS hover in styles.css scales the word and the icon.
export const MORPH_PX = 2
export const MORPH_STAGGER = 220 // ms over which the pixels set off…
export const MORPH_TRAVEL = 340 // …and how long each one flies
export const MORPH_TOTAL = MORPH_STAGGER + MORPH_TRAVEL + 60
const MORPH_SQUARE = [180, 420] // the square fades in over this window

// Pairs every icon pixel with a word pixel, both read left to right, so the word folds into the
// icon without pixels crossing; returns the index of each icon pixel's word pixel.
export function morphPairs(wordCount, iconCount) {
  return Array.from({ length: iconCount }, (_, i) => Math.min(wordCount - 1, Math.floor(((i + 0.5) * wordCount) / iconCount)))
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp01 = (t) => Math.min(1, Math.max(0, t))
const mix = (a, b, t) => a + (b - a) * t
const rgb = (color) => color.match(/[\d.]+/g).slice(0, 3).map(Number)

function linkMorph(link) {
  const text = link.querySelector('.nav-link__text')
  const svg = link.querySelector('.nav-link__icon svg')
  if (!text || !svg) return
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  canvas.className = 'nav-link__morph'
  canvas.setAttribute('aria-hidden', 'true')
  link.append(canvas)
  link.classList.add('has-morph')
  const ctx = canvas.getContext('2d')
  let scene = null
  let time = 0
  let direction = 0
  let last = 0
  let frame = 0

  // Where the word's pixels and the icon's pixels sit, in CSS px inside the link.
  const build = () => {
    const box = link.getBoundingClientRect()
    const dpr = devicePixelRatio
    canvas.width = Math.round(box.width * dpr)
    canvas.height = Math.round(box.height * dpr)
    canvas.style.width = `${box.width}px`
    canvas.style.height = `${box.height}px`
    const style = getComputedStyle(text)
    const span = text.getBoundingClientRect()
    const word = document.createElement('canvas')
    word.width = Math.ceil(box.width)
    word.height = Math.ceil(box.height)
    const w = word.getContext('2d', { willReadFrequently: true })
    w.font = style.font
    const metrics = w.measureText(text.textContent)
    const ascent = metrics.fontBoundingBoxAscent
    const descent = metrics.fontBoundingBoxDescent
    w.fillText(text.textContent, span.left - box.left, span.top - box.top + (span.height - ascent - descent) / 2 + ascent)
    const alpha = w.getImageData(0, 0, word.width, word.height).data
    const from = []
    for (let x = 0; x + MORPH_PX <= word.width; x += MORPH_PX) {
      for (let y = 0; y + MORPH_PX <= word.height; y += MORPH_PX) {
        const cx = x + MORPH_PX / 2
        const cy = y + MORPH_PX / 2
        if (alpha[(Math.floor(cy) * word.width + Math.floor(cx)) * 4 + 3] > 100) from.push([x, y])
      }
    }
    const { width: vw, height: vh } = svg.viewBox.baseVal
    const left = Math.round((box.width - vw * MORPH_PX) / 2)
    const top = Math.round((box.height - vh * MORPH_PX) / 2)
    const to = [...svg.querySelectorAll('rect')]
      .map((rect) => [left + rect.x.baseVal.value * MORPH_PX, top + rect.y.baseVal.value * MORPH_PX])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    if (!from.length) return null
    const pairs = morphPairs(from.length, to.length)
    const used = new Set(pairs)
    const cell = getComputedStyle(link.querySelector('.nav-link__icon'))
    return {
      dpr,
      ink: rgb(style.color),
      size: parseFloat(cell.width),
      flights: to.map((end, i) => ({ start: from[pairs[i]], end, delay: Math.random() * MORPH_STAGGER })),
      leftovers: from.filter((_, i) => !used.has(i)).map((start) => ({ start, delay: Math.random() * MORPH_STAGGER })),
      width: box.width,
      height: box.height,
    }
  }

  const draw = () => {
    const { dpr, ink, flights, leftovers, size, width, height } = scene
    const px = (v) => Math.round(v * dpr)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const square = clamp01((time - MORPH_SQUARE[0]) / (MORPH_SQUARE[1] - MORPH_SQUARE[0]))
    if (square > 0) {
      ctx.globalAlpha = square
      ctx.fillStyle = INK_COLOR
      ctx.beginPath()
      ctx.roundRect(px((width - size) / 2), px((height - size) / 2), px(size), px(size), 4 * dpr)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    const dot = Math.max(1, Math.round(MORPH_PX * dpr))
    for (const { start, delay } of leftovers) {
      const t = clamp01((time - delay) / (MORPH_TRAVEL / 2))
      if (t >= 1) continue
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = `rgb(${ink})`
      ctx.fillRect(px(start[0]), px(start[1]), dot, dot)
    }
    ctx.globalAlpha = 1
    for (const { start, end, delay } of flights) {
      const t = ease(clamp01((time - delay) / MORPH_TRAVEL))
      const c = ink.map((v) => Math.round(mix(v, 255, t)))
      ctx.fillStyle = `rgb(${c})`
      ctx.fillRect(px(mix(start[0], end[0], t)), px(mix(start[1], end[1], t)), dot, dot)
    }
  }

  const tick = (now) => {
    time = clamp01((time + direction * (now - last)) / MORPH_TOTAL) * MORPH_TOTAL
    last = now
    draw()
    const done = direction > 0 ? time >= MORPH_TOTAL : time <= 0
    if (done && time <= 0) {
      link.classList.remove('is-morphing')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    frame = done ? 0 : requestAnimationFrame(tick)
  }
  const play = (to) => {
    if (to > 0 && time <= 0) scene = build()
    if (!scene) return
    direction = to
    link.classList.add('is-morphing')
    if (still.matches) {
      time = to > 0 ? MORPH_TOTAL : 0
      return tick(performance.now())
    }
    last = performance.now()
    if (!frame) frame = requestAnimationFrame(tick)
  }
  link.addEventListener('mouseenter', () => play(1))
  link.addEventListener('mouseleave', () => play(-1))
}

function linkMorphs(nav) {
  if (!matchMedia('(hover: hover)').matches || matchMedia('(forced-colors: active)').matches) return
  for (const link of nav.querySelectorAll('.nav-link')) linkMorph(link)
}

// The pixel logo (pixel-logo.js) redrawn on a canvas over its image, so hovering can play a wave
// through it: one column after another hops up a pixel and lands, left to right on the way in and
// right to left on the way out, while the cell fills with lavender pixels behind it (styles.css).
// The letters keep their violet. At rest it holds still.
export const INK_COLOR = '#7721e5'
export const WAVE_STEP = 12 // ms from one column's hop to the next…
export const WAVE_HOP = 150 // …and how long each column stays up

// How far up (in logo pixels) column `x` is, `t` ms into a wave that runs `forward` or back.
export function waveLift(x, t, forward = true) {
  const start = (forward ? x : PIXEL_LOGO_COLS - 1 - x) * WAVE_STEP
  return t >= start && t < start + WAVE_HOP ? 1 : 0
}
const WAVE_TOTAL = (PIXEL_LOGO_COLS - 1) * WAVE_STEP + WAVE_HOP

function logoInk(nav) {
  const link = nav.querySelector('.nav-logo')
  const img = link?.querySelector('img')
  if (!img || !matchMedia('(hover: hover)').matches || matchMedia('(forced-colors: active)').matches) return
  const still = matchMedia('(prefers-reduced-motion: reduce)')
  const canvas = document.createElement('canvas')
  canvas.className = 'nav-logo__ink'
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  const cells = pixelLogoCells()
  let height = 0
  let forward = true
  let start = -Infinity
  let frame = 0

  // The canvas has one spare row on top for the hop.
  const draw = (now) => {
    const t = now - start
    const cell = canvas.width / PIXEL_LOGO_COLS
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = INK_COLOR
    for (const index of cells) {
      const x = index % PIXEL_LOGO_COLS
      const y = Math.floor(index / PIXEL_LOGO_COLS) + 1 - waveLift(x, t, forward)
      ctx.fillRect(x * cell, y * cell, cell, cell)
    }
    return t < WAVE_TOTAL
  }
  const tick = (now) => {
    frame = draw(now) ? requestAnimationFrame(tick) : 0
  }
  const wave = (direction) => {
    if (still.matches) return
    cancelAnimationFrame(frame)
    forward = direction
    start = performance.now()
    frame = requestAnimationFrame(tick)
  }
  // Whole device pixels per logo pixel, so the squares stay sharp at the image's height.
  const size = () => {
    const next = img.getBoundingClientRect().height
    if (!next || next === height) return
    height = next
    const cell = Math.max(1, Math.round((height / PIXEL_LOGO_ROWS) * devicePixelRatio))
    canvas.width = PIXEL_LOGO_COLS * cell
    canvas.height = (PIXEL_LOGO_ROWS + 1) * cell
    canvas.style.width = `${canvas.width / devicePixelRatio}px`
    canvas.style.height = `${canvas.height / devicePixelRatio}px`
    canvas.style.marginTop = `${-cell / devicePixelRatio / 2}px` // keep the letters where the image is
    if (!frame) draw(Infinity)
  }

  img.after(canvas)
  link.classList.add('has-ink')
  size()
  new ResizeObserver(size).observe(img)
  link.addEventListener('mouseenter', () => wave(true))
  link.addEventListener('mouseleave', () => wave(false))
}

export function initNav(nav = document.querySelector('.site-nav'), footer = document.querySelector('.site-footer')) {
  if (!nav) return
  logoPixels(nav)
  logoInk(nav)
  linkMorphs(nav)
  let state = { floating: false, folded: false }
  let away = false
  let lastY = window.scrollY
  let queued = false
  const apply = () => {
    nav.classList.toggle('is-floating', state.floating)
    nav.classList.toggle('is-folded', state.folded)
    nav.classList.toggle('is-away', away)
  }
  const update = () => {
    queued = false
    const y = window.scrollY
    const nextAway = footer ? navAway(footer.getBoundingClientRect().top) : false
    if (Math.abs(y - lastY) < 4 && state.floating === y > FLOAT_AT && nextAway === away) return
    away = nextAway
    state = navState({ y, lastY, folded: state.folded })
    lastY = y
    apply()
  }
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }
  window.addEventListener('scroll', queue, { passive: true })
  window.addEventListener('resize', queue, { passive: true })
  nav.addEventListener('focusin', () => {
    state = { ...state, folded: false }
    apply()
  })
  state = navState({ y: lastY, lastY, folded: false })
  away = footer ? navAway(footer.getBoundingClientRect().top) : false
  apply()
}
