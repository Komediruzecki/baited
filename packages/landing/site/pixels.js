// The pixel curtain, after the owner's reference. A page arrives behind a screen of violet squares
// that disappear one by one in random order; following a link to another page of the site first
// fills the screen with squares, then loads it. pixel-boot.js covers the very first paint so the
// page never flashes before the curtain. Reduced motion: no curtain, links behave as usual.
// No GSAP needed: each square is a CSS transition with its own random delay.

export const CLEAR_SPREAD = 0.75 // seconds over which the squares disappear
export const CLEAR_FADE = 0.1 // seconds each square takes to fade
export const COVER_SPREAD = 0.5 // seconds over which the squares appear before the next page loads
export const CLEARED_EVENT = 'pixels:cleared' // on document, once the arrival curtain has gone

// Big squares: eight across a desktop screen, six on a tablet, four on a phone.
export const pixelColumns = (width) => (width >= 992 ? 8 : width >= 576 ? 6 : 4)

export function curtainSize(width, height) {
  const columns = pixelColumns(width)
  const cell = width / columns
  return { columns, rows: Math.ceil(height / cell), cell }
}

// Only a plain click on a link to another page of this site gets the curtain. Hash links scroll
// the same page; new tabs, downloads, mail links and other sites are left to the browser.
export function leavesForPage({ href, here, target = '', download = false, optOut = false, modified = false }) {
  if (modified || download || optOut || (target && target !== '_self')) return false
  let next
  let current
  try {
    next = new URL(href, here)
    current = new URL(here)
  } catch {
    return false
  }
  if (next.origin !== current.origin || !/^https?:$/.test(next.protocol)) return false
  return next.pathname !== current.pathname || next.search !== current.search
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const frame = (callback) => requestAnimationFrame(() => requestAnimationFrame(callback))

function curtain(state, spread) {
  const { columns, rows, cell } = curtainSize(window.innerWidth, window.innerHeight)
  const element = document.createElement('div')
  element.className = `pixel-curtain ${state}`
  element.setAttribute('aria-hidden', 'true')
  element.style.setProperty('--pixel-cols', columns)
  element.style.setProperty('--pixel-cell', `${cell}px`)
  const fragment = document.createDocumentFragment()
  for (let i = 0; i < columns * rows; i++) {
    const square = document.createElement('i')
    square.style.setProperty('--pixel-delay', `${(Math.random() * spread).toFixed(3)}s`)
    fragment.append(square)
  }
  element.append(fragment)
  document.body.append(element)
  return element
}

// The page arrives: swap the solid first-paint cover for squares, then let them go.
function clear() {
  const root = document.documentElement
  if (!root.classList.contains('pixel-boot')) return
  const element = curtain('', CLEAR_SPREAD)
  root.classList.remove('pixel-boot')
  frame(() => element.classList.add('is-clearing'))
  setTimeout(() => {
    element.remove()
    document.dispatchEvent(new Event(CLEARED_EVENT))
  }, (CLEAR_SPREAD + CLEAR_FADE + 0.1) * 1000)
}

// Leaving: the squares pop in at random, and the next page loads once the screen is full.
function cover(href) {
  const element = curtain('is-covering', COVER_SPREAD)
  frame(() => element.classList.add('is-full'))
  setTimeout(() => window.location.assign(href), (COVER_SPREAD + 0.06) * 1000)
}

export function initPixels() {
  // The squares start to go only once the page's own scripts have set it up: they all run before
  // DOMContentLoaded. Clearing as soon as this script ran showed the page for a moment, or on a slow
  // load for a second or more, in the layout it has before them (the home page's film in the hero's
  // column instead of its tilted card). If they take too long, pixels.css fades the cover anyway.
  if (document.readyState === 'complete') clear()
  else document.addEventListener('DOMContentLoaded', clear, { once: true })
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || reduced()) return
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (
      !link ||
      !leavesForPage({
        href: link.href,
        here: window.location.href,
        target: link.target,
        download: link.hasAttribute('download'),
        optOut: link.dataset.pixels === 'off',
        modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
      })
    )
      return
    event.preventDefault()
    cover(link.href)
  })
  // Coming back through the browser's history restores the page as it was left: clear the cover.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return
    document.documentElement.classList.remove('pixel-boot')
    document.querySelectorAll('.pixel-curtain').forEach((element) => element.remove())
  })
}

if (typeof document !== 'undefined') initPixels()
