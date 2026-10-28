import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { curtainSize, leavesForPage, pixelColumns } from '../site/pixels.js'
import { AWAY_AT, FLOAT_AT, FOLD_AT, morphPairs, navAway, navState, WAVE_HOP, WAVE_STEP, waveLift } from '../site/nav.js'
import { filmCorners, fitAspect, FLIGHT_TILT, flightAt, quadMaskLayers, SHEET_SHIFT, SHEET_TILT, sheetAt, sheetOutline } from '../site/showreel.js'
import { parseGuidePoints, ribbonCenters, ribbonPhase, routePoints, squareOpacities, TRAIL_ORDER, TRAIL_ROUTES, TRAIL_SETTINGS, TRAIL_TURN, trailScale } from '../site/hero-scribble.js'
import { atRest, GLITCH_FROM, GLITCH_FULL, glitchAmount, kick, PUSH_MAX, SPIN_MAX, stepSpring } from '../ribbon/ribbon-effects.js'
import { PIXEL_LOGO,PIXEL_LOGO_COLS, pixelCircleRows, pixelCircleSvg, pixelLogoCells, pixelLogoSvg } from '../site/pixel-logo.js'
import { PIXEL_LOGO_INKS } from '../scripts/build-pixel-logo.mjs'
import { lineBoxes, splitWords } from '../site/reveal.js'
import { THUMB_MIN, thumbFor } from '../site/scrollbar.js'
import { catchUp, initSmoothScroll, LENIS_OPTIONS, yieldToOtherScrolls } from '../site/smooth-scroll.js'

// The pixel layer: the curtain between pages, the floating navigation and the text reveals.
// Their drawing and timing are checked in a browser.

test('the curtain uses big squares and always covers the whole screen', () => {
  assert.equal(pixelColumns(1440), 8)
  assert.equal(pixelColumns(800), 6)
  assert.equal(pixelColumns(390), 4)
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1920, 1080],
    [390, 844],
    [768, 1024],
  ]) {
    const { columns, rows, cell } = curtainSize(width, height)
    assert.equal(columns * cell, width)
    assert.ok(rows * cell >= height, `${width}x${height} leaves a gap`)
    assert.ok((rows - 1) * cell < height, `${width}x${height} has a spare row`)
  }
})

test('the pixel logo is a full grid with a straight I, and its files are drawn from it', async () => {
  for (const row of PIXEL_LOGO) assert.equal(row.length, PIXEL_LOGO_COLS)
  // The I (columns 14–16) mirrors the T's stem (columns 19–21) from row 3 down, with free columns around it.
  const stem = (row, x) => row.slice(x, x + 3)
  PIXEL_LOGO.forEach((row, y) => {
    assert.equal(row[13] + row[17], '..', `row ${y} keeps the I apart`)
    assert.equal(stem(row, 14), y < 3 ? '###' : [...stem(row, 19)].reverse().join(''), `row ${y} of the I`)
  })
  assert.equal(pixelLogoCells().length, PIXEL_LOGO.join('').split('#').length - 1)
  for (const [name, color] of Object.entries(PIXEL_LOGO_INKS)) {
    const file = await readFile(new URL(`../site/assets/brand/baited-pixel-${name}.svg`, import.meta.url), 'utf8')
    assert.equal(file, pixelLogoSvg(color), `rebuild baited-pixel-${name}.svg with scripts/build-pixel-logo.mjs`)
  }
  const circle = await readFile(new URL('../site/assets/brand/pixel-circle.svg', import.meta.url), 'utf8')
  assert.equal(circle, pixelCircleSvg(), 'rebuild pixel-circle.svg with scripts/build-pixel-logo.mjs')
  // The circle is symmetric and touches all four edges.
  const rows = pixelCircleRows()
  assert.deepEqual(rows, [...rows].reverse())
  for (const row of rows) assert.equal(row, [...row].reverse().join(''))
  assert.ok(rows[0].includes('#') && rows.some((row) => row[0] === '#'))
})

