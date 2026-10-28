import { cards } from './data.js'
import { createDeck, wrapIndex, wrapOffset } from './deck.js'
import { initWhyStack } from './why-stack.js'
import { initWhyScenes } from './why-scenes.js'
import { initFooter } from './footer.js'
import { initShowreel } from './showreel.js'
import { initHeroScribble } from './hero-scribble.js'
import { initAnchorNavigation, initNav } from './nav.js'
import { markerReveal } from './reveal.js'
import { initSmoothScroll, scrollPageTo } from './smooth-scroll.js'

// GSAP 3.15 loses the scroll position when a breakpoint change re-runs a gsap.matchMedia() context
// (why-stack.js at 840px wide and in short landscape, footer.js): the triggers the context makes
// again clear the position its refresh would put back, so turning a phone or a tablet, or resizing a
// window across 840px, sent the page to the top. Put the page back where it was and measure again.
function keepScrollThroughBreakpoints(ScrollTrigger) {
  let before = 0
  // A revert comes first in every refresh, and first when a breakpoint changes, while the page is
  // still where the visitor left it.
  ScrollTrigger.addEventListener('revert', () => {
    before = window.scrollY
  })
  ScrollTrigger.addEventListener('matchMedia', () => {
    if (Math.abs(window.scrollY - before) < 1) return
    scrollPageTo(before, { smooth: false })
    ScrollTrigger.refresh()
  })
}

// Smooth wheel scrolling (smooth-scroll.js) comes first: the scrubbed scenes below follow it as it is.
initSmoothScroll({ gsap: window.gsap, ScrollTrigger: window.ScrollTrigger })
initNav()
initAnchorNavigation()
if (window.ScrollTrigger) keepScrollThroughBreakpoints(window.ScrollTrigger)
// The film flies from the hero into the showreel (showreel.js); set up before the sections below
// measure their scroll positions, since it adds the showreel to the page.
initShowreel({ gsap: window.gsap, ScrollTrigger: window.ScrollTrigger })
initHeroScribble({ gsap: window.gsap, ScrollTrigger: window.ScrollTrigger })

// How it plays: the step cards stack up as the page scrolls, and the scene inside each card
// plays when its card arrives. Without the stack the scenes keep their final picture.
const whySection = document.querySelector('.why-vtg')
const scenes = whySection ? initWhyScenes(whySection, { gsap: window.gsap }) : null
if (!initWhyStack({ onMode: scenes?.mode, onFront: scenes?.front, onReveal: scenes?.reveal })) scenes?.mode('still')

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const phone = matchMedia('(max-width: 700px)')
const $ = (id) => document.getElementById(id)

// The headings below the hero and the lines under them come out from under highlighter bars, line
// by line, as they arrive (reveal.js), all in the brand violet. The hero's own text is simply there.
// "The cards" are set up once the deck has put its own controls in its help (below).
const { gsap, ScrollTrigger } = window
const reveals = gsap && ScrollTrigger && !reduced.matches ? { gsap, ScrollTrigger } : null
if (reveals) {
  gsap.registerPlugin(ScrollTrigger)
  markerReveal([$('how-title')], reveals, { scrollTrigger: { trigger: '#how-title', start: 'top 85%' } })
  markerReveal([...document.querySelectorAll('.why-vtg__lead, .why-vtg__payoff')], reveals, { scrollTrigger: { trigger: '.why-vtg__lead', start: 'top 80%' } })
}

// Leave the tab and its title asks you to keep the secret; come back and it is the page again.
const pageTitle = document.title
document.addEventListener('visibilitychange', () => {
  document.title = document.hidden ? 'Don’t say it. · baited' : pageTitle
})
console.log(
  '%c baited %c One secret word. Your whole chat against you. Made by irchiinnuss.',
  'background:#7721e5;color:#fff;font:700 15px/2 sans-serif;padding:0 8px;border-radius:4px',
  'color:#9146ff;font:600 12px sans-serif'
)

