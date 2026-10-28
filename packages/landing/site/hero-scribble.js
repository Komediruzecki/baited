// The ribbons behind the hero, as on 1minus1.com: their guide paths, layout and timing, read from
// their build on 2026-10-28 (_nuxt/DzSAX5xB.js and DJOfzmf8.js for the mechanism; DSdjeV90.js,
// IWp108lH.js, DzlCe3fk.js and 3m5z6t4t.js for the paths). A ribbon is a hundred squares of 100 CSS
// px set along a smooth curve through one of four guide paths, so close together that they overlap
// into a single band with stepped edges. The squares never move: the sweep is their opacity. They
// come on one after another along the curve over a second, then go in the same order over the
// next, each fading in half a second, and the next ribbon follows three seconds later. The first
// comes with the hero's entrance, as the arrival curtain goes (pixels.js); after it the others take
// turns, the first last, round and round while the hero is on screen. The squares are their colour
// on their deep purple (styles.css), on a canvas laid behind the page where the ribbons fall, so
// they scroll with it. Screens 1024px wide and up only, and none with reduced motion.
import { CLEARED_EVENT } from './pixels.js'

export const TRAIL_SETTINGS = Object.freeze({
  count: 100, // squares in a ribbon
  squareSize: 100, // CSS px
  color: '#26024a',
  stagger: 0.01, // s between neighbouring squares, in the ribbon's own time…
  localFadeDuration: 0.5, // …and how long each square takes to fade
  revealSeconds: 1, // a ribbon's showing, played out in this long
  exitSeconds: 1, // its going
  gapSeconds: 3, // before the next ribbon
  minimumWidth: 1024,
})

// Their four guide paths, and where each lies: as wide as a share of the screen up to a cap, and
// offset in CSS px from the hero's top and from one of its sides.
export const TRAIL_ROUTES = [
  {
    name: 'TrailPathTwo',
    viewBox: [1477, 1186],
    widthVw: 77,
    maxWidth: 1475,
    top: 0,
    right: 0,
    d: 'M637.889 0.425781L480.389 97.4258L359.889 184.426L244.389 278.426L145.389 382.926L0.388672 561.926L111.889 513.926L244.389 442.926L426.889 370.426L637.889 299.426L878.889 217.926L1025.89 184.426L802.889 324.426L676.889 426.926L549.389 543.926L462.389 655.926L373.889 761.926L646.889 630.926L958.389 513.926L1192.39 451.926L1475.89 402.426L1240.39 543.926L1025.89 683.926L907.389 783.426L783.389 898.426L667.889 1023.93L561.889 1185.43',
  },
  {
    name: 'TrailPathThree',
    viewBox: [1716, 910],
    widthVw: 90,
    maxWidth: 1724,
    top: -90,
    left: -120,
    d: 'M0.0234375 461.95L230.023 471.95L508.523 505.95L789.523 568.45L1029.52 657.95L1266.02 786.45L1430.02 907.95L1398.02 823.45L1283.02 647.95L1115.52 461.95L914.523 301.45L803.023 233.45L914.523 243.95L1134.02 284.45L1377.52 353.45L1568.52 426.45L1714.02 492.45L1616.02 341.95L1474.02 196.45L1337.02 84.9502L1239.02 22.4502L1193.52 0.450195',
  },
  {
    name: 'TrailPathFour',
    viewBox: [1253, 1209],
    widthVw: 65,
    maxWidth: 1251,
    top: -145,
    left: -250,
    d: 'M515.232 0.450195L655.732 68.4502L775.732 146.95L942.232 270.95L1070.73 399.45L1186.73 549.95L1251.23 665.95L1075.23 561.45L882.732 467.45L718.732 399.45L445.232 313.95L289.232 282.45L119.232 258.95L12.2324 252.95L123.732 296.45L264.732 360.95L438.232 460.95L580.732 561.45L701.232 664.45L797.732 765.95L877.732 875.45L890.732 896.95L749.232 829.45L526.232 730.45L344.732 667.95L175.232 625.45L37.2324 606.95L0.232422 603.95L55.2324 632.95L166.732 691.95L282.732 765.45L372.732 835.95L445.232 894.95L521.232 966.45L593.732 1047.95L711.732 1208.45',
  },
  {
    name: 'TrailPathFive',
    viewBox: [1198, 1391],
    widthVw: 62.5,
    maxWidth: 1200,
    top: -132,
    right: -167,
    d: 'M993.15 1390.49L845.65 1229.99L698.65 1102.99L515.65 968.987L340.65 869.987L216.15 806.487L74.1504 751.987L0.150391 728.487L51.1504 724.987L187.15 731.987L393.15 751.987L611.65 782.987L756.65 809.987L904.65 839.487L958.15 849.987L889.15 782.987L778.15 697.487L624.65 597.987L431.65 493.487L287.65 426.487L135.65 370.987L26.1504 343.487L89.6504 335.487H278.15L421.15 343.487L561.65 358.987L730.65 387.987L862.15 416.487L1020.15 457.487L1197.15 514.987L1134.65 451.487L1060.15 387.987L887.15 267.987L713.15 176.987L512.15 93.4868L361.65 45.4868L169.15 0.486816',
  },
]
// After the hero's own ribbon, the loop's turns: the second, third and fourth routes, then the first.
export const TRAIL_ORDER = [1, 2, 3, 0]