test("the hero's ribbons lie along 1minus1's four guide paths, a hundred fixed squares each", () => {
  assert.deepEqual(
    { ...TRAIL_SETTINGS },
    { count: 100, squareSize: 100, color: '#26024a', stagger: 0.01, localFadeDuration: 0.5, revealSeconds: 1, exitSeconds: 1, gapSeconds: 3, fullWidth: 1024 },
    'their settings'
  )
  // Their paths read back to their points, the one horizontal step included.
  const two = parseGuidePoints(TRAIL_ROUTES[0].d)
  assert.deepEqual([two[0], two.at(-1)], [[637.889, 0.425781], [561.889, 1185.43]])
  assert.ok(parseGuidePoints(TRAIL_ROUTES[3].d).some(([x, y]) => x === 278.15 && y === 335.487))
  // Laid out against the hero: a share of the screen's width up to a cap, from its top and a side.
  const hero = { left: 0, right: 1966, top: 76 }
  const [first] = routePoints(TRAIL_ROUTES[0], hero, 1966)
  assert.ok(Math.abs(first[0] - (1966 - 1475 + (637.889 / 1477) * 1475)) < 1e-9, 'capped at 1475px, against the right')
  const narrower = { ...hero, right: 1440 }
  assert.ok(Math.abs(routePoints(TRAIL_ROUTES[0], narrower, 1440)[0][0] - (1440 - 1108.8 + (637.889 / 1477) * 1108.8)) < 1e-6, '77vw below the cap')
  assert.ok(Math.abs(routePoints(TRAIL_ROUTES[1], narrower, 1440)[0][0] - (-120 + (0.0234375 / 1716) * 1296)) < 1e-6, '120px off the left')
  assert.ok(Math.abs(routePoints(TRAIL_ROUTES[1], narrower, 1440)[0][1] - (76 - 90 + (461.95 / 910) * ((1296 * 910) / 1716))) < 1e-6)
  for (const route of TRAIL_ROUTES) {
    const points = routePoints(route, hero, 1966)
    const centers = ribbonCenters(points)
    assert.equal(centers.length, 100)
    // From the path's first point to its last, evenly along the curve.
    assert.ok(Math.hypot(centers[0][0] - points[0][0], centers[0][1] - points[0][1]) < 1e-6)
    assert.ok(Math.hypot(centers[99][0] - points.at(-1)[0], centers[99][1] - points.at(-1)[1]) < 1e-6)
    const steps = centers.slice(1).map(([x, y], i) => Math.hypot(x - centers[i][0], y - centers[i][1])).sort((a, b) => a - b)
    assert.ok(steps[98] < steps[49] * 1.15, `${route.name}: no step much longer than the rest`)
    assert.ok(steps[98] < TRAIL_SETTINGS.squareSize * 0.75, `${route.name}: neighbouring squares overlap into one band`)
  }
})

test('below 1024px, phones included, the ribbons are the 1024px drawing scaled down with the screen', () => {
  assert.deepEqual([trailScale(1966), trailScale(1024), trailScale(512)], [1, 1, 0.5])
  const scale = trailScale(390)
  const phone = { left: 0, right: 390, top: 66 }
  const full = { left: 0, right: 1024, top: 66 }
  for (const route of TRAIL_ROUTES) {
    const points = routePoints(route, phone, 390)
    // Every point where the 1024px drawing has it, scaled about the hero's top left corner.
    routePoints(route, full, 1024).forEach(([x, y], i) => {
      assert.ok(Math.abs(points[i][0] - x * scale) < 1e-6 && Math.abs(points[i][1] - (66 + (y - 66) * scale)) < 1e-6, `${route.name}, point ${i}`)
    })
    // The squares shrink with it and still overlap into one band.
    const centers = ribbonCenters(points)
    const steps = centers.slice(1).map(([x, y], i) => Math.hypot(x - centers[i][0], y - centers[i][1]))
    assert.ok(Math.max(...steps) < TRAIL_SETTINGS.squareSize * scale * 0.75, `${route.name}: one band on a phone`)
  }
})

