import { cards, checkHint } from './data.js'
import { initLandingMotion } from './motion.js'
import { createFan } from './deck.js'
import { initBrand } from './brand.js'

initBrand()

const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const phone = matchMedia('(max-width: 700px)')
const $ = (id) => document.getElementById(id)
const NS = 'http://www.w3.org/2000/svg'

function node(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}
function icon(name, className = 'icon') {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS(NS, 'use')
  use.setAttribute('href', `#${name}`)
  svg.append(use)
  return svg
}
function cardFace(card, interactive = false) {
  const face = node(interactive ? 'button' : 'article', 'bait-card')
  if (interactive) {
    face.type = 'button'
    face.setAttribute('aria-label', `${card.word.toUpperCase()}, ${card.difficulty}. Inspect this card.`)
  } else face.setAttribute('aria-label', `${card.word.toUpperCase()} practice card`)
  const top = node('span', 'card-top')
  const number = node('span', '', String(card.index + 1).padStart(2, '0'))
  number.append(node('small', '', '/ 18'))
  const pips = node('span', 'card-pips')
  pips.setAttribute('aria-label', card.difficulty)
  const level = { easy: 1, medium: 2, hard: 3 }[card.difficulty]
  for (let n = 0; n < 3; n++) pips.append(node('i', n < level ? 'is-filled' : ''))
  top.append(number, pips, icon('bait-hook', 'card-hook'))
  const art = node('span', 'card-art')
  const image = document.createElement('img')
  image.width = image.height = 1254
  image.alt = ''
  image.draggable = false
  image.decoding = 'async'
  image.loading = 'lazy'
  image.dataset.src = card.art
  if (!interactive) image.src = card.art
  art.append(image)
  const word = node('span', 'card-word', card.word.toUpperCase())
  const clues = node('span', 'card-clues')
  clues.setAttribute('aria-label', card.clues.length ? 'Off-limits clues' : 'No off-limits clues')
  for (const clue of card.clues) {
    const chip = node('span', '', clue.toUpperCase())
    chip.dataset.clue = clue
    if (interactive) {
      const strike = node('i', 'clue-strike')
      strike.setAttribute('aria-hidden', 'true')
      chip.append(strike)
    }
    clues.append(chip)
  }
  if (!card.clues.length) clues.append(node('span', 'no-clues', 'Easy: only the word itself is off limits.'))
  const footer = node('span', 'card-footer')
  footer.append(node('b', '', 'bait'), document.createTextNode(' them.'))
  face.append(top, art, word, clues, node('span', 'card-question', card.question), footer)
  if (interactive) {
    const shade = node('span', 'card-shade')
    shade.setAttribute('aria-hidden', 'true')
    face.append(shade)
  }
  return face
}

