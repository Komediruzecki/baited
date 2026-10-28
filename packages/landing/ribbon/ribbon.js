import { ribbonPose, blendPose, qualifiesSpread, rowSpacing, visibleCardFraction } from './ribbon-geometry.js'
import { createRibbonEffects } from './ribbon-effects.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const wrap = (value, count) => ((value % count) + count) % count
const offset = (index, position, count) => wrap(index - position + count / 2, count) - count / 2
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
const easeOut = t => 1 - (1 - t) ** 3
const easeInOut = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

// The original deck remains the sole writer of card transforms. This controller
// lends it a pose, then hands back an exact integer position when the row folds.
// The open row never moves by itself: it follows a drag, coasts after a throw and
// settles on the nearest card ('paused' is that resting state).
export function createRibbonDeck({ createDeck, cards, status, help, pauseReveal, settleReveal, warmArt, ...options }) {
  const { hand, items, reduced } = options
  const state = { p: 0, t: 0 }
  let inner
  let open = false
  let destroyed = false
  let mode = 'fan'
  let gesture = null
  let anchor = 0
  let lens = 0
  let velocity = 0
  let tMotion = null
  let pMotion = null
  let frame = 0
  let lastTime = null
  let visibilityFrame = 0
  let openingTimer = 0
  let warmed = null
  let aborting = false
  let inset = 0 // screen px at each side of the deck that its sheet leaves uncovered
  const cleanups = []
  const originalHelp = [...help.childNodes]

  const listen = (target, type, listener, settings) => {
    target.addEventListener(type, listener, settings)
    cleanups.push(() => target.removeEventListener(type, listener, settings))
  }
  const button = (className, text) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = className
    element.textContent = text
    return element
  }
  const prefix = document.createElement('span')
  prefix.className = 'ribbon-help-prefix'
  prefix.textContent = 'Pull wide or '
  const toggle = button('ribbon-toggle', 'spread the deck')
  toggle.setAttribute('aria-controls', hand.id)
  toggle.setAttribute('aria-expanded', 'false')
  help.replaceChildren(prefix, toggle)

  // The row runs to the edges of its sheet, which stops short of the screen by its gap (styles.css),
  // and is cut off there (ribbon.css).
  function measureInset() {
    const sheet = hand.closest?.('.cards-anchor')
    inset = sheet && typeof getComputedStyle === 'function' ? Math.round(parseFloat(getComputedStyle(sheet).getPropertyValue('--sheet-gap')) || 0) : 0
  }
  const rowMetrics = metrics => ({ ...metrics, inset: inset / (metrics.zoom || 1) })

  function syncControls() {
    toggle.textContent = open ? 'Back to the deck' : 'spread the deck'
    toggle.setAttribute('aria-expanded', String(open))
    prefix.hidden = open
    hand.dataset.ribbonMode = mode
  }
  function stopFrame() {
    cancelAnimationFrame(frame)
    frame = 0
    lastTime = null
  }
  function clearTimers() {
    clearTimeout(openingTimer)
    cancelAnimationFrame(visibilityFrame)
    openingTimer = visibilityFrame = 0
  }
  function abortInput() {
    gesture = null
    clearTimeout(openingTimer)
    openingTimer = 0
    aborting = true
    hand.dispatchEvent(new Event('ribboncancelinput'))
    aborting = false
  }
  function announce(index) {
    const at = wrap(Math.round(index), items.length)
    status.textContent = `${cards[at].word.toUpperCase()}, ${cards[at].difficulty}. Card ${at + 1} of ${cards.length}.`
  }
  function warm(metrics) {
    const whole = Math.round(state.p)
    if (whole === warmed) return
    warmed = whole
    const side = Math.min(6, Math.ceil(metrics.room / (2 * rowSpacing(rowMetrics(metrics)))))
    warmArt?.(whole, side + 1, side + 2)
  }
  function renderFaces({ position, metrics, visibleIndices }) {
    if (!open) { warmArt?.(Math.round(position)); return }
    if (Math.abs(position - lens) > .58) lens = Math.round(position)
    const visible = new Set(visibleIndices)
    const row = rowMetrics(metrics)
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const d = offset(index, position, items.length)
      const fixedFace = index === wrap(anchor, items.length) || index === wrap(lens, items.length)
      const turn = fixedFace ? 1 : smooth((state.t - .22 - .06 * Math.min(Math.abs(d), 5)) / .3)
      const face = visible.has(index) && turn >= .5
      item.classList.toggle('is-ribbon-face', face)
      item.classList.toggle('is-ribbon-lens', face && index === wrap(lens, items.length))
      if (!visible.has(index)) continue
      item.style.setProperty('--ribbon-flip', Math.max(.04, Math.abs(Math.cos(Math.PI * turn))).toFixed(4))
      // Each card turns to face the middle of the curve as the row opens (ribbon-geometry.js).
      item.style.setProperty('--ribbon-turn', `${(ribbonPose(d, row).turn * state.t).toFixed(2)}deg`)
    }
    warm(metrics)
  }
  inner = createDeck({
    ...options,
    onSettle(index, details) { if (!open) options.onSettle?.(index, details) },
    presentation: {
      pose(d, metrics, original) { return open ? blendPose(original, ribbonPose(d, rowMetrics(metrics)), state.t) : original },
      onRender: renderFaces,
    },
  })

  // Speed glitch and momentum hover while the row is open (ribbon-effects.js).
  const effects = createRibbonEffects({ hand, items, reduced })
  function draw() {
    if (!open || destroyed) return
    inner.drag(state.p)
    effects.move(state.p)
  }
  function needsFrame() {
    return open && !document.hidden && (tMotion || pMotion || mode === 'coast')
  }
  function requestFrame() {
    if (!frame && needsFrame()) {
      if (lastTime === null) lastTime = performance.now()
      frame = requestAnimationFrame(tick)
    }
  }
  function tick(now) {
    frame = 0
    if (destroyed || document.hidden || !open) return
    let dt = Math.max(0, now - (lastTime ?? now)) / 1000
    lastTime = now
    if (tMotion) {
      const motion = tMotion
      const progress = clamp((now - motion.start) / motion.duration, 0, 1)
      state.t = motion.from + (motion.to - motion.from) * (motion.to ? easeOut(progress) : easeInOut(progress))
      if (progress === 1) {
        tMotion = null
        hand.classList.remove('is-ribbon-changing')
        if (!motion.to) return landInFan()
        // Only the part of this frame after unfolding belongs to a throw's coast.
        dt = Math.min(dt, Math.max(0, now - motion.start - motion.duration) / 1000)
        if (gesture) mode = 'grab'
        else if (Math.abs(velocity) > .05) mode = 'coast'
        else {
          mode = 'paused'
          if (!Number.isInteger(state.p)) glide(Math.round(state.p), false, 320)
        }
        syncControls()
      }
      if (!motion.to) state.p = motion.pFrom + (motion.pTo - motion.pFrom) * easeInOut(progress)
    }
    if (pMotion) {
      const motion = pMotion
      const progress = clamp((now - motion.start) / motion.duration, 0, 1)
      const ease = progress === 1 ? 1 : 1 - 2 ** (-10 * progress)
      state.p = motion.from + (motion.to - motion.from) * ease
      if (progress === 1) {
        pMotion = null
        mode = 'paused'
        inner.snap(state.p)
        if (motion.announce) announce(state.p)
        syncControls()
      }
    } else if (!gesture && !tMotion && mode === 'coast') {
      // A thrown row slows down and settles on the card nearest where it stops.
      const duration = .42
      const decay = Math.exp(-dt / duration)
      // Integrating the decay keeps both distance and speed tied to elapsed
      // visible time, even when a busy frame takes longer than the usual 16ms.
      state.p += velocity * duration * (1 - decay)
      velocity *= decay
      if (Math.abs(velocity) < .05) glide(Math.round(state.p), false, 320)
    }
    draw()
    requestFrame()
    if (!frame) lastTime = null
  }
  function transition(to, milliseconds) {
    if (reduced.matches || !options.gsap) {
      state.t = to
      tMotion = null
      if (!to) return landInFan()
      mode = gesture ? 'grab' : 'paused'
      hand.classList.remove('is-ribbon-changing')
      draw()
      syncControls()
      return
    }
    tMotion = { from: state.t, to, start: performance.now(), duration: milliseconds * Math.max(.35, Math.abs(to - state.t)), pFrom: state.p, pTo: Math.round(state.p) }
    hand.classList.add('is-ribbon-changing')
    requestFrame()
  }
  function spread() {
    if (destroyed || open || document.hidden) return
    state.p = inner.suspend()
    state.t = 0
    anchor = lens = Math.round(state.p)
    warmed = null
    velocity = 0
    measureInset()
    open = true
    mode = 'unfolding'
    pauseReveal?.()
    effects.open()
    hand.classList.add('is-ribbon-open')
    syncControls()
    transition(1, 640)
  }
  function landInFan() {
    stopFrame()
    clearTimers()
    state.p = Math.round(state.p)
    state.t = 0
    open = false
    mode = 'fan'
    tMotion = pMotion = null
    effects.close()
    hand.classList.remove('is-ribbon-open', 'is-ribbon-changing')
    for (const item of items) {
      item.classList.remove('is-ribbon-face', 'is-ribbon-lens')
      item.style.removeProperty('--ribbon-flip')
      item.style.removeProperty('--ribbon-turn')
    }
    inner.snap(state.p, { deliberate: true })
    syncControls()
  }
  function gather({ instant = false } = {}) {
    if (!open) return
    if (mode === 'folding') {
      if (instant || document.hidden) { abortInput(); return landInFan() }
      return
    }
    abortInput()
    clearTimers()
    pMotion = null
    velocity = 0
    lens = Math.round(state.p)
    mode = 'folding'
    syncControls()
    if (instant || document.hidden) { state.t = 0; return landInFan() }
    transition(0, 560)
  }
  function glide(to, deliberate = true, duration = 420) {
    if (!open || mode === 'folding') return
    if (gesture) abortInput()
    velocity = 0
    mode = 'glide'
    const target = Math.round(to)
    if (reduced.matches || !options.gsap) {
      state.p = target
      inner.snap(target)
      mode = 'paused'
      if (deliberate) announce(target)
    } else {
      pMotion = { from: state.p, to: target, start: performance.now(), duration, announce: deliberate }
      requestFrame()
    }
    draw()
    syncControls()
  }
  // Stops a coasting row on the card nearest where it is.
  function pause() {
    if (!open || mode === 'paused' || mode === 'folding' || mode === 'unfolding' || pMotion) return
    glide(Math.round(state.p), false, 320)
  }
  function maybeOpen() {
    clearTimeout(openingTimer)
    openingTimer = 0
    if (!gesture || open || gesture.started === null) return
    const now = performance.now()
    const recent = gesture.samples.filter(sample => now - sample.time <= 100)
    const first = recent[0]
    const last = recent.at(-1)
    const speed = recent.length > 1 && last.time > first.time ? Math.abs(last.p - first.p) * gesture.unit * 1000 / (last.time - first.time) : 0
    if (qualifiesSpread({ distance: (gesture.from - gesture.last) * gesture.unit, heldMs: now - gesture.started, speed, metrics: inner.metrics, viewportWidth: window.innerWidth })) {
      spread()
      gesture.spreadInput = gesture.last
      gesture.spreadPosition = state.p
    } else openingTimer = setTimeout(maybeOpen, 120)
  }
  function hold() {
    const from = open ? state.p : inner.hold()
    gesture = { from, last: from, unit: inner.dragUnit(), started: null, samples: [], spreadInput: from, spreadPosition: from }
    if (open) {
      pMotion = null
      velocity = 0
      const reversing = mode === 'folding'
      if (reversing) tMotion = null
      mode = 'grab'
      if (reversing) transition(1, 640)
      syncControls()
    }
    return from
  }
  function drag(position) {
    if (!gesture) return
    const now = performance.now()
    if (gesture.started === null) gesture.started = now
    gesture.last = position
    gesture.samples.push({ p: position, time: now })
    gesture.samples = gesture.samples.filter(sample => now - sample.time <= 100)
    if (!open) {
      inner.drag(position)
      maybeOpen()
      return
    }
    const metrics = inner.metrics
    state.p = gesture.spreadPosition + (position - gesture.spreadInput) * gesture.unit / (rowSpacing(rowMetrics(metrics)) * metrics.zoom)
    draw()
  }
  function release(from, speed) {
    clearTimeout(openingTimer)
    openingTimer = 0
    const ended = gesture
    gesture = null
    if (!open) return inner.release(from, speed)
    if (mode === 'folding') return
    const metrics = inner.metrics
    velocity = clamp(speed * (ended?.unit ?? inner.dragUnit()) / (rowSpacing(rowMetrics(metrics)) * metrics.zoom), -6, 6)
    if (reduced.matches) return glide(Math.round(state.p), false, 320)
    if (tMotion) mode = 'unfolding'
    else if (Math.abs(velocity) > .05) mode = 'coast'
    else return glide(Math.round(state.p), false, 320)
    syncControls()
    requestFrame()
  }
  function cancel() {
    if (aborting) return
    gesture = null
    clearTimeout(openingTimer)
    openingTimer = 0
    // Native vertical scrolling cancels a touch pointer. Release the horizontal
    // interaction, but leave the spread available and its cards stationary.
    if (open) pause()
    else inner.to(inner.target)
  }
  function to(index, details = {}) {
    if (!open) { gesture = null; clearTimeout(openingTimer); return inner.to(index, details) }
    if (details.deliberate) return glide(index)
    // A click that did not become a drag still releases the catch.
    const from = gesture?.from ?? state.p
    release(from, 0)
  }
  function finish() {
    if (!open) return inner.finish()
    abortInput()
    stopFrame()
    tMotion = pMotion = null
    state.t = 1
    state.p = Math.round(state.p)
    velocity = 0
    mode = 'paused'
    hand.classList.remove('is-ribbon-changing')
    draw()
    syncControls()
  }

  listen(toggle, 'click', event => {
    if (open) gather()
    else { spread(); if (!event.detail) status.textContent = 'Deck spread out. Use the arrow keys to move along it and Escape to gather it.' }
  })
  listen(toggle, 'pointerdown', event => event.stopPropagation())
  const keydown = event => {
    if (!open) return
    if (event.key === 'Escape') { event.preventDefault(); gather() }
    else if (event.target.closest?.('#deck-help') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault()
      glide((pMotion?.to ?? Math.round(state.p)) + (event.key === 'ArrowLeft' ? -1 : 1))
    }
  }
  listen(hand, 'keydown', keydown)
  listen(help, 'keydown', keydown)
  listen(hand, 'click', event => {
    if (!open || gesture || hand.classList.contains('is-dragging')) return
    const item = event.target.closest?.('.deck-card-item')
    if (!item) return
    event.stopImmediatePropagation()
    // The native click after a drag belongs to the release, not to a card.
    if (performance.now() - lastRelease < 300) return
    const index = items.indexOf(item)
    const d = offset(index, state.p, items.length)
    if (Math.abs(d) < .6) gather()
    else glide(state.p + d)
  }, true)
  let lastRelease = -Infinity
  listen(hand, 'pointerup', () => { if (gesture?.started !== null && gesture) lastRelease = performance.now() }, true)
  listen(hand, 'focusin', () => { if (open && hand.matches(':focus-visible')) pause() })
  listen(help, 'focusin', event => { if (open && event.target.matches(':focus-visible')) pause() })
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) return
    if (open) gather({ instant: true })
    else {
      abortInput()
      inner.snap(Math.round(inner.suspend()))
      pauseReveal?.()
    }
  })
  const footer = document.querySelector('.site-footer')
  function checkVisibility() {
    visibilityFrame = 0
    if (!open || destroyed) return
    const viewport = window.visualViewport
    const top = viewport?.offsetTop ?? 0
    const bottom = top + (viewport?.height ?? window.innerHeight)
    const card = items[wrap(lens, items.length)].getBoundingClientRect()
    const coverTop = footer ? footer.getBoundingClientRect().top : bottom
    if (visibleCardFraction(card, { top, bottom, coverTop }) < .5) gather({ instant: true })
  }
  function queueVisibilityCheck() {
    if (!open || visibilityFrame || destroyed) return
    // At most one layout read per scroll frame; no scroll interception or
    // additional frame loop while the gallery is closed.
    visibilityFrame = requestAnimationFrame(checkVisibility)
  }
  listen(window, 'scroll', queueVisibilityCheck, { passive: true })
  listen(window, 'resize', queueVisibilityCheck, { passive: true })
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', queueVisibilityCheck, { passive: true })
    listen(window.visualViewport, 'scroll', queueVisibilityCheck, { passive: true })
  }
  const visibility = new IntersectionObserver(queueVisibilityCheck, { threshold: [0, .5, 1] })
  visibility.observe(hand)
  cleanups.push(() => visibility.disconnect())
  if (footer) {
    const footerVisibility = new IntersectionObserver(queueVisibilityCheck)
    footerVisibility.observe(footer)
    cleanups.push(() => footerVisibility.disconnect())
  }
  const api = {
    get position() { return open ? state.p : inner.position },
    get target() { return open ? (pMotion?.to ?? Math.round(state.p)) : inner.target },
    get front() { return inner.front },
    get moving() { return open ? !!frame : inner.moving },
    get mode() { return mode },
    get openness() { return state.t },
    get metrics() { return inner.metrics },
    hold, drag, release, cancel, to, finish, spread, gather, pause,
    next() { if (open) glide((pMotion?.to ?? Math.round(state.p)) + 1); else inner.next() },
    previous() { if (open) glide((pMotion?.to ?? Math.round(state.p)) - 1); else inner.previous() },
    dragUnit: () => inner.dragUnit(),
    refresh() {
      if (gesture && open) {
        abortInput()
        velocity = 0
        mode = 'paused'
      }
      warmed = null
      if (open) measureInset()
      inner.refresh()
      if (open) { draw(); syncControls(); queueVisibilityCheck() }
    },
    destroy() {
      if (destroyed) return
      if (open) gather({ instant: true })
      destroyed = true
      stopFrame()
      clearTimers()
      inner.suspend()
      effects.destroy()
      for (const cleanup of cleanups) cleanup()
      help.replaceChildren(...originalHelp)
      delete hand.dataset.ribbonMode
      if (window.__baitedSpread === api) delete window.__baitedSpread
    },
  }
  syncControls()
  if (new URLSearchParams(window.location.search).has('spread-debug')) window.__baitedSpread = api
  listen(window, 'pagehide', event => event.persisted ? gather({ instant: true }) : api.destroy())
  return api
}