test('a ribbon comes on square by square in a second and goes the same way in the next, three seconds apart', () => {
  assert.ok(squareOpacities(0, 0).every((opacity) => opacity === 0))
  const half = squareOpacities(0.5, 0)
  assert.deepEqual([half[0], half[49], half[50], half[99]], [1, 1, 0, 0], 'halfway through its showing, the first half shows whole')
  assert.ok(squareOpacities(1, 0).every((opacity) => opacity === 1))
  // Going: each square fades over half a second of the ribbon's 1.49, first square first.
  const going = squareOpacities(1, 0.25 / 1.49)
  assert.ok(Math.abs(going[0] - 0.125) < 1e-6, 'halfway through its fade, (1 - 0.5)³')
  assert.equal(going[99], 1, 'the last still whole')
  assert.ok(squareOpacities(1, 1).every((opacity) => opacity === 0))
  // A turn: a gap, a second showing, a second going.
  assert.equal(TRAIL_TURN, 5)
  assert.deepEqual(ribbonPhase(2.9), { reveal: 0, erase: 0 })
  assert.deepEqual(ribbonPhase(3.5), { reveal: 0.5, erase: 0 })
  assert.deepEqual(ribbonPhase(4.5), { reveal: 1, erase: 0.5 })
  assert.deepEqual(ribbonPhase(5), { reveal: 1, erase: 1 })
  assert.deepEqual(ribbonPhase(0.5, 0), { reveal: 0.5, erase: 0 }, "the hero's entrance ribbon has no gap")
  assert.deepEqual(TRAIL_ORDER, [1, 2, 3, 0], 'after the entrance, the others in turn, the first last')
})

test('the film flies from its 16:9 card to a 16:9 player, never enlarged, the whole picture always showing', () => {
  // The owner's screen, 1966 × 654: the player is as tall as the screen allows, in its middle.
  const slot = { left: 1300, top: 200, width: 480, height: 270 }
  const frame = { left: 448, top: 926, width: 1070, height: 601.875 }
  const start = flightAt(0, slot, frame)
  // Card and player are both the film's shape: the whole frame shows, scaled down onto the slot.
  assert.deepEqual([start.insetX, start.insetY], [0, 0])
  assert.ok(Math.abs(start.scale * frame.width - slot.width) < 1e-9)
  assert.equal(start.x, slot.left + slot.width / 2 - (frame.left + frame.width / 2))
  assert.equal(start.y, slot.top + slot.height / 2 - (frame.top + frame.height / 2))
  assert.equal(start.rotation, FLIGHT_TILT)
  const end = flightAt(1, slot, frame)
  assert.deepEqual([end.x, end.y, end.scale, end.rotation, end.insetX, end.insetY, end.radius], [0, 0, 1, 0, 0, 0, 0])
  for (const at of [0, 0.25, 0.5, 0.75, 1]) {
    const f = flightAt(at, slot, frame)
    assert.ok(f.scale <= 1 + 1e-9, 'only ever scaled down')
    assert.ok(Math.abs(f.insetX) < 1e-6 && Math.abs(f.insetY) < 1e-6, 'nothing of the picture is cut away')
  }
  // A slot of another shape would show the largest box of its shape in the frame.
  const other = flightAt(0, { ...slot, height: 320 }, frame)
  const [w, h] = fitAspect(frame.width, frame.height, 480 / 320)
  assert.deepEqual([frame.width - 2 * other.insetX, frame.height - 2 * other.insetY], [w, h])
})