const hand = $('deck-hand')
const list = $('deck-cards')
const deckItems = cards.map((card) => {
  const item = node('li', 'deck-card-item')
  const button = cardFace(card, true)
  button.tabIndex = -1
  item.append(button)
  list.append(item)
  return item
})
let current = 0
let auto = !reduced.matches
let inView = false
let hovered = false
let deckHasFocus = false
let windowActive = true
let drag = null
let suppressClickUntil = 0
let advanceTimer
let deckApproached = false
let navigation = 0
let navigationTarget = 0
let preparing = false
let pendingInspection = false
let captionAnimation
let strikeAnimations = []
const artPromises = new WeakMap()
const deckSection = $('cards')
const wrap = (number) => ((number % cards.length) + cards.length) % cards.length
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const relativeIndex = (index, position = current) => {
  let diff = wrap(index - position)
  if (diff > cards.length / 2) diff -= cards.length
  return diff
}
function stopFaceAnimations() {
  captionAnimation?.cancel()
  strikeAnimations.forEach((animation) => animation.cancel())
  strikeAnimations = []
}
const fan = createFan({
  items: deckItems,
  reduced,
  phone,
  onFront(index) {
    const initial = !$('deck-word').dataset.ready
    current = index
    const card = cards[index]
    $('deck-count').textContent = `${String(index + 1).padStart(2, '0')} / ${cards.length}`
    $('deck-word').textContent = card.word.toUpperCase()
    $('deck-word').dataset.ready = 'true'
    $('deck-difficulty').textContent = card.clues.length
      ? `${card.difficulty.toUpperCase()} · OFF LIMITS: ${card.clues.join(', ').toUpperCase()}`
      : 'EASY · ONLY THE WORD ITSELF IS OFF LIMITS'
    $('deck-question').textContent = `Try: “${card.question}”`
    captionAnimation?.cancel()
    if (!initial && !reduced.matches) {
      captionAnimation = document.querySelector('.deck-caption > div').animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: 160,
        easing: 'ease-out',
      })
    }
    syncInspectionLabels()
    if (deckApproached) warmFan(index)
  },
  onSettle(index, { deliberate, repeated }) {
    if (!preparing) navigationTarget = fan.target
    syncInspectionLabels()
    if (deliberate)
      $('deck-status').textContent = `${cards[index].word.toUpperCase()}, ${cards[index].difficulty}. Card ${index + 1} of ${cards.length}.`
    strikeAnimations.forEach((animation) => animation.cancel())
    strikeAnimations = []
    if (deliberate && !repeated && !reduced.matches) {
      strikeAnimations = [...deckItems[index].querySelectorAll('.clue-strike')].map((line, i) =>
        line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
          duration: 180,
          delay: i * 40,
          easing: 'cubic-bezier(.25,1,.5,1)',
          fill: 'backwards',
        })
      )
    }
    scheduleAdvance()
  },
})
function ensureArt(item) {
  const image = item.querySelector('img')
  if (artPromises.has(image)) return artPromises.get(image)
  image.loading = 'eager'
  image.src = image.dataset.src
  const ready = image
    .decode()
    .catch(() => {
      if (image.complete && image.naturalWidth > 0) return
      const art = image.parentElement
      art.classList.add('is-unavailable')
      art.append(node('span', 'art-unavailable', 'Artwork unavailable'))
    })
    .then(() => {
      image.dataset.ready = 'true'
      fan.refresh()
      scheduleAdvance()
    })
  artPromises.set(image, ready)
  return ready
}
function warmFan(position = current) {
  return Promise.all(deckItems.flatMap((item, index) => (Math.abs(relativeIndex(index, position)) <= 3 ? [ensureArt(item)] : [])))
}
function setAuto(active) {
  auto = active
  $('deck-auto').setAttribute('aria-pressed', String(auto))
  $('deck-auto').querySelector('span').textContent = auto ? 'Pause gallery' : 'Play gallery'
  $('deck-auto-icon').setAttribute('href', auto ? '#i-pause' : '#i-play')
  scheduleAdvance()
}
function scheduleAdvance() {
  clearTimeout(advanceTimer)
  if (
    !auto ||
    !inView ||
    hovered ||
    deckHasFocus ||
    fan.inspected ||
    document.hidden ||
    !windowActive ||
    drag ||
    fan.moving ||
    preparing ||
    !deckItems[current].querySelector('img').dataset.ready
  )
    return
  // A complete dwell begins only after the hand has settled and is unattended.
  advanceTimer = setTimeout(() => moveTo(fan.target + 1), reduced.matches ? 6000 : 5600)
}
function syncInspectionLabels() {
  deckItems.forEach((item, i) => {
    const inspected = i === current && (fan.inspected || pendingInspection)
    item.firstElementChild.setAttribute(
      'aria-label',
      `${cards[i].word.toUpperCase()}, ${cards[i].difficulty}. ${inspected ? 'Put this card back.' : 'Inspect this card.'}`
    )
  })
}
function resetInspection() {
  fan.inspect(false)
  syncInspectionLabels()
}
function beginMove(target, manual, duration) {
  const request = ++navigation
  navigationTarget = target
  preparing = true
  scheduleAdvance()
  const start = () => {
    if (request !== navigation) return
    preparing = false
    const focusedCard = deckItems.findIndex((item) => item.contains(document.activeElement))
    if (focusedCard !== -1 && focusedCard !== wrap(target)) hand.focus({ preventScroll: true })
    fan.to(target, duration, manual)
    if (pendingInspection) {
      pendingInspection = false
      fan.inspect(true)
      syncInspectionLabels()
    }
  }
  const ready = deckItems.every((item, index) => Math.abs(relativeIndex(index, target)) > 3 || item.querySelector('img').dataset.ready)
  if (ready) start()
  else warmFan(target).then(start)
}
function moveTo(target, manual = false, duration = 420) {
  if (drag) cancelActiveDrag()
  deckApproached = true
  pendingInspection = false
  stopFaceAnimations()
  resetInspection()
  if (manual) {
    setAuto(false)
    if (list.contains(document.activeElement)) hand.focus({ preventScroll: true })
  }
  // Every navigation path, including drag release, waits for decoded artwork.
  beginMove(target, manual, duration)
}
function stepCard(delta, manual = true) {
  moveTo(clamp(navigationTarget + delta, Math.round(fan.position) - 3, Math.round(fan.position) + 3), manual)
}
function inspectCard(active = !(fan.inspected || pendingInspection)) {
  if (active) setAuto(false)
  if (preparing) pendingInspection = active
  else fan.inspect(active)
  syncInspectionLabels()
  scheduleAdvance()
}
deckItems.forEach((item, index) =>
  item.firstElementChild.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil) return
    if (index === current) inspectCard()
    else moveTo(Math.round(fan.position) + relativeIndex(index, Math.round(fan.position)), true)
  })
)
$('deck-prev').addEventListener('click', () => stepCard(-1))
$('deck-next').addEventListener('click', () => stepCard(1))
$('deck-auto').addEventListener('click', () => {
  if (!auto && (fan.inspected || pendingInspection)) inspectCard(false)
  setAuto(!auto)
})
hand.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    stepCard(event.key === 'ArrowLeft' ? -1 : 1)
    hand.focus({ preventScroll: true })
  } else if ((event.key === 'Enter' || event.key === ' ') && event.target === hand) {
    event.preventDefault()
    inspectCard()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    inspectCard(false)
    hand.focus({ preventScroll: true })
  }
})
deckSection.addEventListener('pointerenter', (event) => {
  if (event.pointerType !== 'touch') {
    hovered = true
    scheduleAdvance()
  }
})
deckSection.addEventListener('pointerleave', () => {
  hovered = false
  fan.tilt(0, 0)
  scheduleAdvance()
})
deckSection.addEventListener('focusin', () => {
  deckHasFocus = true
  scheduleAdvance()
})
deckSection.addEventListener('focusout', (event) => {
  if (!deckSection.contains(event.relatedTarget)) {
    deckHasFocus = false
    scheduleAdvance()
  }
})
hand.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary || drag) return
  ++navigation
  preparing = false
  const frozen = fan.freeze()
  drag = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    position: frozen.position,
    target: navigationTarget,
    slot: 1.1 * deckItems[current].offsetWidth,
    samples: [{ x: event.clientX, time: performance.now() }],
    active: false,
  }
  scheduleAdvance()
})
hand.addEventListener('pointermove', (event) => {
  if (drag && drag.id === event.pointerId) {
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      finishDrag(event.pointerId, { cancelled: true, suppressClick: true })
      return
    }
    if (!drag.active && Math.abs(dx) > 10) {
      drag.active = true
      try {
        hand.setPointerCapture(event.pointerId)
      } catch {
        finishDrag(event.pointerId, { cancelled: true })
        return
      }
      setAuto(false)
      resetInspection()
      if (list.contains(document.activeElement)) hand.focus({ preventScroll: true })
    }
    if (!drag) return
    const now = performance.now()
    drag.x = event.clientX
    drag.samples.push({ x: event.clientX, time: now })
    drag.samples = drag.samples.filter((point) => now - point.time <= 80)
    if (drag.active) {
      event.preventDefault()
      fan.drag(drag.position - clamp(dx / drag.slot, -3, 3))
    }
  } else if (fan.inspected && event.pointerType === 'mouse' && !reduced.matches) {
    const item = deckItems[current]
    const bounds = item.getBoundingClientRect()
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1)
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1)
    fan.tilt(-y * 8, x * 8)
    item.style.setProperty('--shine-x', `${(x + 1) * 50}%`)
    item.style.setProperty('--shine-y', `${(y + 1) * 50}%`)
  }
})
function finishDrag(pointerId, { cancelled = false, clientX, suppressClick = false } = {}) {
  if (!drag || drag.id !== pointerId) return
  const previous = drag
  drag = null
  if (hand.hasPointerCapture(pointerId)) hand.releasePointerCapture(pointerId)
  if (previous.active || suppressClick) suppressClickUntil = performance.now() + 250
  let target = previous.target
  if (previous.active && !cancelled) {
    const dx = (Number.isFinite(clientX) ? clientX : previous.x) - previous.startX
    const last = previous.samples.at(-1)
    const first = previous.samples[0]
    const velocity = performance.now() - last.time <= 80 && last.time > first.time ? (last.x - first.x) / (last.time - first.time) : 0
    const slots = -(dx + 160 * velocity) / previous.slot
    let count = Math.round(slots)
    if (count === 0 && Math.abs(slots) >= 0.12) count = Math.sign(slots)
    target = Math.round(previous.position) + clamp(count, -3, 3)
  }
  const duration = Math.min(720, 280 + 140 * Math.abs(target - fan.position))
  // Ready cards resume synchronously; slow artwork keeps the frozen hand in place.
  navigationTarget = target
  if (previous.active || Math.abs(target - fan.position) > 0.001) beginMove(target, previous.active && !cancelled, duration)
  else fan.refresh()
  scheduleAdvance()
}
function cancelActiveDrag() {
  if (drag) finishDrag(drag.id, { cancelled: true })
  else scheduleAdvance()
}
window.addEventListener('pointerup', (event) => finishDrag(event.pointerId, { clientX: event.clientX }), true)
window.addEventListener('pointercancel', (event) => finishDrag(event.pointerId, { cancelled: true }), true)
hand.addEventListener('lostpointercapture', (event) => {
  if (event.target === hand && !hand.hasPointerCapture(event.pointerId)) finishDrag(event.pointerId, { cancelled: true })
})
window.addEventListener('blur', () => {
  windowActive = false
  cancelActiveDrag()
})
window.addEventListener('focus', () => {
  windowActive = true
  scheduleAdvance()
})
window.addEventListener('pagehide', cancelActiveDrag)
new IntersectionObserver(
  (entries) => {
    inView = entries[0].isIntersecting && entries[0].intersectionRatio >= 0.6
    scheduleAdvance()
  },
  { threshold: [0, 0.6, 1] }
).observe(hand)
const deckApproachObserver = new IntersectionObserver(
  (entries) => {
    if (!entries[0].isIntersecting) return
    deckApproached = true
    warmFan()
    deckApproachObserver.disconnect()
  },
  { rootMargin: '800px 0px' }
)
deckApproachObserver.observe(hand)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelActiveDrag()
  else scheduleAdvance()
})
phone.addEventListener('change', () => {
  cancelActiveDrag()
  fan.refresh()
})
reduced.addEventListener('change', () => {
  if (reduced.matches) {
    setAuto(false)
    cancelActiveDrag()
    stopFaceAnimations()
    fan.finish()
  }
  fan.refresh()
})
fan.refresh()
setAuto(auto)

