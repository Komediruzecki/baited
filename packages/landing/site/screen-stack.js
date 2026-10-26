// Upright sheets: lift, hold, fall out of view, then return behind the stack.
const OUT = 'cubic-bezier(.25,1,.5,1)'
const LIFT = 'cubic-bezier(.33,1,.68,1)'
const FALL = 'cubic-bezier(.32,0,.67,0)'

export function initScreenStack({ reduced }) {
  const section = document.getElementById('how')
  const stack = document.getElementById('role-screens')
  if (!section || !stack || stack.dataset.stackReady) return
  const sheets = [...stack.querySelectorAll('.role-step')]
  if (sheets.length < 2) return
  const names = sheets.map((sheet) => sheet.querySelector('.step-copy h3')?.textContent ?? '')
  stack.dataset.stackReady = 'true'
  section.classList.add('has-role-stack')
  stack.tabIndex = 0
  stack.setAttribute('role', 'group')
  stack.setAttribute('aria-roledescription', 'carousel')
  stack.setAttribute('aria-label', 'How a round works. Use the arrow keys to change screens.')
  stack.setAttribute('aria-live', 'off')

  const controls = document.createElement('div')
  controls.className = 'role-controls'
  function button(id, label, symbol) {
    const el = document.createElement('button')
    el.id = id
    el.type = 'button'
    el.setAttribute('aria-label', label)
    el.setAttribute('aria-controls', 'role-screens')
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'icon')
    svg.setAttribute('aria-hidden', 'true')
    const use = document.createElementNS(svg.namespaceURI, 'use')
    use.setAttribute('href', `#${symbol}`)
    svg.append(use)
    el.append(svg)
    return el
  }
  const prev = button('role-prev', 'Previous screen', 'i-left')
  const next = button('role-next', 'Next screen', 'i-arrow')
  const play = button('role-auto', 'Pause screens', 'i-pause')
  play.className = 'role-auto text-button'
  const playLabel = document.createElement('span')
  play.append(playLabel)
  const count = document.createElement('span')
  count.className = 'role-count'
  controls.append(prev, count, next, play)
  const announcement = document.createElement('p')
  announcement.className = 'sr-only'
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', 'polite')
  announcement.setAttribute('aria-atomic', 'true')
  stack.after(controls, announcement)

  let order = sheets.map((_, index) => index)
  let automatic = !reduced.matches
  let visible = false
  let hovered = false
  let focused = false
  let windowActive = document.hasFocus()
  let pointer = null
  let suppressClickUntil = 0
  let autoplayTimer = null
  let sequence = 0
  let moving = false
  const animations = new Set()
  const timers = new Set()
  const listeners = []
  const on = (target, event, handler, options) => {
    target.addEventListener(event, handler, options)
    listeners.push(() => target.removeEventListener(event, handler, options))
  }
  function geometry() {
    const style = getComputedStyle(stack)
    return {
      x: parseFloat(style.getPropertyValue('--sheet-step-x')) || 24,
      y: parseFloat(style.getPropertyValue('--sheet-step-y')) || 22,
      w: sheets[order[0]].offsetWidth,
      h: sheets[order[0]].offsetHeight,
    }
  }
  const pose = (x, y) => `translate(${x}px, ${y}px)`
  const slot = (rank, g) => pose(rank * g.x, rank * g.y)
  function schedule() {
    clearTimeout(autoplayTimer)
    if (!automatic || !visible || hovered || focused || pointer || moving || document.hidden || !windowActive) return
    autoplayTimer = setTimeout(() => dealNext(), 7500)
  }
  function setAuto(value) {
    automatic = value
    play.setAttribute('aria-pressed', String(value))
    play.setAttribute('aria-label', value ? 'Pause screens' : 'Play screens')
    playLabel.textContent = value ? 'Pause screens' : 'Play screens'
    play.querySelector('use').setAttribute('href', value ? '#i-pause' : '#i-play')
    schedule()
  }
  function renderRest() {
    const g = geometry()
    const focusedSheet = sheets.find((sheet) => sheet.contains(document.activeElement))
    if (focusedSheet && focusedSheet !== sheets[order[0]]) stack.focus({ preventScroll: true })
    order.forEach((index, rank) => {
      const sheet = sheets[index]
      sheet.style.transform = slot(rank, g)
      sheet.style.opacity = '1'
      sheet.style.zIndex = String(10 - rank)
      sheet.classList.toggle('is-active', rank === 0)
      sheet.classList.remove('is-leaving', 'is-moving')
      sheet.inert = rank !== 0
      sheet.setAttribute('aria-hidden', String(rank !== 0))
      sheet.setAttribute('aria-label', `Screen ${index + 1} of ${sheets.length}: ${names[index]}`)
    })
    count.textContent = `${String(order[0] + 1).padStart(2, '0')} / ${String(sheets.length).padStart(2, '0')}`
  }
  // Final poses live inline, underneath WAAPI. Cancelling always returns to a
  // complete selected state, never a stale phase of an earlier transaction.
  function stopSequence() {
    sequence += 1
    clearTimeout(autoplayTimer)
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    for (const animation of animations) animation.cancel()
    animations.clear()
    moving = false
    renderRest()
  }
  function later(delay, callback, token = sequence) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      if (token === sequence) callback()
    }, delay)
    timers.add(timer)
  }
  function animate(el, keyframes, duration, options = {}) {
    el.classList.add('is-moving')
    const animation = el.animate(keyframes, { duration, fill: 'backwards', ...options })
    animations.add(animation)
    // Cancellation rejects finished; consume it even for supporting tracks.
    animation.finished.then(
      () => animations.delete(animation),
      () => animations.delete(animation)
    )
    return animation
  }
  function zTrack(el, before, after, at, total) {
    animate(
      el,
      [
        { offset: 0, zIndex: before },
        { offset: at / total, zIndex: before },
        { offset: Math.min(1, at / total + 0.001), zIndex: after },
        { offset: 1, zIndex: after },
      ],
      total
    )
  }
  function finishWhen(animation, manual) {
    const token = sequence
    animation.finished.then(
      () => {
        if (token !== sequence) return
        stopSequence()
        if (manual) announce()
        schedule()
      },
      () => {}
    )
  }
  function announce() {
    const text = `Screen ${order[0] + 1} of ${sheets.length}. ${names[order[0]]}`
    if (announcement.textContent !== text) announcement.textContent = text
  }
  function commitInstant(manual) {
    renderRest()
    if (manual) announce()
    schedule()
  }
  function dealNext({ side = 1, from = null, manual = false } = {}) {
    cancelPointer()
    stopSequence()
    if (manual) setAuto(false)
    const oldOrder = [...order]
    const top = sheets[oldOrder[0]]
    const g = geometry()
    const lifted = from ?? { x: side * 0.36 * g.w, y: -0.06 * g.h }
    order = [...oldOrder.slice(1), oldOrder[0]]
    renderRest()
    if (reduced.matches || typeof top.animate !== 'function') return commitInstant(manual)
    moving = true
    top.classList.add('is-leaving')
    const hold = from ? 0 : 400
    const fall = hold + 240
    const total = fall + 280
    const at = (ms) => ms / total
    const liftedPose = pose(lifted.x, lifted.y)
    const mainFrames = from
      ? [{ offset: 0, transform: liftedPose, easing: FALL }]
      : [
          { offset: 0, transform: slot(0, g), easing: LIFT },
          { offset: at(280), transform: liftedPose },
          { offset: at(hold), transform: liftedPose, easing: FALL },
        ]
    mainFrames.push(
      { offset: at(fall), transform: pose(lifted.x, g.h + (sheets.length - 1) * g.y + 24) },
      { offset: at(fall) + 0.001, transform: slot(sheets.length - 2, g), easing: OUT },
      { offset: 1, transform: slot(sheets.length - 1, g) }
    )
    const main = animate(top, mainFrames, total)
    const alphaFrames = [{ offset: 0, opacity: 1, easing: FALL }]
    if (hold) alphaFrames.push({ offset: at(hold), opacity: 1, easing: FALL })
    alphaFrames.push(
      { offset: at(fall), opacity: 0.35 },
      { offset: at(fall) + 0.001, opacity: 0 },
      { offset: at(fall + 120), opacity: 1 },
      { offset: 1, opacity: 1 }
    )
    animate(top, alphaFrames, total)
    zTrack(top, 10, 10 - (sheets.length - 1), fall, total)
    oldOrder.slice(1).forEach((index, rank) => {
      const sheet = sheets[index]
      animate(sheet, [{ transform: slot(rank + 1, g), easing: OUT }, { transform: slot(rank, g) }], 320, { delay: hold })
      zTrack(sheet, 9 - rank, 10 - rank, fall, total)
    })
    later(fall, () => top.classList.remove('is-leaving'))
    finishWhen(main, manual)
  }
  function dealPrevious(manual = false) {
    cancelPointer()
    stopSequence()
    if (manual) setAuto(false)
    const oldOrder = [...order]
    const last = oldOrder.at(-1)
    const arriving = sheets[last]
    const top = sheets[oldOrder[0]]
    const g = geometry()
    order = [last, ...oldOrder.slice(0, -1)]
    renderRest()
    if (reduced.matches || typeof arriving.animate !== 'function') return commitInstant(manual)
    moving = true
    top.classList.add('is-leaving')
    const main = animate(
      arriving,
      [
        { offset: 0, transform: slot(sheets.length - 1, g) },
        { offset: 0.25, transform: slot(sheets.length - 1, g) },
        { offset: 0.251, transform: pose(0, -0.55 * g.h), easing: OUT },
        { offset: 1, transform: slot(0, g) },
      ],
      480
    )
    animate(
      arriving,
      [
        { offset: 0, opacity: 1 },
        { offset: 0.25, opacity: 0 },
        { offset: 0.5, opacity: 0.55 },
        { offset: 1, opacity: 1 },
      ],
      480
    )
    zTrack(arriving, 10 - (sheets.length - 1), 11, 120, 480)
    oldOrder.slice(0, -1).forEach((index, rank) => {
      animate(sheets[index], [{ transform: slot(rank, g), easing: OUT }, { transform: slot(rank + 1, g) }], 320, { delay: 120 })
      zTrack(sheets[index], 10 - rank, 9 - rank, 120, 480)
    })
    later(280, () => top.classList.remove('is-leaving'))
    finishWhen(main, manual)
  }
  function springBack(from) {
    stopSequence()
    if (reduced.matches || !from || typeof sheets[order[0]].animate !== 'function') return schedule()
    moving = true
    const main = animate(sheets[order[0]], [{ transform: pose(from.x, from.y), easing: OUT }, { transform: slot(0, geometry()) }], 240)
    finishWhen(main, false)
  }
  function jumpTo(index) {
    const rank = order.indexOf(index)
    if (rank === 0) {
      stopSequence()
      setAuto(false)
    } else if (rank === 1) dealNext({ manual: true })
    else if (rank === sheets.length - 1) dealPrevious(true)
    else if (rank > 0) {
      stopSequence()
      setAuto(false)
      order = [...order.slice(rank), ...order.slice(0, rank)]
      commitInstant(true)
    }
  }
  on(prev, 'click', () => dealPrevious(true))
  on(next, 'click', () => dealNext({ manual: true }))
  on(play, 'click', () => {
    setAuto(!automatic)
  })
  on(stack, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    cancelPointer()
    if (event.key === 'Home') jumpTo(0)
    else if (event.key === 'End') jumpTo(sheets.length - 1)
    else if (event.key === 'ArrowLeft') dealPrevious(true)
    else dealNext({ manual: true })
  })
  on(stack, 'pointerenter', (event) => {
    if (event.pointerType !== 'touch') {
      hovered = true
      schedule()
    }
  })
  on(stack, 'pointerleave', () => {
    hovered = false
    schedule()
  })
  on(section, 'focusin', () => {
    focused = true
    schedule()
  })
  on(section, 'focusout', (event) => {
    if (!section.contains(event.relatedTarget)) {
      focused = false
      schedule()
    }
  })
  on(stack, 'pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || pointer) return
    stopSequence()
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      time: performance.now(),
      velocity: 0,
      active: false,
      geometry: geometry(),
      pose: { x: 0, y: 0 },
    }
    schedule()
  })
  on(stack, 'pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.x
    const dy = event.clientY - pointer.y
    if (!pointer.active && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      endPointer(event.pointerId, true)
      return
    }
    if (!pointer.active && Math.abs(dx) > 12) {
      pointer.active = true
      try {
        stack.setPointerCapture(event.pointerId)
      } catch {
        endPointer(event.pointerId, true)
        return
      }
      setAuto(false)
    }
    const now = performance.now()
    pointer.velocity = (event.clientX - pointer.lastX) / Math.max(1, now - pointer.time)
    pointer.lastX = event.clientX
    pointer.time = now
    if (!pointer.active) return
    event.preventDefault()
    const g = pointer.geometry
    pointer.pose = { x: dx, y: -0.06 * g.h * Math.min(1, Math.abs(dx) / (0.36 * g.w)) }
    if (!reduced.matches) sheets[order[0]].style.transform = pose(pointer.pose.x, pointer.pose.y)
  })
  function endPointer(id, cancelled = false, clientX) {
    if (!pointer || pointer.id !== id) return
    const ended = pointer
    pointer = null
    if (stack.hasPointerCapture(id)) stack.releasePointerCapture(id)
    if (!ended.active) return schedule()
    suppressClickUntil = performance.now() + 250
    const dx = (Number.isFinite(clientX) ? clientX : ended.lastX) - ended.x
    const velocity = performance.now() - ended.time < 80 ? ended.velocity : 0
    const farEnough = Math.abs(dx) >= 0.18 * ended.geometry.w
    const flick = Math.abs(velocity) >= 0.5 && Math.sign(velocity) === Math.sign(dx)
    if (!cancelled && (farEnough || flick)) {
      dealNext({ side: Math.sign(dx) || 1, from: ended.pose, manual: true })
    } else springBack(ended.pose)
  }
  function cancelPointer() {
    if (!pointer) return
    const id = pointer.id
    pointer = null
    if (stack.hasPointerCapture(id)) stack.releasePointerCapture(id)
  }
  on(window, 'pointerup', (event) => endPointer(event.pointerId, false, event.clientX), true)
  on(window, 'pointercancel', (event) => endPointer(event.pointerId, true), true)
  on(stack, 'lostpointercapture', (event) => {
    if (event.target === stack && !stack.hasPointerCapture(event.pointerId)) endPointer(event.pointerId, true)
  })
  on(
    stack,
    'click',
    (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    true
  )
  function pauseAway() {
    cancelPointer()
    stopSequence()
    schedule()
  }
  on(window, 'blur', () => {
    windowActive = false
    pauseAway()
  })
  on(window, 'focus', () => {
    windowActive = true
    schedule()
  })
  on(window, 'pagehide', () => {
    windowActive = false
    pauseAway()
  })
  on(window, 'pageshow', () => {
    windowActive = document.hasFocus()
    schedule()
  })
  on(document, 'visibilitychange', () => {
    if (document.hidden) pauseAway()
    else schedule()
  })
  on(reduced, 'change', () => {
    if (reduced.matches) setAuto(false)
    pauseAway()
  })
  on(window, 'resize', pauseAway)
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
      schedule()
    },
    { threshold: [0, 0.5] }
  )
  observer.observe(stack)
  renderRest()
  setAuto(automatic)

  return {
    destroy() {
      cancelPointer()
      stopSequence()
      clearTimeout(autoplayTimer)
      observer.disconnect()
      listeners.forEach((remove) => remove())
      controls.remove()
      announcement.remove()
      section.classList.remove('has-role-stack')
      delete stack.dataset.stackReady
      for (const sheet of sheets) {
        sheet.style.removeProperty('transform')
        sheet.style.removeProperty('opacity')
        sheet.style.removeProperty('z-index')
        sheet.inert = false
        sheet.removeAttribute('aria-hidden')
      }
    },
  }
}