function node(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

// One card face. The artwork loads when the deck comes near the screen.
// The secret word takes its item's color (card-word--<word> in styles.css); the level shows as
// one to three dots. Off-limits clues stay readable beneath the word.
function cardFace(card) {
  const face = node('div', 'bait-card')
  face.setAttribute('role', 'group')
  face.setAttribute('aria-roledescription', 'card')
  face.setAttribute('aria-label', `${card.word.toUpperCase()}, ${card.difficulty}`)
  const top = node('span', 'card-top')
  const number = node('span', '', String(card.index + 1).padStart(2, '0'))
  number.append(node('small', '', `/ ${cards.length}`))
  const pips = node('span', 'card-pips')
  pips.setAttribute('aria-hidden', 'true')
  const level = { easy: 1, medium: 2, hard: 3 }[card.difficulty]
  for (let n = 0; n < 3; n++) pips.append(node('i', n < level ? 'is-filled' : ''))
  top.append(number, pips)
  const art = node('span', 'card-art')
  const image = document.createElement('img')
  image.width = image.height = 1254
  image.alt = ''
  image.draggable = false
  image.decoding = 'async'
  image.dataset.src = card.art
  art.append(image)
  const word = node('span', `card-word card-word--${card.word}`, card.word.toUpperCase())
  if (card.word.length > 10) word.classList.add('card-word--long')
  const forbidden = node('span', 'card-forbidden')
  const clues = node('span', 'card-clues')
  for (const clue of card.clues) clues.append(node('span', '', clue.toUpperCase()))
  if (!card.clues.length) clues.append(node('span', 'no-clues', 'Only the word itself'))
  forbidden.append(node('span', 'card-forbidden__label', 'Keep out of chat'), clues)
  const footer = node('span', 'card-footer')
  const signature = document.createElement('img')
  signature.src = '/assets/brand/baited-pixel-white.svg'
  signature.alt = 'BAITED'
  signature.width = 370
  signature.height = 100
  signature.draggable = false
  signature.decoding = 'async'
  footer.append(signature)
  const shade = node('span', 'card-shade')
  shade.setAttribute('aria-hidden', 'true')
  face.append(top, art, word, forbidden, node('span', 'card-question', card.question), footer, shade)
  return face
}

const hand = $('deck-hand')
const list = $('deck-cards')
const items = cards.map((card) => {
  const item = node('li', 'deck-card-item')
  item.append(cardFace(card))
  list.append(item)
  return item
})

// Artwork is large, so only the cards around the front one load, starting when the deck is close.
let deckNear = false
function warmArt(around) {
  if (!deckNear) return
  items.forEach((item, index) => {
    if (Math.abs(wrapOffset(index, around, items.length)) > 3) return
    const image = item.querySelector('img')
    if (!image.getAttribute('src')) image.src = image.dataset.src
  })
}

const deck = createDeck({
  hand,
  items,
  gsap: window.gsap,
  reduced,
  onFront(index, { deliberate } = {}) {
    // Browsing the deck is enough to load its art, even if its proximity observer is delayed.
    if (deliberate) deckNear = true
    warmArt(index)
  },
  onSettle(index, { deliberate } = {}) {
    if (deliberate)
      $('deck-status').textContent = `${cards[index].word.toUpperCase()}, ${cards[index].difficulty}. Card ${index + 1} of ${cards.length}.`
  },
})

hand.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  if (event.key === 'ArrowLeft') deck.previous()
  else deck.next()
})

// Pointer: horizontal drags move the fan and a release flicks to the next card.
// A mostly vertical gesture is left to the page so it can scroll.
let drag = null
let suppressClickUntil = 0
hand.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || drag) return
  drag = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    from: deck.hold(),
    unit: deck.dragUnit(),
    samples: [{ x: event.clientX, time: performance.now() }],
    active: false,
  }
})
hand.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY
  if (!drag.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      endDrag(event, true)
      return
    }
    if (Math.abs(dx) < 6) return
    drag.active = true
    hand.classList.add('is-dragging')
    try {
      hand.setPointerCapture(event.pointerId)
    } catch {
      /* The drag still works without capture while the pointer stays on the deck. */
    }
  }
  event.preventDefault()
  const now = performance.now()
  drag.samples.push({ x: event.clientX, time: now })
  drag.samples = drag.samples.filter((sample) => now - sample.time <= 100)
  deck.drag(drag.from - dx / drag.unit)
})
function endDrag(event, cancelled = false) {
  if (!drag || drag.id !== event.pointerId) return
  const ended = drag
  drag = null
  hand.classList.remove('is-dragging')
  if (hand.hasPointerCapture?.(event.pointerId)) hand.releasePointerCapture(event.pointerId)
  if (!ended.active) {
    // A press without a drag only paused the fan; let it finish where it was going.
    deck.to(deck.target)
    return
  }
  suppressClickUntil = performance.now() + 250
  const first = ended.samples[0]
  const last = ended.samples.at(-1)
  const seconds = (last.time - first.time) / 1000
  const pxPerSecond = seconds > 0 && performance.now() - last.time < 100 ? (last.x - first.x) / seconds : 0
  deck.release(ended.from, cancelled ? 0 : -pxPerSecond / ended.unit)
}
hand.addEventListener('pointerup', (event) => endDrag(event))
hand.addEventListener('pointercancel', (event) => endDrag(event, true))
hand.addEventListener('lostpointercapture', (event) => endDrag(event))

// Clicking a card at the side brings it to the front.
items.forEach((item, index) =>
  item.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil || item.classList.contains('is-front')) return
    deck.to(Math.round(deck.target + wrapOffset(index, deck.target, items.length)), { deliberate: true })
  })
)

new IntersectionObserver(
  (entries, observer) => {
    if (!entries[0].isIntersecting) return
    deckNear = true
    warmArt(wrapIndex(deck.target, items.length))
    observer.disconnect()
  },
  { rootMargin: '800px 0px' }
).observe(hand)

// The front card's foil glint plays only once the deck is actually on screen.
new IntersectionObserver((entries) => hand.classList.toggle('is-live', entries[0].isIntersecting), { threshold: 0.35 }).observe(hand)

phone.addEventListener('change', () => deck.refresh())
window.addEventListener('resize', () => deck.refresh(), { passive: true })
reduced.addEventListener('change', () => deck.finish())

// "The cards": its title, the line under it, then the deck's help ("Pull wide or spread the deck"),
// each as it comes up.
if (reveals) {
  markerReveal([$('deck-title')], reveals, { scrollTrigger: { trigger: '#deck-title', start: 'top 85%' } })
  markerReveal([document.querySelector('.how-cards__intro > p')], reveals, { scrollTrigger: { trigger: '.how-cards__intro > p', start: 'top 85%' } })
  markerReveal([$('deck-help')], reveals, { scrollTrigger: { trigger: '#deck-help', start: 'top 90%' }, also: '.ribbon-toggle' })
}

// The footer rises over the deck with a pixelated edge; set up after the deck exists so it can pin it.
initFooter({ gsap: window.gsap, ScrollTrigger: window.ScrollTrigger })
