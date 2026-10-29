// How a round works: the step cards build a stack while the visitor scrolls (GSAP + ScrollTrigger).
//
// Desktop with a mouse: the stack stays pinned beside the intro, centred on the screen. The first
// card is already in place; each next card flies up from the bottom of the screen, tilted, and
// settles on the stack, one card per scroll step.
// Touch screens and phones: the cards use position: sticky and overlap as the page scrolls.
// Reduced motion, or no GSAP: a plain list (see why-stack.css).
//
// Hooks for the scenes inside the cards (why-scenes.js):
//   onMode('motion' | 'still')  how the cards are shown right now
//   onFront(index)              the card that is mostly in view at the front of the stack
//   onReveal(index)             a card has (nearly) arrived, so its scene can play its entrance

const MEDIA = {
  reduceMotion: '(prefers-reduced-motion: reduce)',
  mobileStack: '(max-width: 839.98px)',
  rotatingCards: '(min-width: 840px) and (hover: hover) and (pointer: fine)',
  touchStack:
    '(min-width: 840px) and (min-height: 560.02px) and (hover: none), (min-width: 840px) and (min-height: 560.02px) and (pointer: coarse)',
  compactLandscape: '(max-width: 1199.98px) and (max-height: 560px) and (orientation: landscape)',
}

const pageTop = (element) => element.getBoundingClientRect().top + window.scrollY