const clamp01 = (value) => Math.max(0, Math.min(1, value))

// The points of a guide path, which uses only the M, L, H and V commands.
export function parseGuidePoints(d) {
  const points = []
  let [x, y] = [0, 0]
  for (const segment of d.match(/[a-zA-Z][^a-zA-Z]*/g) || []) {
    const command = segment[0]
    const kind = command.toUpperCase()
    const relative = command !== kind
    const values = (segment.slice(1).match(/[-+]?(?:\d*\.)?\d+/g) || []).map(Number)
    if (kind === 'M' || kind === 'L') {
      for (let i = 0; i < values.length; i += 2) {
        x = relative ? x + values[i] : values[i]
        y = relative ? y + values[i + 1] : values[i + 1]
        points.push([x, y])
      }
    } else if (kind === 'H' || kind === 'V') {
      for (const value of values) {
        if (kind === 'H') x = relative ? x + value : value
        else y = relative ? y + value : value
        points.push([x, y])
      }
    } else throw new Error(`Unsupported guide command: ${command}`)
  }
  return points
}

// A route's guide points in page px, for a hero whose box is `anchor` (page px: left, right, top)
// on a screen `viewportWidth` CSS px wide.
export function routePoints(route, anchor, viewportWidth) {
  const width = Math.min((viewportWidth * route.widthVw) / 100, route.maxWidth)
  const height = (width * route.viewBox[1]) / route.viewBox[0]
  const left = route.left !== undefined ? anchor.left + route.left : anchor.right - route.right - width
  const top = anchor.top + route.top
  return parseGuidePoints(route.d).map(([x, y]) => [left + (x / route.viewBox[0]) * width, top + (y / route.viewBox[1]) * height])
}

// `count` points spaced evenly by length along the curve three.js's CatmullRomCurve3 draws through
// `points` (type 'catmullrom', tension 0.5, its ends extended in line), as getSpacedPoints(count - 1)
// finds them: the curve's length measured over 200 divisions, and taken as straight between them.
export function ribbonCenters(points, count = TRAIL_SETTINGS.count, divisions = 200) {
  const last = points.length - 1
  const pointAt = (t) => {
    let i = Math.floor(last * t)
    let f = last * t - i
    if (i >= last) [i, f] = [last - 1, 1]
    const [a, b] = [points[i], points[i + 1]]
    const before = i > 0 ? points[i - 1] : [2 * a[0] - b[0], 2 * a[1] - b[1]]
    const after = i + 2 <= last ? points[i + 2] : [2 * b[0] - a[0], 2 * b[1] - a[1]]
    return [0, 1].map((k) => {
      const [t0, t1] = [0.5 * (b[k] - before[k]), 0.5 * (after[k] - a[k])]
      return a[k] + t0 * f + (-3 * a[k] + 3 * b[k] - 2 * t0 - t1) * f * f + (2 * a[k] - 2 * b[k] + t0 + t1) * f * f * f
    })
  }
  const lengths = [0]
  let previous = pointAt(0)
  for (let i = 1; i <= divisions; i++) {
    const current = pointAt(i / divisions)
    lengths.push(lengths[i - 1] + Math.hypot(current[0] - previous[0], current[1] - previous[1]))
    previous = current
  }
  const total = lengths[divisions]
  return Array.from({ length: count }, (_, n) => {
    // As a share of the whole first, so the last point's target is the whole length exactly.
    const target = total * (n / (count - 1))
    // The last division that starts before the target, by halving.
    let [low, high] = [0, divisions]
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (lengths[middle] < target) low = middle + 1
      else if (lengths[middle] > target) high = middle - 1
      else {
        high = middle
        break
      }
    }
    if (high >= divisions) return pointAt(1)
    if (lengths[high] === target) return pointAt(high / divisions)
    const fraction = (target - lengths[high]) / (lengths[high + 1] - lengths[high])
    return pointAt((high + fraction) / divisions)
  })
}

