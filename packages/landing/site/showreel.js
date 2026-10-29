// The film's flight, after 1minus1.com (their page measured in headless Chrome, 2026-10-28): the page
// opens on the film as a card tilted beside the headline, in front of it (behind it on a phone, until
// the flight brings it forward). Scrolling straightens it, squares its corners and grows it into a
// player in the middle of the screen, while the headline's lines slide off to the left. As in the
// owner's mini showreel player, the card and the player are the film's own 16:9 on every screen, so
// the whole picture always shows. The screen holds there while "How it plays" deals in over it as a
// sheet, and later "The cards" over the finished steps (styles.css, .has-showreel). The film's real
// place is the showreel, laid out at the size it lands at (it moves there on start); the hero shows
// it scaled down into the hero's card slot, so the picture is never enlarged past its own size. GSAP
// scrubs everything with the scroll, bar the film's flight on a phone, which plays in its own time
// once the page starts to scroll (FLIGHT_SECONDS). Reduced motion and pages without GSAP keep the
// film in the hero.

export const FLIGHT_TILT = 14 // degrees the card leans in the hero
export const FLIGHT_ROUND = 1 / 12 // its round corners, as a share of its width; its top right is square
// A sheet deals in leaning SHEET_TILT degrees about its top corner on its own side and SHEET_SHIFT px
// further out, and has settled (ease-out) once its top is SHEET_LAND of the way up the screen.
export const SHEET_TILT = 8
export const SHEET_SHIFT = 200
export const SHEET_LAND = 0.77
export const COVERED_EVENT = 'showreel:covered' // on document; detail is true while the sheet covers the film
export const WATCH_EVENT = 'showreel:watch' // on document: play the round from the start with sound
export const UNWATCH_EVENT = 'showreel:unwatch' // on document: no longer watching; the film goes quiet
// On a phone the film starts behind the headline and comes forward over it between these points of
// its flight: the hero fades out where the film is, more and more, so the words sink behind the
// film instead of jumping there. From the last point on, the film is in front of the hero.
export const FILM_FORWARD = [0.04, 0.36]
// On a phone the film does not follow the scroll on its way out: scrolling FLIGHT_START px sets it
// off, and it flies for FLIGHT_SECONDS, easing out; back above FLIGHT_START it flies home.
export const FLIGHT_START = 10
export const FLIGHT_SECONDS = 0.9

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => Math.max(0, Math.min(1, t))
const smooth = (t) => {
  const u = clamp01(t)
  return u * u * (3 - 2 * u)
}

// The largest box of the given aspect that fits in width × height.
export function fitAspect(width, height, aspect) {
  if (Math.abs(width / height - aspect) < 1e-9) return [width, height]
  return width / height > aspect ? [height * aspect, height] : [width, width / aspect]
}

// The film `at` 0 (the card in its slot) to 1 (landed), for its frame and the slot (page coordinates,
// untransformed): the frame's transform, and the window of the frame that shows (insets and corner
// radius in the frame's own px). Card and frame share the film's shape, so the window is the whole
// frame; a slot of another shape would show the part of the frame that fits it.
export function flightAt(at, slot, frame) {
  const t = clamp01(at)
  const width = lerp(slot.width, frame.width, t)
  const height = lerp(slot.height, frame.height, t)
  const [w, h] = fitAspect(frame.width, frame.height, width / height)
  const scale = width / w
  const centerX = frame.left + frame.width / 2
  const centerY = frame.top + frame.height / 2
  return {
    x: lerp(slot.left + slot.width / 2, centerX, t) - centerX,
    y: lerp(slot.top + slot.height / 2, centerY, t) - centerY,
    scale,
    rotation: FLIGHT_TILT * (1 - t),
    insetX: (frame.width - w) / 2,
    insetY: (frame.height - h) / 2,
    radius: (FLIGHT_ROUND * slot.width * (1 - t)) / scale,
  }
}

// Where the window of the film shows on screen for a flight `f` (flightAt) of its frame `box`: its
// corners, clockwise from the top left. The frame turns and scales about its middle.
export function filmCorners(f, box) {
  const [cx, cy] = [box.left + box.width / 2 + f.x, box.top + box.height / 2 + f.y]
  const a = (f.rotation * Math.PI) / 180
  const [cos, sin] = [Math.cos(a) * f.scale, Math.sin(a) * f.scale]
  const [w, h] = [box.width, box.height]
  return [[f.insetX, f.insetY], [w - f.insetX, f.insetY], [w - f.insetX, h - f.insetY], [f.insetX, h - f.insetY]].map(([lx, ly]) => {
    const [dx, dy] = [lx - w / 2, ly - h / 2]
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  })
}