let toyCard = cards[0]
let dealTimer
function showCard(card, move = false) {
  toyCard = card
  const slot = $('toy-card')
  slot.replaceChildren(cardFace(card))
  slot.classList.remove('is-dealt')
  if (!reduced.matches) requestAnimationFrame(() => slot.classList.add('is-dealt'))
  $('toy-for').textContent = `${card.word.toUpperCase()} · ${card.difficulty.toUpperCase()}`
  $('hint-input').value = ''
  $('hint-counter').textContent = '0 / 200'
  $('hint-feedback').textContent = card.difficulty === 'easy' ? 'Easy: only the word itself is off limits.' : ''
  $('hint-feedback').removeAttribute('data-kind')
  $('hint-log').replaceChildren()
  const empty = node('p', 'log-empty', 'Waiting for your first hint…')
  empty.id = 'log-empty'
  const dots = node('span', 'waiting-dots')
  dots.setAttribute('aria-hidden', 'true')
  for (let i = 0; i < 3; i++) dots.append(node('i'))
  empty.prepend(dots)
  $('hint-log').append(empty)
  if (move) {
    $('your-turn').scrollIntoView({
      behavior: reduced.matches ? 'instant' : 'smooth',
      block: 'start',
    })
    clearTimeout(dealTimer)
    dealTimer = setTimeout(() => $('hint-input').focus({ preventScroll: true }), reduced.matches ? 0 : 550)
  }
}
function randomCard() {
  const pool = cards.filter((card) => card.difficulty !== 'easy' && card !== toyCard)
  const random = new Uint32Array(1)
  crypto.getRandomValues(random)
  return pool[random[0] % pool.length]
}
function feedback() {
  const input = $('hint-input')
  const result = checkHint(input.value, toyCard)
  $('hint-counter').textContent = `${input.value.length} / 200`
  $('hint-feedback').textContent = input.value.trim() && result.kind !== 'clean' ? result.message : ''
  $('hint-feedback').dataset.kind = result.kind
  document
    .querySelectorAll('#toy-card [data-clue]')
    .forEach((chip) => chip.classList.toggle('is-violation', result.clue === chip.dataset.clue))
  return result
}
$('hint-input').addEventListener('input', feedback)
$('hint-form').addEventListener('submit', (event) => {
  event.preventDefault()
  const text = $('hint-input').value.trim()
  if (!text) {
    $('hint-input').focus()
    return
  }
  const result = checkHint($('hint-input').value, toyCard)
  $('hint-feedback').textContent = result.message
  $('hint-feedback').dataset.kind = result.kind
  if (result.kind === 'long') return
  $('log-empty')?.remove()
  const line = node('p', `hint-entry${result.kind === 'clean' ? ' is-clean' : ''}`)
  line.append(node('strong', '', 'you'), node('span', 'hint-text', text))
  if (result.kind === 'clean') line.append(icon('bait-hook', 'hint-mark'))
  else line.append(node('small', '', "Not eligible for the streamer's pick."))
  $('hint-log').append(line)
  while ($('hint-log').children.length > 12) $('hint-log').firstElementChild.remove()
  $('hint-log').scrollTop = $('hint-log').scrollHeight
  $('hint-input').value = ''
  $('hint-counter').textContent = '0 / 200'
  $('hint-input').focus()
})
$('borrow-question').addEventListener('click', () => {
  $('hint-input').value = toyCard.question
  feedback()
  $('hint-input').focus()
})
$('deal-another').addEventListener('click', () => {
  showCard(randomCard())
  $('hint-input').focus({ preventScroll: true })
})
$('bait-with-card').addEventListener('click', () => showCard(cards[current], true))
$('deal-first').addEventListener('click', (event) => {
  event.preventDefault()
  showCard(randomCard(), true)
})
showCard(cards[0])

initLandingMotion({ reduced })