test('on a phone the hero lets the film through where the film is, as much as the film has come forward', () => {
  const box = { left: 0, top: 300, width: 374, height: 210.375 }
  // Landed: the window is the frame itself.
  assert.deepEqual(filmCorners({ x: 0, y: 0, scale: 1, rotation: 0, insetX: 0, insetY: 0 }, box), [[0, 300], [374, 300], [374, 510.375], [0, 510.375]])
  // A card a quarter turn round and half the size, moved: still a quad around its own middle.
  const card = filmCorners({ x: 100, y: -50, scale: 0.5, rotation: 90, insetX: 0, insetY: 0 }, box)
  const middle = [box.width / 2 + 100, 300 + box.height / 2 - 50]
  for (const [x, y] of card) assert.ok(Math.abs(Math.hypot(x - middle[0], y - middle[1]) - Math.hypot(374, 210.375) / 4) < 1e-6)
  assert.ok(Math.abs(card[0][0] - (middle[0] + 210.375 / 4)) < 1e-6, 'the top left corner has turned to the top right')

  // The mask's alpha at a point, as a browser adds the four gradient layers one over another.
  const hero = { width: 400, height: 300 }
  const alphaAt = (layers, [px, py]) =>
    1 -
    layers.reduce((keep, { angle, at, alpha }) => {
      const a = (angle * Math.PI) / 180
      const line = Math.abs(hero.width * Math.sin(a)) + Math.abs(hero.height * Math.cos(a))
      const position = (px - hero.width / 2) * Math.sin(a) - (py - hero.height / 2) * Math.cos(a) + line / 2
      return keep * (1 - (position < at ? alpha : 1))
    }, 1)
  const turn = (deg) => {
    const a = (deg * Math.PI) / 180
    return [[-50, -50], [50, -50], [50, 50], [-50, 50]].map(([x, y]) => [200 + x * Math.cos(a) - y * Math.sin(a), 150 + x * Math.sin(a) + y * Math.cos(a)])
  }
  for (const strength of [0.25, 0.5, 1]) {
    const layers = quadMaskLayers(turn(30), hero, strength)
    assert.ok(Math.abs(alphaAt(layers, [200, 150]) - (1 - strength)) < 1e-9, 'inside, the film shows through by its strength')
    assert.equal(alphaAt(layers, [10, 10]), 1, 'outside it the hero is whole')
    assert.equal(alphaAt(layers, [200, 150 - 72]), 1, 'past an edge of the turned quad')
    assert.ok(alphaAt(layers, [200 + 40, 150]) < 1, 'and inside near another')
  }
})

test('sheets deal in from alternate sides, leaning about their own top corner, and settle', () => {
  assert.deepEqual(sheetAt(0, -1), { rotation: SHEET_TILT, x: -SHEET_SHIFT }, 'from the left: turned clockwise, off to the left')
  assert.deepEqual(sheetAt(0, 1), { rotation: -SHEET_TILT, x: SHEET_SHIFT }, 'from the right: the mirror image')
  const half = sheetAt(0.5, 1)
  assert.equal(half.x, SHEET_SHIFT / 4, 'an ease-out: most of the way there by halfway')
  assert.deepEqual(sheetAt(1, -1), { rotation: 0, x: 0 })
  assert.deepEqual(sheetAt(2, 1), { rotation: 0, x: 0 })
  // Its outline while it leans: the corner it turns about stays put (bar the shift).
  const ground = { left: -50, right: 980, height: 3000 }
  assert.deepEqual(sheetOutline(ground, -1, 0, 0), [[-50, 0], [980, 0], [980, 3000], [-50, 3000]])
  const [topLeft, topRight] = sheetOutline(ground, -1, 8, -200)
  assert.deepEqual(topLeft, [-250, 0])
  assert.ok(topRight[1] > 100, 'leaning clockwise, its far corner hangs lower')
  const [, mirrorRight] = sheetOutline({ left: 40, right: 1050, height: 3000 }, 1, -8, 200)
  assert.ok(Math.abs(mirrorRight[0] - 1250) < 1e-9 && Math.abs(mirrorRight[1]) < 1e-9)
})

test('the spread row glitches only when it moves fast', () => {
  assert.equal(glitchAmount(0.25), 0, 'a slow row is calm')
  assert.equal(glitchAmount(-GLITCH_FROM), 0)
  assert.equal(glitchAmount(GLITCH_FULL), 1)
  assert.equal(glitchAmount(-20), 1, 'a flick either way is full strength, and no more')
  assert.ok(glitchAmount(2) > 0 && glitchAmount(2) < 1)
})