// The layers of a mask that leaves a box (width × height) as it is outside the convex `corners`
// (clockwise on screen, in the box's own px) and lets `strength` (0 to 1) of it through inside: one
// gradient per edge, opaque beyond it. Masks add their layers one over another (mask-composite's
// initial value), so outside any edge the box shows whole; inside all four it keeps 1 - strength.
export function quadMaskLayers(corners, { width, height }, strength) {
  const alpha = 1 - clamp01(strength) ** (1 / corners.length)
  return corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const normal = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length]
    // A CSS gradient's angle points its way (0deg up, clockwise); its line runs through the box's
    // middle and is as long as the box is across that way.
    const angle = Math.atan2(normal[0], -normal[1])
    const line = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))
    const at = (a[0] - width / 2) * normal[0] + (a[1] - height / 2) * normal[1] + line / 2
    return { angle: (angle * 180) / Math.PI, at, alpha }
  })
}

export const quadMask = (corners, box, strength) =>
  strength > 0
    ? quadMaskLayers(corners, box, strength)
        .map(({ angle, at, alpha }) => `linear-gradient(${angle.toFixed(2)}deg, rgb(0 0 0 / ${alpha.toFixed(3)}) ${(at - 0.5).toFixed(1)}px, #000 ${(at + 0.5).toFixed(1)}px)`)
        .join(', ')
    : ''

// A sheet's lean (degrees) and shift (px) at progress p of its rise, for a sheet on the left (-1) or
// the right (1): it swings in about its own top corner and settles with an ease-out.
export function sheetAt(p, side, tilt = SHEET_TILT, shift = SHEET_SHIFT) {
  const k = (1 - clamp01(p)) ** 2
  return k ? { rotation: -side * tilt * k, x: side * shift * k } : { rotation: 0, x: 0 }
}

// The outline of a leaning sheet whose ground runs from `left` to `right` and `height` down (px, in
// the sheet's own box), turned about its top corner on `side` and shifted by x: its corners, top
// left first, clockwise.
export function sheetOutline({ left, right, height }, side, rotation, x) {
  const a = (rotation * Math.PI) / 180
  const [ox, oy] = [side < 0 ? left : right, 0]
  const turn = ([px, py]) => [ox + (px - ox) * Math.cos(a) - (py - oy) * Math.sin(a) + x, oy + (px - ox) * Math.sin(a) + (py - oy) * Math.cos(a)]
  return [[left, 0], [right, 0], [right, height], [left, height]].map(turn)
}