// Returns false when the stack cannot animate (no section or no GSAP); the cards then stay a list.
export function initWhyStack({ root = document, onMode, onFront, onReveal } = {}) {
  const section = root.querySelector('.why-vtg')
  const { gsap, ScrollTrigger } = window
  if (!section || !gsap || !ScrollTrigger) return false
  const shell = section.querySelector('.why-stack-shell')
  const stack = section.querySelector('.why-stack')
  const cards = gsap.utils.toArray(section.querySelectorAll('.why-card'))
  const surfaces = cards.map((card) => card.querySelector('.why-card__surface'))
  if (!shell || !stack || !cards.length || surfaces.some((surface) => !surface)) return false
  gsap.registerPlugin(ScrollTrigger)

  const size = { step: 0, scrollStep: 0, sequence: 0, stickyTop: 0, stackWidth: 0, viewport: 0, offsets: [] }
  let active = -1
  let front = -1

  function setActive(index) {
    const next = Math.max(0, Math.min(cards.length - 1, index))
    if (next === active) return
    active = next
    cards.forEach((card, i) => card.toggleAttribute('data-why-active', i === next))
  }
  function setFront(index) {
    const next = Math.max(0, Math.min(cards.length - 1, index))
    if (next === front) return
    front = next
    onFront?.(next)
  }
  const reveal = (index) => onReveal?.(index)

  const media = gsap.matchMedia()
  media.add(MEDIA, (context) => {
    const { reduceMotion, rotatingCards, mobileStack, touchStack, compactLandscape } = context.conditions
    const stickyCards = mobileStack || touchStack || compactLandscape
    section.classList.add('why-motion-ready')

    function measure() {
      gsap.set(cards, { clearProps: 'transform' })
      const step = Number.parseFloat(getComputedStyle(stack).rowGap) || 0
      size.step = step
      section.style.setProperty('--why-stack-depth', `${(cards.length - 1) * step}px`)
      cards.forEach((card, index) => {
        card.style.setProperty('--why-card-index', index)
        card.style.setProperty('--why-card-offset', `${index * step}px`)
        card.style.setProperty('--why-card-trim', `${cards.length - 1 - index}px`)
      })
      size.stackWidth = stack.offsetWidth
      size.viewport = document.documentElement.clientHeight
      // One card per scroll step: roughly the card's own width, never less than a third of the screen.
      // The first card needs no step; it is already on the stack.
      size.scrollStep = Math.max(size.stackWidth - 16, size.viewport * (compactLandscape ? 0.54 : 0.34))
      size.sequence = stickyCards ? 0 : (cards.length - 1) * size.scrollStep
      section.style.setProperty('--why-sequence-distance', `${size.sequence}px`)
      size.stickyTop =
        Number.parseFloat(getComputedStyle(stack).top) ||
        Number.parseFloat(getComputedStyle(section).getPropertyValue('--why-stack-top')) ||
        0
      size.offsets = cards.map((card) => card.offsetTop)
    }
    measure()
    ScrollTrigger.addEventListener('refreshInit', measure)

    const cleanup = () => {
      ScrollTrigger.removeEventListener('refreshInit', measure)
      section.classList.remove('why-motion-ready')
      section.style.removeProperty('--why-stack-depth')
      section.style.removeProperty('--why-sequence-distance')
      setActive(cards.length - 1)
      gsap.set(surfaces, { clearProps: 'transform,opacity,visibility' })
    }

    if (reduceMotion) {
      onMode?.('still')
      setActive(cards.length - 1)
      return cleanup
    }
    onMode?.('motion')

    if (stickyCards) {
      // Each card becomes the top card at its sticky slot; its scene starts a little earlier,
      // once most of the card is on screen.
      const slotTop = (index) => pageTop(stack) + size.offsets[index] - index * size.step - size.stickyTop
      cards.forEach((card, index) => {
        ScrollTrigger.create({
          trigger: card,
          start: () => slotTop(index),
          end: () => document.documentElement.scrollHeight,
          invalidateOnRefresh: true,
          onEnter: () => {
            setActive(index)
            setFront(index)
          },
          onLeaveBack: () => {
            setActive(index - 1)
            setFront(index - 1)
          },
        })
        ScrollTrigger.create({
          trigger: card,
          start: () => {
            const visible = pageTop(stack) + size.offsets[index] - size.viewport
            return visible + (slotTop(index) - visible) * 0.6
          },
          end: () => document.documentElement.scrollHeight,
          invalidateOnRefresh: true,
          onEnter: () => reveal(index),
        })
      })
      setActive(0)
      setFront(0)
      return cleanup
    }

    // Desktop: one scrubbed timeline, one second of timeline per rising card (card i rises during
    // second i - 1). The first card's scene plays as soon as the stack comes into view.
    gsap.set(surfaces.slice(1), { opacity: 0 })
    setActive(0)
    setFront(0)
    ScrollTrigger.create({ trigger: shell, start: 'top 65%', onEnter: () => reveal(0) })
    const sequenceStart = () => pageTop(shell) - size.stickyTop
    const timeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: shell,
        start: sequenceStart,
        end: () => sequenceStart() + size.sequence,
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate(self) {
          const time = timeline.time()
          const rising = Math.min(cards.length - 1, Math.floor(time + 0.001) + 1)
          setActive(self.progress <= 0 ? 0 : rising)
          // A card is the front one from when it has mostly risen until the next one has risen over it.
          setFront(self.progress <= 0 ? 0 : Math.floor(time + 0.4))
          // A card's scene plays once the card has risen most of the way onto the stack.
          const arrived = self.progress >= 1 ? cards.length - 1 : Math.floor(time - 0.72) + 1
          for (let i = 1; i <= arrived; i++) reveal(i)
        },
      },
    })
    surfaces.slice(1).forEach((surface, step) => {
      const index = step + 1
      const tilt = rotatingCards ? (index % 2 === 0 ? -10 : 10) : 0
      timeline.fromTo(surface, { opacity: 0 }, { opacity: 1, duration: 0.1, immediateRender: false }, step)
      // A card keeps its own layer once it has landed (force3D: true). With 'auto' it dropped back
      // to a plain transform at the very end, and being drawn again into the page nudged it.
      timeline.fromTo(
        surface,
        {
          // Start just below the screen, so the card rises into its place on the stack.
          y: () => Math.max(0.2 * size.stackWidth, size.viewport - size.stickyTop - (size.offsets[index] || 0)),
          rotation: tilt,
          force3D: true,
        },
        { y: 0, rotation: 0, force3D: true, duration: 1 },
        step
      )
    })
    return cleanup
  })
  return true
}