test('a mouse passing over a spread card pushes it its way and spins it by where it struck', () => {
  const across = kick(2.4, 0, -150, -100) // moving right, entering the upper left of the card
  assert.ok(across.vx > 0 && across.vy === 0, 'pushed along the pointer')
  assert.ok(across.vr > 0, 'struck above the middle while moving right, it turns clockwise')
  assert.ok(kick(2.4, 0, -150, 100).vr < 0, 'struck below the middle, the other way')
  assert.equal(kick(2.4, 0, -150, 0).vr, 0, 'straight through the middle, no spin')
  assert.equal(kick(2.4, 0, 0, 0).vr, 0, 'and none at the very centre')
  const flung = kick(-40, 40, 0, -200)
  assert.deepEqual([flung.vx, flung.vy, Math.abs(flung.vr)], [-PUSH_MAX, PUSH_MAX, SPIN_MAX], 'a wild sweep is capped')
})

test('a pushed card swings out, overshoots a little and comes back to rest within two seconds', () => {
  const s = { x: 0, y: 0, r: 0, ...kick(2.4, 0, -150, -100) }
  let peak = 0
  let spin = 0
  let back = 0
  let seconds = 0
  while (!atRest(s) && seconds < 3) {
    stepSpring(s, 1 / 120)
    seconds += 1 / 120
    peak = Math.max(peak, s.x)
    spin = Math.max(spin, s.r)
    back = Math.min(back, s.x)
  }
  assert.ok(peak > 20 && peak < 50, `a quick sweep pushes a card ${peak.toFixed(1)}px`)
  assert.ok(spin > 3 && spin < 15, `and turns it ${spin.toFixed(1)} degrees`)
  assert.ok(back < 0 && back > -peak / 2, 'it swings a little past its place, not back and forth')
  assert.ok(seconds < 2, `still after ${seconds.toFixed(2)}s`)
})

test('the logo wave lifts one column after another, left to right in and right to left out', () => {
  assert.equal(waveLift(0, 0), 1)
  assert.equal(waveLift(1, 0), 0)
  assert.equal(waveLift(1, WAVE_STEP), 1)
  assert.equal(waveLift(0, WAVE_HOP), 0, 'a column lands after its hop')
  assert.equal(waveLift(PIXEL_LOGO_COLS - 1, 0, false), 1, 'leaving starts at the right')
  assert.equal(waveLift(0, 0, false), 0)
})

test('every icon pixel takes a word pixel, in left-to-right order and spread across the word', () => {
  const pairs = morphPairs(150, 70)
  assert.equal(pairs.length, 70)
  assert.ok(pairs.every((p, i) => p >= 0 && p < 150 && (i === 0 || p > pairs[i - 1])))
  assert.ok(pairs[0] < 3 && pairs.at(-1) > 146, 'the icon draws from both ends of the word')
  // A short word gives some word pixels to several icon pixels.
  assert.deepEqual(morphPairs(2, 4), [0, 0, 1, 1])
})

test('only a plain click to another page of the site gets the curtain', () => {
  const here = 'https://baited.maff.app/'
  const leaves = (href, extra = {}) => leavesForPage({ href, here, ...extra })
  assert.equal(leaves('/terms'), true)
  assert.equal(leaves('/privacy?from=footer'), true)
  assert.equal(leaves('/?mark=b'), true)
  assert.equal(leaves('#how'), false)
  assert.equal(leaves('/#contact'), false)
  assert.equal(leaves('mailto:hello@irchiinnuss.com'), false)
  assert.equal(leaves('https://www.twitch.tv/komediruzecki7'), false)
  assert.equal(leaves('/terms', { target: '_blank' }), false)
  assert.equal(leaves('/terms', { target: '_self' }), true)
  assert.equal(leaves('/terms', { modified: true }), false)
  assert.equal(leaves('/terms', { download: true }), false)
  assert.equal(leaves('/terms', { optOut: true }), false)
})