// How much of each square of a ribbon shows, `reveal` and `erase` being how far its showing and
// its going have got (0 to 1). Theirs staggers one short tween per square inside each; this is
// the same in closed form: a square comes on whole, and fades as power2.out runs from 1 to 0.
export function squareOpacities(reveal, erase, out = new Float32Array(TRAIL_SETTINGS.count)) {
  const { count, stagger, localFadeDuration } = TRAIL_SETTINGS
  const revealSpan = (count - 1) * stagger // 0.99 s of the ribbon's own time…
  const exitSpan = revealSpan + localFadeDuration // …and 1.49 s, each played out in its second
  const revealTime = clamp01(reveal) * revealSpan
  const exitTime = clamp01(erase) * exitSpan
  for (let i = 0; i < count; i++) {
    const start = i * stagger
    const fade = clamp01((exitTime - start) / localFadeDuration)
    out[i] = reveal > 0 && revealTime + 1e-8 >= start ? (1 - fade) ** 3 : 0
  }
  return out
}

// How far a ribbon has got `seconds` into its turn: a gap, then its showing, then its going.
export function ribbonPhase(seconds, gap = TRAIL_SETTINGS.gapSeconds) {
  const { revealSeconds, exitSeconds } = TRAIL_SETTINGS
  const local = seconds - gap
  return { reveal: clamp01(local / revealSeconds), erase: clamp01((local - revealSeconds) / exitSeconds) }
}
export const TRAIL_TURN = TRAIL_SETTINGS.gapSeconds + TRAIL_SETTINGS.revealSeconds + TRAIL_SETTINGS.exitSeconds

let entered = false // the hero's entrance has had its ribbon (once a page)

export function initHeroScribble({ gsap, ScrollTrigger } = {}, hero = document.querySelector('.hero')) {
  if (!hero || !gsap || !ScrollTrigger) return
  gsap.registerPlugin(ScrollTrigger)
  gsap
    .matchMedia()
    .add(`(min-width: ${TRAIL_SETTINGS.minimumWidth}px) and (prefers-reduced-motion: no-preference)`, () => trail(gsap, ScrollTrigger, hero))
}