export function initShowreel({ gsap, ScrollTrigger } = {}) {
  const hero = document.querySelector('.hero')
  const title = hero?.querySelector('h1')
  const slot = hero?.querySelector('.hero-stage')
  const film = slot?.querySelector('.film-wrap')
  const frame = film?.querySelector('.film-frame')
  const reel = document.getElementById('showreel')
  const sheet = document.getElementById('how')
  const steps = sheet?.querySelector('.why-vtg__stage')
  const cards = document.getElementById('cards')
  if (!gsap || !ScrollTrigger || !film || !frame || !reel || matchMedia('(prefers-reduced-motion: reduce)').matches) return false

  gsap.registerPlugin(ScrollTrigger)
  reel.hidden = false
  reel.prepend(film)
  hero.classList.add('is-flight')
  document.documentElement.classList.add('has-showreel')
  const phone = matchMedia('(max-width: 700px)')
  // A scrubbed progress from 0 to 1 over a scroll range, handed to `apply` on every change. A
  // refresh (on load, a resize, late fonts) rewinds every scrubbed tween to measure the page, which
  // reports 0, and then puts it back without reporting; so after each refresh the progress is set
  // to where the scroll is and handed over again. Without that the film stayed drawn at its hero
  // slot far above a landed showreel, and the sheets kept leaning, until the scroll crossed them.
  const scrubbed = (scrollTrigger, apply) => {
    const state = { p: 0 }
    let tween = null
    const onRefresh = (self) => {
      tween?.progress(self.progress)
      apply(state.p)
      scrollTrigger.onRefresh?.(self)
    }
    tween = gsap.to(state, { p: 1, ease: 'none', scrollTrigger: { scrub: 0.5, invalidateOnRefresh: true, ...scrollTrigger, onRefresh }, onUpdate: () => apply(state.p) })
    apply(0)
    tween.progress(tween.scrollTrigger.progress)
    return tween.scrollTrigger
  }

  let at = 0
  let heroMask = ''
  // On a phone the film flies in its own time (fly, below): `heading` is where it is bound, 1 out
  // and 0 home, and `flying` the tween taking it there. While it is out of its card it is held,
  // fixed, in the middle of the screen (styles.css, .is-holding), and it flies out from `from`: its
  // card on screen as it set off.
  let heading = 0
  let flying = null
  let holding = false
  let from = null
  // The frame's own place on screen, untransformed: in the middle of the showreel's first screen,
  // wherever the showreel is, or where it is held.
  const frameBox = () => {
    if (holding) {
      const style = getComputedStyle(film)
      return { left: parseFloat(style.left), top: parseFloat(style.top), width: film.offsetWidth, height: film.offsetHeight }
    }
    const reelBox = reel.getBoundingClientRect()
    return { left: reelBox.left + film.offsetLeft, top: reelBox.top + film.offsetTop, width: film.offsetWidth, height: film.offsetHeight }
  }
  // Where the slot and the frame are now, read on every frame rather than kept: the showreel sticks
  // to the top once landed, and fonts, a resize or a restored scroll can all move things after a
  // measurement, which once left the card far from its slot or off the screen.
  const draw = () => {
    const held = phone.matches && at > 0
    if (held !== holding) reel.classList.toggle('is-holding', (holding = held))
    const box = frameBox()
    const slotBox = from || slot.getBoundingClientRect()
    // Without a frame or a slot to fly from (between layouts) there is nothing to draw yet.
    if (!box.width || !box.height || !slotBox.width || !slotBox.height) return
    const f = flightAt(at, slotBox, box)
    gsap.set(film, { x: f.x, y: f.y, scale: f.scale, rotation: f.rotation })
    const r = `${f.radius.toFixed(1)}px`
    frame.style.clipPath = `inset(${f.insetY.toFixed(1)}px ${f.insetX.toFixed(1)}px round ${r} 0px ${r} ${r})`
    film.style.setProperty('--win-x', `${f.insetX.toFixed(1)}px`)
    film.style.setProperty('--win-y', `${f.insetY.toFixed(1)}px`)
    film.style.setProperty('--win-r', r)
    film.style.setProperty('--film-scale', f.scale.toFixed(4))
    // On a phone the hero lies over the film (styles.css); the film comes forward by masking the
    // hero out where the film is (FILM_FORWARD). All the way forward it goes in front of the hero
    // instead (.is-behind), so nothing has to follow the page while it scrolls on under the film.
    const strength = phone.matches ? smooth((at - FILM_FORWARD[0]) / (FILM_FORWARD[1] - FILM_FORWARD[0])) : 0
    const ahead = strength >= 1
    if (ahead !== hero.classList.contains('is-behind')) hero.classList.toggle('is-behind', ahead)
    const heroBox = strength > 0 && !ahead ? hero.getBoundingClientRect() : null
    const mask = heroBox ? quadMask(filmCorners(f, box).map(([x, y]) => [x - heroBox.left, y - heroBox.top]), heroBox, strength) : ''
    if (mask !== heroMask) hero.style.maskImage = hero.style.webkitMaskImage = heroMask = mask
    // The headline's lines slide off to the left with the flight, each by part of its own width
    // (styles.css). The variable lives on the heading, whose lines the typing replaces (reveal.js).
    if (phone.matches) title?.style.setProperty('--hero-slide', at.toFixed(4))
  }
  // After their timing: the card starts growing with the first scroll and has landed as the
  // showreel's top passes 18% of the screen, then rides up and sticks.
  const range = { trigger: hero, start: 0, endTrigger: reel, end: 'top 18%' }
  scrubbed(
    {
      ...range,
      onRefresh: draw,
      onUpdate: (self) => {
        if (phone.matches) return
        reel.classList.toggle('is-landed', self.progress > 0.985)
        if (self.progress < 0.985) stopWatching()
      },
    },
    (p) => {
      if (phone.matches) return
      // Turned from a phone's layout to a wider one: the scroll has the film again.
      flying?.kill()
      flying = from = null
      heading = 0
      at = p
      draw()
    }
  )
  if (title) scrubbed(range, (p) => phone.matches || title.style.setProperty('--hero-slide', p.toFixed(4)))

  // A phone flies the film in its own time instead. iOS scrolls the page on a thread of its own and
  // runs scripts after it, so a film that a script moved back against the page at every scroll
  // shook, a little behind the page or ahead of it. There the first FLIGHT_START px of scrolling set
  // the film off from its card to the middle of the screen, where it waits, fixed, while the hero
  // scrolls away and the showreel comes up under it and sticks with the film where it already is.
  // Back above FLIGHT_START it flies home to its card.
  const fly = (to) => {
    if (to === heading && (flying || at === to)) return
    heading = to
    flying?.kill()
    flying = null
    // Out, it leaves its card where the card is at that moment; home, it lands on the card wherever
    // the card has got to by then.
    from = to ? slot.getBoundingClientRect() : null
    const arrive = () => {
      draw()
      reel.classList.toggle('is-landed', at > 0.985)
      if (at < 0.985) stopWatching()
    }
    // With its card off the screen (a page opened further down, a jump to a link) there is nothing
    // to fly from: the film is simply there.
    if (to && from.bottom <= 0) {
      at = 1
      return arrive()
    }
    const motion = { at }
    flying = gsap.to(motion, {
      at: to,
      duration: FLIGHT_SECONDS * Math.abs(to - at),
      ease: 'power2.out',
      onUpdate: () => {
        at = motion.at
        arrive()
      },
      onComplete: () => {
        flying = null
      },
    })
  }
  const setOff = ScrollTrigger.create({
    start: FLIGHT_START,
    end: 'max',
    onUpdate: (self) => phone.matches && fly(self.progress > 0 ? 1 : 0),
    onRefresh: (self) => phone.matches && fly(self.progress > 0 ? 1 : 0),
  })
  if (phone.matches) fly(setOff.progress > 0 ? 1 : 0)

  const redraw = new ResizeObserver(() => draw())
  redraw.observe(hero)
  redraw.observe(reel)
  document.fonts?.ready.then(draw)

  // "Watch the round" plays the round from the start with its sound (player.js). The film lands a
  // little down the screen; it sits in the middle once the showreel sticks to the top, which is where
  // the showreel follows the hero.
  const stuckAt = () => hero.getBoundingClientRect().bottom + scrollY
  // Scrolling away, back up or under a sheet, ends the watching and its sound (player.js).
  function stopWatching() {
    if (!reel.classList.contains('is-watching')) return
    reel.classList.remove('is-watching')
    document.dispatchEvent(new Event(UNWATCH_EVENT))
  }
  const watchFilm = () => {
    reel.classList.add('is-watching')
    document.dispatchEvent(new Event(WATCH_EVENT))
    if (reel.getBoundingClientRect().top > 1) scrollTo({ top: stuckAt(), behavior: 'smooth' })
    // The keys go to the film now (Space, K, arrows): the footer link it came from is far away.
    frame.focus({ preventScroll: true })
  }
  // "Watch the round" (in the footer) comes back up to the film and plays it. A plain link to the
  // showreel would not move: once landed it sticks to the top, so the browser counts it as already
  // in view.
  for (const link of document.querySelectorAll('[data-watch]')) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      const top = stuckAt()
      let done = false
      const arrive = () => {
        if (done) return
        done = true
        removeEventListener('scrollend', arrive)
        // Let the triggers catch up with the scroll first, so the film is no longer under a sheet.
        ScrollTrigger.update()
        watchFilm()
      }
      if (Math.abs(scrollY - top) < 2) return arrive()
      addEventListener('scrollend', arrive)
      setTimeout(arrive, 1800)
      scrollTo({ top, behavior: 'smooth' })
    })
  }

  // The sheets deal in from alternate sides, after 1minus1's service cards: "How it plays" from the
  // left, "The cards" from the right. The sheet's ground and what sits near its top edge turn
  // (styles.css): the heading and, on "How it plays", the steps beside it, which otherwise stuck out
  // past the leaning edge and were cut off there; on "The cards", the deck's help under the heading,
  // which otherwise stood level while the words above it leaned. While it leans the rest of the
  // sheet is cut to its outline, so nothing on it shows beyond its edge.
  const deal = (element, side, faces) => {
    if (!element) return
    faces = faces.filter(Boolean)
    let ground = { left: 0, right: 0, height: 0 }
    let turning = false // whether the faces' turning points are measured for the present layout
    // At each refresh the sheet lies flat while the page is measured (the steps' own scroll effects
    // measure what turns with it); the refresh then puts the lean back (scrubbed, above).
    const measure = () => {
      element.style.setProperty('--deal-rot', '0deg')
      element.style.setProperty('--deal-x', '0px')
      element.style.clipPath = ''
      const gap = parseFloat(getComputedStyle(element).getPropertyValue('--sheet-gap')) || 0
      const width = element.offsetWidth
      ground = side < 0 ? { left: -0.05 * width, right: width - gap, height: element.offsetHeight } : { left: gap, right: 1.05 * width, height: element.offsetHeight }
      turning = false
    }
    // A face turns about the sheet's own top corner on its side. Its place on the sheet is read
    // while the sheet deals in, when the face rides with it: further down the page it sticks or is
    // pinned (a refresh or a reload there measured it a screen or more off its sheet).
    const corner = () => {
      const sheetBox = element.getBoundingClientRect()
      for (const face of faces) {
        face.style.setProperty('--deal-rot', '0deg')
        face.style.setProperty('--deal-x', '0px')
        const faceBox = face.getBoundingClientRect()
        face.style.removeProperty('--deal-rot')
        face.style.removeProperty('--deal-x')
        face.style.setProperty('--deal-ox', `${(side < 0 ? sheetBox.left : sheetBox.right) - faceBox.left}px`)
        face.style.setProperty('--deal-oy', `${sheetBox.top - faceBox.top}px`)
      }
      turning = true
    }
    measure()
    scrubbed({ trigger: element, start: 'top bottom', end: `top ${Math.round((1 - SHEET_LAND) * 100)}%`, onRefreshInit: measure }, (p) => {
      if (faces.length && !turning && p > 0 && p < 1) corner()
      const { rotation, x } = phone.matches ? sheetAt(p, side, SHEET_TILT / 2, SHEET_SHIFT / 8) : sheetAt(p, side)
      element.style.setProperty('--deal-rot', `${rotation.toFixed(3)}deg`)
      element.style.setProperty('--deal-x', `${x.toFixed(1)}px`)
      const points = sheetOutline(ground, side, rotation, x).map(([px, py]) => `${px.toFixed(1)}px ${py.toFixed(1)}px`)
      element.style.clipPath = rotation || x ? `polygon(${points.join(', ')})` : ''
    })
  }
  deal(sheet, -1, [sheet?.querySelector('.why-vtg__intro-sticky'), sheet?.querySelector('.why-stack-shell')])
  deal(cards, 1, [cards?.querySelector('.how-cards__intro'), cards?.querySelector('.deck-help')])

  if (sheet) {
    // Once the sheet covers the film, the film can rest (player.js).
    ScrollTrigger.create({
      trigger: sheet,
      start: 'top top',
      end: 'max',
      onToggle: (self) => {
        // Also kept as a class: a reload deep in the page covers the film before player.js listens.
        reel.classList.toggle('is-covered', self.isActive)
        document.dispatchEvent(new CustomEvent(COVERED_EVENT, { detail: self.isActive }))
        // Hidden under the sheet, the film's buttons are out of the keyboard's way too.
        reel.inert = self.isActive
        if (self.isActive) stopWatching()
      },
    })
  }
  if (steps && cards) {
    // The finished steps hold still while "The cards" deals in over them: from when the foot of the
    // steps reaches the foot of the screen, or, where the step cards stick in place as they arrive
    // (narrow and touch screens, why-stack.js), from when the last of them has arrived, which is
    // when the foot of the stack has come up to that card's sticky top plus its height. Held from
    // the foot alone, a narrow screen froze the last card well short of its place.
    const stack = steps.querySelector('.why-stack')
    const last = [...steps.querySelectorAll('.why-card')].at(-1)
    // Measured as laid out: when this is worked out the sheet may still be leaning in, which turns
    // the stack and moves its box on screen.
    const foot = (element) => {
      let top = element.offsetHeight
      for (let node = element; node; node = node.offsetParent) top += node.offsetTop
      return top
    }
    const held = () => {
      const settled = foot(steps) - innerHeight
      if (!stack || !last || getComputedStyle(last).position !== 'sticky') return settled
      return Math.max(settled, foot(stack) - (parseFloat(getComputedStyle(last).top) || 0) - last.offsetHeight)
    }
    ScrollTrigger.create({ trigger: steps, start: held, endTrigger: cards, end: 'top top', pin: true, pinSpacing: false, invalidateOnRefresh: true })
  }
  return true
}