test('the navigation floats once the page scrolls and folds only while scrolling down', () => {
  let state = navState({ y: 0, lastY: 0, folded: false })
  assert.deepEqual(state, { floating: false, folded: false })
  state = navState({ y: FLOAT_AT + 20, lastY: 0, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: false })
  state = navState({ y: FOLD_AT + 200, lastY: FOLD_AT + 100, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: true })
  state = navState({ y: FOLD_AT + 202, lastY: FOLD_AT + 200, folded: state.folded })
  assert.equal(state.folded, true, 'a little jitter changes nothing')
  state = navState({ y: FOLD_AT + 150, lastY: FOLD_AT + 202, folded: state.folded })
  assert.deepEqual(state, { floating: true, folded: false })
  state = navState({ y: 10, lastY: 400, folded: true })
  assert.deepEqual(state, { floating: false, folded: false })
  // The footer has its own buttons: the bar steps away once the footer reaches the top.
  assert.equal(navAway(900), false)
  assert.equal(navAway(AWAY_AT + 1), false)
  assert.equal(navAway(AWAY_AT), true)
  assert.equal(navAway(-400), true)
})

test('only ordinary spaces split words', () => {
  assert.deepEqual(splitWords('One word.'), ['One word.'])
  assert.deepEqual(splitWords('say it. Now'), ['say it.', ' ', 'Now'])
  assert.deepEqual(splitWords('  two\n words '), ['  ', 'two', '\n ', 'words', ' '])
})

test('the drawn scrollbar thumb is as long as the screen is of the page, and travels with it', () => {
  assert.equal(thumbFor({ top: 0, view: 900, content: 900 }), null, 'a page that fits has no thumb')
  assert.deepEqual(thumbFor({ top: 0, view: 900, content: 3600 }), { size: 225, offset: 0 })
  assert.deepEqual(thumbFor({ top: 2700, view: 900, content: 3600 }), { size: 225, offset: 675 }, 'at the bottom it reaches the bottom')
  assert.deepEqual(thumbFor({ top: 99999, view: 900, content: 3600 }), { size: 225, offset: 675 })
  assert.equal(thumbFor({ top: 0, view: 654, content: 500000 }).size, THUMB_MIN, 'a very long page keeps a grabbable thumb')
})

test('highlighter bars cover each line of words from its first word to its last', () => {
  const word = (left, top, right) => ({ left, top, right, bottom: top + 24 })
  // Two lines; the second line's words sit 30px lower, one a pixel off its neighbours.
  const lines = lineBoxes([word(0, 0, 50), word(58, 0, 120), word(128, 1, 200), word(0, 30, 80), word(88, 31, 140)])
  assert.deepEqual(lines, [
    { left: 0, top: 0, right: 200, bottom: 25 },
    { left: 0, top: 30, right: 140, bottom: 55 },
  ])
  assert.deepEqual(lineBoxes([]), [])
  assert.equal(lineBoxes([word(0, 0, 10), word(0, 13, 10)]).length, 2, 'more than half a line lower is the next line')
  // A picture that opens a line (the footer's avatar) sits lower than the letters beside it; the
  // bar still starts at the top of the letters.
  assert.deepEqual(lineBoxes([{ left: 0, top: 10, right: 30, bottom: 34 }, word(40, 2, 90)]), [{ left: 0, top: 2, right: 90, bottom: 34 }])
})