// The ribbons for as long as the screen is wide enough; returns their teardown.
function trail(gsap, ScrollTrigger, hero) {
  const { count, squareSize, color, revealSeconds, exitSeconds } = TRAIL_SETTINGS
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-scribble'
  canvas.setAttribute('aria-hidden', 'true')
  // Right above the page's backdrop, below everything else.
  const backdrop = document.querySelector('.page-backdrop')
  if (backdrop) backdrop.after(canvas)
  else document.body.prepend(canvas)
  const ctx = canvas.getContext('2d')
  const ribbons = TRAIL_ROUTES.map(() => ({ centers: [], opacity: new Float32Array(count), shown: false }))
  let top = 0 // the canvas's place on the page

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = color
    for (const ribbon of ribbons) {
      if (!ribbon.shown) continue
      ribbon.centers.forEach(([x, y], i) => {
        if (!ribbon.opacity[i]) return
        ctx.globalAlpha = ribbon.opacity[i]
        ctx.fillRect(Math.round(x - squareSize / 2), Math.round(y - squareSize / 2) - top, squareSize, squareSize)
      })
    }
    ctx.globalAlpha = 1
  }
  // Where the ribbons lie for the hero as it is laid out now, and the canvas over them, a pixel to
  // a CSS px (styles.css scales it up unsmoothed, so the squares keep sharp edges).
  const layout = () => {
    const box = hero.getBoundingClientRect()
    const anchor = { left: box.left + scrollX, right: box.right + scrollX, top: box.top + scrollY }
    const width = document.documentElement.clientWidth
    let [low, high] = [Infinity, -Infinity]
    TRAIL_ROUTES.forEach((route, index) => {
      ribbons[index].centers = ribbonCenters(routePoints(route, anchor, width))
      for (const [, y] of ribbons[index].centers) [low, high] = [Math.min(low, y), Math.max(high, y)]
    })
    top = Math.max(0, Math.floor(low - squareSize / 2))
    const height = Math.max(1, Math.ceil(high + squareSize / 2) - top)
    if (canvas.width !== width || canvas.height !== height) [canvas.width, canvas.height] = [width, height]
    Object.assign(canvas.style, { top: `${top}px`, width: `${width}px`, height: `${height}px` })
    draw()
  }
  // A ribbon's squares for how far it has got; whether any of them shows.
  const set = (ribbon, { reveal, erase }) => {
    squareOpacities(reveal, erase, ribbon.opacity)
    ribbon.shown = reveal > 0 && erase < 1
    return ribbon.shown
  }

  // The loop: one clock for all four turns, so pausing and restarting it stay exact.
  const clock = { time: 0 }
  let finishing = false
  const loop = gsap.timeline({ repeat: -1, paused: true }).fromTo(
    clock,
    { time: 0 },
    {
      time: TRAIL_ORDER.length * TRAIL_TURN,
      duration: TRAIL_ORDER.length * TRAIL_TURN,
      ease: 'none',
      onUpdate: () => {
        let showing = false
        TRAIL_ORDER.forEach((index, turn) => {
          if (set(ribbons[index], ribbonPhase(clock.time - turn * TRAIL_TURN))) showing = true
        })
        draw()
        // Off screen the loop stops, but not halfway through a ribbon: once none shows.
        if (finishing && !showing) {
          finishing = false
          loop.pause()
        }
      },
    }
  )
  // While the hero is on screen the loop runs; coming back to it starts the loop over, with a gap.
  let watch = null
  const startLoop = () => {
    watch = ScrollTrigger.create({
      trigger: hero,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: ({ isActive }) => {
        if (isActive) {
          if (finishing) finishing = false
          else if (loop.paused()) loop.restart(false, false)
        } else if (!loop.paused()) finishing = true
      },
    })
  }
  // The hero's entrance brings the first ribbon, straight away; then the loop follows it. A page
  // opened further down, or a screen widened later, starts with the loop.
  let entrance = null
  const enter = () => {
    entered = true
    const box = hero.getBoundingClientRect()
    if (box.bottom <= 0 || box.top >= innerHeight) return startLoop()
    const time = { seconds: 0 }
    entrance = gsap.fromTo(
      time,
      { seconds: 0 },
      {
        seconds: revealSeconds + exitSeconds,
        duration: revealSeconds + exitSeconds,
        ease: 'none',
        onUpdate: () => {
          set(ribbons[0], ribbonPhase(time.seconds, 0))
          draw()
        },
        onComplete: startLoop,
      }
    )
  }

  layout()
  let pending = 0
  const relayout = () => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(layout)
  }
  const sized = new ResizeObserver(relayout)
  sized.observe(hero)
  addEventListener('resize', relayout)
  ScrollTrigger.addEventListener('refresh', relayout)
  const curtain = document.querySelector('.pixel-curtain:not(.is-covering)') || document.documentElement.classList.contains('pixel-boot')
  if (entered) startLoop()
  else if (curtain) document.addEventListener(CLEARED_EVENT, enter, { once: true })
  else enter()

  return () => {
    document.removeEventListener(CLEARED_EVENT, enter)
    entrance?.kill()
    watch?.kill()
    loop.kill()
    cancelAnimationFrame(pending)
    sized.disconnect()
    removeEventListener('resize', relayout)
    ScrollTrigger.removeEventListener('refresh', relayout)
    canvas.remove()
  }
}
