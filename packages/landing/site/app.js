import { cards } from './data.js'
import { createDeck, wrapIndex, wrapOffset } from './deck.js'
import { initWhyStack } from './why-stack.js'
import { initWhyScenes } from './why-scenes.js'
import { initFooter } from './footer.js'
import { initAnchorNavigation, initNav } from './nav.js'
import { karaoke, typeIn } from './reveal.js'

initNav()
initAnchorNavigation()

// How it plays: the step cards stack up as the page scrolls, and the scene inside each card
// plays when its card arrives. Without the stack the scenes keep their final picture.
const whySection = document.querySelector('.why-vtg')
const scenes = whySection ? initWhyScenes(whySection, { gsap: window.gsap }) : null
if (!initWhyStack({ onMode: scenes?.mode, onFront: scenes?.front, onReveal: scenes?.reveal })) scenes?.mode('still')

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const phone = matchMedia('(max-width: 700px)')
const $ = (id) => document.getElementById(id)

// Headings type in as they arrive and the How it plays lead lights up with the scroll (reveal.js).
// The hero's headline waits for the pixel curtain to start clearing.
const { gsap, ScrollTrigger } = window
if (gsap && ScrollTrigger && !reduced.matches) {
  gsap.registerPlugin(ScrollTrigger)
  typeIn($('hero-title'), gsap, { delay: document.querySelector('.pixel-curtain') ? 0.3 : 0.05 })
  typeIn($('how-title'), gsap, { scrollTrigger: { trigger: '#how-title', start: 'top 85%', once: true } })
  typeIn($('deck-title'), gsap, { scrollTrigger: { trigger: '#deck-title', start: 'top 85%', once: true } })
  karaoke([...document.querySelectorAll('.why-vtg__lead, .why-vtg__payoff')], gsap, {
    trigger: '.why-vtg__intro',
    start: 'top 80%',
    end: 'top 15%',
  })
}

// Leave the tab and its title asks you to keep the secret; come back and it is the page again.
const pageTitle = document.title
document.addEventListener('visibilitychange', () => {
  document.title = document.hidden ? 'Don’t say it. · baited' : pageTitle
})
console.log(
  '%c baited %c Chat holds the cards. Streamer takes the bait. Made by irchiinnuss.',
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
  signature.src = '/assets/brand/baited-logo-white.webp'
  signature.alt = 'BAITED'
  signature.width = 764
  signature.height = 225
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

// The footer rises over the deck with a pixelated edge; set up after the deck exists so it can pin it.
initFooter({ gsap: window.gsap, ScrollTrigger: window.ScrollTrigger })