test('every page eases the wheel with Lenis, self-hosted, after GSAP on the home page', async () => {
  assert.deepEqual({ ...LENIS_OPTIONS }, { lerp: 0.165, wheelMultiplier: 1.25 }, 'the chosen settings')
  const site = new URL('../site/', import.meta.url)
  assert.match(await readFile(new URL('vendor/lenis/lenis.min.js', site), 'utf8'), /^\(function\(\)\{var e=`1\.3\.23`/, 'Lenis 1.3.23, unchanged')
  for (const page of ['index.html', 'terms/index.html', 'privacy/index.html']) {
    const html = await readFile(new URL(page, site), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    assert.match(head, /<link rel="stylesheet" href="\/vendor\/lenis\/lenis\.css" \/>/, `${page} has Lenis's styles`)
    assert.match(head, /<script defer src="\/vendor\/lenis\/lenis\.min\.js"><\/script>/, `${page} loads Lenis`)
  }
  const home = await readFile(new URL('index.html', site), 'utf8')
  const order = ['/vendor/gsap/ScrollTrigger.min.js', '/vendor/lenis/lenis.min.js', '/app.js'].map((src) => home.indexOf(`src="${src}"`))
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'Lenis after GSAP, and both before app.js starts it')
})

test("Lenis runs on GSAP's ticker, tells ScrollTrigger of every scroll and leaves GSAP its lag smoothing", () => {
  const saved = { matchMedia: globalThis.matchMedia, addEventListener: globalThis.addEventListener }
  const listeners = []
  globalThis.matchMedia = () => ({ matches: false })
  globalThis.addEventListener = (type) => listeners.push(type)
  try {
    const calls = []
    class Lenis {
      constructor(options) {
        this.options = options
      }
      on(event, listener) {
        calls.push(['on', event, listener])
      }
      raf(time) {
        calls.push(['raf', time])
      }
    }
    let tick = null
    const gsap = { ticker: { add: (listener) => (tick = listener), lagSmoothing: (...args) => calls.push(['lagSmoothing', ...args]) } }
    const ScrollTrigger = { update() {} }
    const lenis = initSmoothScroll({ Lenis, gsap, ScrollTrigger })
    assert.deepEqual(lenis.options, { ...LENIS_OPTIONS, autoRaf: false }, 'driven by the ticker, not its own frames')
    tick(2.5)
    assert.deepEqual(calls, [['on', 'scroll', ScrollTrigger.update], ['lagSmoothing', 500, 33], ['raf', 2500]])
    assert.deepEqual(listeners, ['scroll'], 'it watches for scrolls not its own')
    assert.equal(initSmoothScroll({ Lenis, gsap, ScrollTrigger }), lenis, 'one a page')
  } finally {
    Object.assign(globalThis, saved)
  }
})

test('a scroll Lenis did not make takes over from its easing, and every trip sets off from where the page is', () => {
  const calls = []
  const lenis = (isScrolling, animatedScroll) => ({ isScrolling, animatedScroll, scrollTo: (y, options) => calls.push([y, options]) })
  yieldToOtherScrolls(lenis('smooth', 2018.4), 2019) // its own frame, rounded by the browser
  yieldToOtherScrolls(lenis('smooth', 2018.4), 6000) // a script's jump while it eased
  yieldToOtherScrolls(lenis(false, 2018), 6000) // at rest Lenis follows the page's events by itself
  yieldToOtherScrolls(lenis('native', 2018), 6000)
  assert.deepEqual(calls.splice(0), [[6000, { immediate: true }]])
  // A click before the event of a jump to the foot of the page: Lenis is brought there first.
  catchUp(lenis(false, 5064), 6405)
  catchUp(lenis(false, 5064), 5065)
  assert.deepEqual(calls, [[6405, { immediate: true }]])
})

test('every page loads the curtain early, and nothing on the site is yellow', async () => {
  const site = new URL('../site/', import.meta.url)
  for (const page of ['index.html', 'terms/index.html', 'privacy/index.html']) {
    const html = await readFile(new URL(page, site), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    assert.match(head, /<script src="\/pixel-boot\.js"><\/script>/, `${page} covers the first paint`)
    assert.match(head, /<script type="module" src="\/pixels\.js"><\/script>/, `${page} clears the curtain`)
    assert.match(head, /<link rel="stylesheet" href="\/pixels\.css" \/>/, `${page} styles the curtain`)
  }
  const files = (await readdir(site)).filter((name) => /\.(css|js|html)$/.test(name))
  files.push('terms/index.html', 'privacy/index.html')
  for (const name of files) {
    const text = await readFile(new URL(name, site), 'utf8')
    assert.doesNotMatch(text, /#fffc79|--yellow|255 252 121/i, `${name} still uses the old yellow`)
  }
})
