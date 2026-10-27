import { ribbonPose, blendPose, qualifiesSpread, visibleCardFraction } from './ribbon-geometry.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const wrap = (value, count) => ((value % count) + count) % count
const offset = (index, position, count) => wrap(index - position + count / 2, count) - count / 2
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
const easeOut = t => 1 - (1 - t) ** 3
const easeInOut = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

// The original deck remains the sole writer of card transforms. This controller
// lends it a pose, then hands back an exact integer position when the row folds.
export function createRibbonDeck({ createDeck, cards, status, help, pauseReveal, settleReveal, warmArt, ...options }) {
  const { hand, items, reduced } = options
  const state = { p: 0, t: 0 }
  let inner
  let open = false
  let destroyed = false
  let mode = 'fan'
  let userPaused = false
  let gesture = null
  let anchor = 0
  let lens = 0
  let velocity = 0
  let tMotion = null
  let pMotion = null
  let frame = 0
  let lastTime = null
  let idleTimer = 0
  let visibilityFrame = 0
  let openingTimer = 0
  let warmed = null
  let aborting = false
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
  const separator = document.createElement('span')
  separator.className = 'ribbon-help-separator'
  separator.textContent = ' · '
  const playButton = button('ribbon-play', 'Pause')
  help.replaceChildren(prefix, toggle, separator, playButton)

  function syncControls() {
    toggle.textContent = open ? 'Back to the deck' : 'spread the deck'
    toggle.setAttribute('aria-expanded', String(open))
    prefix.hidden = open
    const hidePlay = !open || reduced.matches
    if (hidePlay && document.activeElement === playButton) toggle.focus({ preventScroll: true })
    playButton.hidden = separator.hidden = hidePlay
    playButton.textContent = userPaused ? 'Play' : 'Pause'
    hand.dataset.ribbonMode = mode
  }
  function stopFrame() {
    cancelAnimationFrame(frame)
    frame = 0
    lastTime = null
  }
  function clearTimers() {
    clearTimeout(idleTimer)
    clearTimeout(openingTimer)
    cancelAnimationFrame(visibilityFrame)
    idleTimer = openingTimer = visibilityFrame = 0
  }
  function idle() {
    clearTimeout(idleTimer)
    if (open && !userPaused && !gesture) idleTimer = setTimeout(() => gather(), 8000)
  }
  function abortInput() {
    gesture = null
    clearTimeout(openingTimer)
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
    const pitch = .8 * metrics.width + (metrics.width <= 260 ? 12 : Math.round(metrics.width * .067))
    const side = Math.min(6, Math.ceil(metrics.room / (2 * pitch)))
    warmArt?.(whole, side + 1, side + 2)
  }
  function renderFaces({ position, metrics, visibleIndices }) {
    if (!open) { warmArt?.(Math.round(position)); return }
    if (Math.abs(position - lens) > .58) lens = Math.round(position)
    const visible = new Set(visibleIndices)
    for (let index = 0; index < items.length; index++) {
      const item = items[index]
      const d = offset(index, position, items.length)
      const fixedFace = index === wrap(anchor, items.length) || index === wrap(lens, items.length)
      const turn = fixedFace ? 1 : smooth((state.t - .22 - .06 * Math.min(Math.abs(d), 5)) / .3)
      const face = visible.has(index) && turn >= .5
      item.classList.toggle('is-ribbon-face', face)
      item.classList.toggle('is-ribbon-lens', face && index === wrap(lens, items.length))
      if (visible.has(index)) item.style.setProperty('--ribbon-flip', Math.max(.04, Math.abs(Math.cos(Math.PI * turn))).toFixed(4))
    }
    warm(metrics)
  }
  inner = createDeck({
    ...options,
    onSettle(index, details) { if (!open) options.onSettle?.(index, details) },
    presentation: {
      pose(d, metrics, original) { return open ? blendPose(original, ribbonPose(d, metrics), state.t) : original },
      onRender: renderFaces,
    },
  })

  function draw() {
    if (open && !destroyed) inner.drag(state.p)
  }
  function needsFrame() {
    return open && !document.hidden && (tMotion || pMotion || mode === 'cruise' || mode === 'coast')
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
        // Only the part of this frame after unfolding belongs to the drift.
        dt = Math.min(dt, Math.max(0, now - motion.start - motion.duration) / 1000)
        mode = gesture ? 'grab' : userPaused ? 'paused' : 'coast'
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
    } else if (!gesture && !tMotion && (mode === 'coast' || mode === 'cruise')) {
      const target = userPaused ? 0 : .25
      const duration = mode === 'coast' ? .42 : .6
      const difference = velocity - target
      const decay = Math.exp(-dt / duration)
      // Integrating the decay keeps both distance and speed tied to elapsed
      // visible time, even when a busy frame takes longer than the usual 16ms.
      state.p += target * dt + difference * duration * (1 - decay)
      velocity = target + difference * decay
      if (userPaused && Math.abs(velocity) < .05) glide(Math.round(state.p), false, 320)
      else if (!userPaused && Math.abs(velocity - target) < .01) mode = 'cruise'
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
  function spread({ paused = false } = {}) {
    if (destroyed || open || document.hidden) return
    state.p = inner.suspend()
    state.t = 0
    anchor = lens = Math.round(state.p)
    warmed = null
    velocity = 0
    open = true
    mode = 'unfolding'
    userPaused = paused || reduced.matches || !options.gsap
    pauseReveal?.()
    hand.classList.add('is-ribbon-open')
    syncControls()
    transition(1, 640)
    idle()
  }
  function landInFan() {
    stopFrame()
    clearTimers()
    state.p = Math.round(state.p)
    state.t = 0
    open = false
    mode = 'fan'
    tMotion = pMotion = null
    hand.classList.remove('is-ribbon-open', 'is-ribbon-changing')
    for (const item of items) {
      item.classList.remove('is-ribbon-face', 'is-ribbon-lens')
      item.style.removeProperty('--ribbon-flip')
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
    clearTimeout(idleTimer)
    userPaused = true
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
  function pause() {
    if (!open) return
    userPaused = true
    velocity = 0
    clearTimeout(idleTimer)
    glide(Math.round(state.p), false, 320)
  }
  function play() {
    if (!open || reduced.matches || !options.gsap) return
    userPaused = false
    pMotion = null
    velocity = 0
    mode = 'cruise'
    syncControls()
    idle()
    requestFrame()
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
    clearTimeout(idleTimer)
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
    const pitch = .8 * metrics.width + (metrics.width <= 260 ? 12 : Math.round(metrics.width * .067))
    state.p = gesture.spreadPosition + (position - gesture.spreadInput) * gesture.unit / (pitch * metrics.zoom)
    draw()
  }
  function release(from, speed) {
    clearTimeout(openingTimer)
    const ended = gesture
    gesture = null
    if (!open) return inner.release(from, speed)
    if (mode === 'folding') return
    const metrics = inner.metrics
    const pitch = .8 * metrics.width + (metrics.width <= 260 ? 12 : Math.round(metrics.width * .067))
    velocity = clamp(speed * (ended?.unit ?? inner.dragUnit()) / (pitch * metrics.zoom), -6, 6)
    if (reduced.matches || userPaused) return glide(Math.round(state.p), false, 320)
    mode = tMotion ? 'unfolding' : 'coast'
    syncControls()
    idle()
    requestFrame()
  }
  function cancel() {
    if (aborting) return
    gesture = null
    clearTimeout(openingTimer)
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
    userPaused = true
    velocity = 0
    mode = 'paused'
    clearTimers()
    hand.classList.remove('is-ribbon-changing')
    draw()
    syncControls()
  }

  listen(toggle, 'click', event => {
    if (open) gather()
    else { spread({ paused: event.detail === 0 }); if (!event.detail) status.textContent = 'Deck spread out. Use the arrow keys to move along it and Escape to gather it.' }
  })
  listen(playButton, 'click', () => userPaused ? play() : pause())
  for (const control of [toggle, playButton]) listen(control, 'pointerdown', event => event.stopPropagation())
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
  const inside = event => {
    const top = help.getBoundingClientRect().top - 16
    const bottom = hand.getBoundingClientRect().bottom + 16
    return event.clientX >= 0 && event.clientX <= window.innerWidth && event.clientY >= top && event.clientY <= bottom
  }
  listen(document, 'pointermove', event => {
    if (!open || event.pointerType !== 'mouse' || gesture) return
    if (inside(event)) idle()
  }, { passive: true })
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
  listen(window, 'scroll', () => { if (open) { idle(); queueVisibilityCheck() } }, { passive: true })
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
    hold, drag, release, cancel, to, finish, spread, gather, pause, play,
    next() { if (open) glide((pMotion?.to ?? Math.round(state.p)) + 1); else inner.next() },
    previous() { if (open) glide((pMotion?.to ?? Math.round(state.p)) - 1); else inner.previous() },
    dragUnit: () => inner.dragUnit(),
    refresh() {
      if (gesture && open) {
        abortInput()
        userPaused = true
        velocity = 0
        mode = 'paused'
      }
      warmed = null
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
