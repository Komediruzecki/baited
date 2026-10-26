// The page's close. "The cards" stays put while the footer scrolls up over it, and the footer's
// top edge breaks up into square pixels that fill in as it rises, after the owner's pixelated
// scroll transition reference. The pixels nearest the footer fill first; each one has its own
// random moment and fades in over a short stretch, so some are half filled on the way.
// The circle and the film button are magnetic on a mouse, as on dennissnellenberg.com. At the
// very end, the giant logo assembles from square pixels as it scrolls into view (after the pixel
// work on monochrome-studio.com): squares of the footer's color sit over it and clear at random.
//
// Reduced motion, or no GSAP: no pin and no pixels, a plain edge and a plain logo; the buttons
// stay still.

export const EDGE_ROWS = 4
export const EDGE_FADE = 0.08 // share of the wipe over which one pixel fades in

// About 90 px squares, never fewer than eight across.
export const edgeColumns = (width) => Math.max(8, Math.round(width / 90))

// When a pixel starts to fill, as a share of the wipe. Row 0 touches the footer.
export const pixelThreshold = (row, rows, random) => (row / rows) * 0.55 + random * 0.4

export const pixelOpacity = (progress, threshold, fade = EDGE_FADE) => Math.min(1, Math.max(0, (progress - threshold) / fade))

export const MARK_FADE = 0.15 // share of the logo's scroll over which one of its squares clears

// Squares over the logo: six rows on a big screen, four on a small one, about square.
export function markGrid(width, height) {
  const rows = height >= 200 ? 6 : 4
  return { rows, columns: Math.max(1, Math.round(width / (height / rows))) }
}

// Small seeded generator (mulberry32), so the pattern is the same on every visit.
export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function initFooter({ gsap, ScrollTrigger } = {}) {
  const footer = document.querySelector('.site-footer')
  const deck = document.getElementById('cards')
  const edge = footer?.querySelector('.footer-edge')
  if (!footer || !gsap) return
  if (ScrollTrigger) gsap.registerPlugin(ScrollTrigger)
  const media = gsap.matchMedia()

  media.add(
    { motion: '(prefers-reduced-motion: no-preference)', mouse: '(hover: hover) and (pointer: fine)' },
    ({ conditions }) => {
      if (!conditions.motion) return
      const cleanups = []
      if (conditions.mouse) cleanups.push(magnetic(footer.querySelectorAll('[data-magnetic]'), gsap))

      // The title's lines slide up into view once, as the footer arrives.
      const lines = footer.querySelectorAll('.footer-title__line > span')
      if (ScrollTrigger && lines.length)
        gsap.from(lines, {
          yPercent: 110,
          duration: 0.9,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: footer, start: 'top 55%', once: true },
        })

      if (ScrollTrigger && edge && deck) {
        let cells = []
        const build = () => {
          const columns = edgeColumns(footer.clientWidth)
          edge.style.setProperty('--edge-cols', columns)
          edge.style.setProperty('--edge-cell', `${footer.clientWidth / columns}px`)
          const random = seededRandom(7)
          const fragment = document.createDocumentFragment()
          cells = []
          for (let row = EDGE_ROWS - 1; row >= 0; row--)
            for (let column = 0; column < columns; column++) {
              const cell = document.createElement('i')
              fragment.append(cell)
              cells.push({ cell, threshold: pixelThreshold(row, EDGE_ROWS, random()) })
            }
          edge.replaceChildren(fragment)
        }
        const paint = (progress) => {
          for (const { cell, threshold } of cells) cell.style.opacity = pixelOpacity(progress, threshold).toFixed(3)
        }
        build()
        const wipe = ScrollTrigger.create({
          trigger: footer,
          start: 'top bottom',
          end: 'top top',
          onUpdate: (self) => paint(self.progress),
          onRefresh: (self) => {
            build()
            paint(self.progress)
          },
        })
        // "The cards" waits under the rising footer: pinned from when it fills the screen until the
        // footer's top reaches the top of the screen.
        const pin = ScrollTrigger.create({
          trigger: deck,
          start: 'bottom bottom',
          end: () => `+=${window.innerHeight}`,
          pin: true,
          pinSpacing: false,
          anticipatePin: 1,
        })
        cleanups.push(() => {
          wipe.kill()
          pin.kill()
          edge.replaceChildren()
        })
      }

      const mark = footer.querySelector('.footer-mark')
      if (ScrollTrigger && mark) {
        const grid = document.createElement('span')
        grid.className = 'footer-mark__pixels'
        mark.append(grid)
        let squares = []
        const build = () => {
          const { columns, rows } = markGrid(mark.clientWidth, mark.clientHeight)
          grid.style.setProperty('--mark-cols', columns)
          grid.style.setProperty('--mark-rows', rows)
          const random = seededRandom(11)
          const fragment = document.createDocumentFragment()
          squares = []
          for (let i = 0; i < columns * rows; i++) {
            const cell = document.createElement('i')
            fragment.append(cell)
            squares.push({ cell, threshold: random() * (1 - MARK_FADE) })
          }
          grid.replaceChildren(fragment)
        }
        const paint = (progress) => {
          for (const { cell, threshold } of squares) cell.style.opacity = (1 - pixelOpacity(progress, threshold, MARK_FADE)).toFixed(3)
        }
        build()
        const assemble = ScrollTrigger.create({
          trigger: mark,
          start: 'top bottom',
          end: 'bottom bottom',
          onUpdate: (self) => paint(self.progress),
          onRefresh: (self) => {
            build()
            paint(self.progress)
          },
        })
        cleanups.push(() => {
          assemble.kill()
          grid.remove()
        })
      }
      return () => cleanups.forEach((cleanup) => cleanup?.())
    }
  )
}

// Buttons drift toward the pointer while it is over them, and settle back when it leaves.
function magnetic(elements, gsap) {
  const off = []
  for (const element of elements) {
    const pull = Number(element.dataset.magnetic) || 0.25
    const x = gsap.quickTo(element, 'x', { duration: 0.6, ease: 'power3.out' })
    const y = gsap.quickTo(element, 'y', { duration: 0.6, ease: 'power3.out' })
    const move = (event) => {
      const box = element.getBoundingClientRect()
      x((event.clientX - box.left - box.width / 2) * pull)
      y((event.clientY - box.top - box.height / 2) * pull)
    }
    const leave = () => {
      x(0)
      y(0)
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerleave', leave)
    off.push(() => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', leave)
      gsap.set(element, { clearProps: 'transform' })
    })
  }
  return () => off.forEach((remove) => remove())
}
