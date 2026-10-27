import { test, expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'

async function parkInDeckPin(page) {
  await page.evaluate(() => {
    const pin = ScrollTrigger.getAll().find(trigger => trigger.pin?.matches('.deck-section'))
    const wipe = ScrollTrigger.getAll().find(trigger => trigger.trigger?.matches('.site-footer') && trigger.vars.onUpdate)
    if (!pin || !wipe) throw new Error('The deck pin and footer wipe must be ready')
    scrollTo({ top: (pin.start + wipe.start) / 2, behavior: 'instant' })
  })
}

async function prepareDeck(browser, baseURL, { width = 1440, height = 900, touch = false, reduced = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${baseURL}/?spread-debug#cards`)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('VOLCANO')
    await expect.poll(() => page.evaluate(() => !!window.__baitedSpread)).toBe(true)
    if (reduced) {
      await page.locator('#deck-hand').evaluate(hand => hand.scrollIntoView({ block: 'center', behavior: 'instant' }))
    } else {
      await parkInDeckPin(page)
    }
    await expect(page.locator('#deck-hand')).toHaveClass(/is-live/)
    await expect.poll(() => page.locator('.deck-card-item.is-front .card-art img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.locator('.deck-card-item.is-front .card-art img').evaluate(image => image.decode())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.locator('.deck-card-item .card-art.is-resolving')).toHaveCount(0)
    await page.evaluate(() => {
      const probe = window.__ribbonProbe = { events: [], status: [] }
      const status = document.querySelector('#deck-status')
      new MutationObserver(records => { for (const record of records) if (record.type === 'childList' || record.type === 'characterData') probe.status.push(status.textContent) }).observe(status, { childList: true, characterData: true, subtree: true })
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => {
        if (!event.target.closest?.('#deck-hand')) return
        probe.events.push({ type, trusted: event.isTrusted, pointerType: event.pointerType, target: event.target.matches('.card-word') ? 'word' : event.target.id === 'deck-hand' ? 'hand' : 'other', time: performance.now(), inputTime: event.timeStamp, x: event.clientX, mode: window.__baitedSpread.mode, position: window.__baitedSpread.position })
      })
    })
    return { context, page, errors, client: touch ? await context.newCDPSession(page) : null }
  } catch (error) {
    await context.close()
    throw error
  }
}

const mode = page => page.evaluate(() => window.__baitedSpread.mode)
const position = page => page.evaluate(() => window.__baitedSpread.position)

async function openPaused(page) {
  const toggle = page.getByRole('button', { name: 'spread the deck', exact: true })
  await toggle.focus()
  await toggle.press('Enter')
  await expect.poll(() => mode(page)).toBe('paused')
  await expect.poll(() => page.evaluate(() => window.__baitedSpread.openness)).toBe(1)
  await expect(page.getByRole('button', { name: 'Back to the deck', exact: true })).toBeFocused()
}

async function decodeFaces(page) {
  await expect.poll(() => page.locator('.deck-card-item.is-ribbon-face:not(.is-out) .card-art img').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
  await page.locator('.deck-card-item.is-ribbon-face:not(.is-out) .card-art img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
}

async function inspectSpread(page) {
  return page.evaluate(() => {
    const hand = document.querySelector('#deck-hand')
    const painted = element => {
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
    }
    const rect = element => { const value = element.getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height } }
    const cards = [...hand.querySelectorAll('.deck-card-item:not(.is-out)')]
    return {
      mode: window.__baitedSpread.mode,
      openness: window.__baitedSpread.openness,
      position: window.__baitedSpread.position,
      glass: [...hand.querySelectorAll('g[filter]')].filter(painted).length,
      faces: hand.querySelectorAll('.deck-card-item.is-ribbon-face:not(.is-out)').length,
      images: hand.querySelectorAll('.card-art img[src]').length,
      reveals: hand.querySelectorAll('.card-art.is-resolving').length,
      total: hand.querySelectorAll('.deck-card-item').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      cards: cards.map(item => ({ word: item.querySelector('.card-word').textContent, box: rect(item) })),
      help: rect(document.querySelector('#deck-help')),
      levels: rect(document.querySelector('.card-levels')),
      clueFonts: [...hand.querySelectorAll('.is-ribbon-lens [data-clue-word]')].map(clue => parseFloat(getComputedStyle(clue).fontSize)),
      transforms: [...hand.querySelectorAll('.deck-card-item')].map(item => item.style.transform),
      events: window.__ribbonProbe.events,
      announcements: window.__ribbonProbe.status,
    }
  })
}

async function touch(client, type, point) {
  await client.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ id: 1, x: point.x, y: point.y }] : [] })
}

async function dragTouch(page, client, { distance = 260, duration = 600, end = true } = {}) {
  const word = await page.locator('.deck-card-item.is-front .card-word').boundingBox()
  const start = { x: word.x + word.width - 8, y: word.y + word.height / 2 }
  expect(start.x - distance, 'the finger path stays inside the physical viewport').toBeGreaterThanOrEqual(8)
  expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.matches('.card-word'), start)).toBe(true)
  if (duration < 260 && end) {
    // Let Chromium schedule this fast, trusted gesture. Serial protocol calls
    // include paint/transport cost and can turn 150ms into a 700ms slow drag.
    await client.send('Input.synthesizeScrollGesture', {
      ...start, xDistance: -distance, speed: Math.round(distance / (duration / 1000)),
      gestureSourceType: 'touch', preventFling: false,
    })
    return
  }
  await touch(client, 'touchStart', start)
  const steps = 20
  for (let index = 1; index <= steps; index++) {
    // These intervals author the gesture's speed, not a readiness workaround.
    await page.waitForTimeout(duration / steps)
    await touch(client, 'touchMove', { x: start.x - distance * index / steps, y: start.y })
  }
  if (end) await touch(client, 'touchEnd')
}

test('390px: a deliberate trusted touch opens the ribbon without descendant capture loss ending the drag', async ({ browser }, testInfo) => {
  const { context, page, errors, client } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, touch: true })
  try {
    await dragTouch(page, client)
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.openness)).toBe(1)
    await page.getByRole('button', { name: 'Pause', exact: true }).tap()
    await expect.poll(() => mode(page)).toBe('paused')
    await decodeFaces(page)
    const state = await inspectSpread(page)
    expect(state).toMatchObject({ glass: 0, reveals: 0, total: 10, overflow: false })
    expect(state.images).toBeLessThanOrEqual(state.cards.length + 6)
    expect(state.events).toContainEqual(expect.objectContaining({ type: 'lostpointercapture', target: 'word', trusted: true }))
    expect(state.events.filter(event => event.type === 'pointerup')).toHaveLength(1)
    expect(state.events.every(event => event.trusted && event.pointerType === 'touch')).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('390px: a fast large trusted swipe stays an ordinary fan flick', async ({ browser }, testInfo) => {
  const { context, page, errors, client } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, touch: true })
  try {
    const cpuRate = Number(process.env.BAITED_TOUCH_CPU_RATE || 1)
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await dragTouch(page, client, { duration: 150 })
    const gesture = await page.evaluate(() => window.__ribbonProbe.events)
    const down = gesture.find(event => event.type === 'pointerdown')
    const up = gesture.find(event => event.type === 'pointerup')
    const moves = gesture.filter(event => event.type === 'pointermove')
    const measured = { cpuRate, requestedDurationMs: 150, handledDurationMs: up.time - down.time, inputDurationMs: up.inputTime - down.inputTime, movingDurationMs: moves.at(-1).inputTime - moves[0].inputTime, finalMode: await mode(page), finalPosition: await position(page), events: gesture }
    await writeFile(testInfo.outputPath('fast-touch-timing.json'), JSON.stringify(measured, null, 2))
    console.log('fast-touch-timing', JSON.stringify({ ...measured, events: undefined }))
    expect(measured.inputDurationMs, 'the trusted input remains a fast gesture under CPU load').toBeLessThan(260)
    expect(moves.every(event => event.x >= 8 && event.x <= 382), 'the native touch path stays inside the physical viewport').toBe(true)
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('BANANA')
    expect(await mode(page)).toBe('fan')
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-ribbon-open|is-dragging/)
    expect((await inspectSpread(page)).events.every(event => event.trusted)).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('390px: trusted pointer cancellation pauses the ribbon without gathering or leaving drift running', async ({ browser }, testInfo) => {
  const { context, page, errors, client } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, touch: true })
  try {
    await dragTouch(page, client, { end: false })
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    await touch(client, 'touchCancel')
    await expect.poll(() => mode(page)).toBe('paused')
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-dragging/)
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.openness)).toBe(1)
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.moving)).toBe(false)
    const before = (await inspectSpread(page)).transforms
    await page.waitForTimeout(1000)
    expect((await inspectSpread(page)).transforms).toEqual(before)
    expect((await inspectSpread(page)).events).toContainEqual(expect.objectContaining({ type: 'pointercancel', trusted: true }))
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('390px: a small vertical touch scroll keeps the spread open and leaves page scrolling native', async ({ browser }, testInfo) => {
  const { context, page, errors, client } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, touch: true })
  try {
    await openPaused(page)
    const word = await page.locator('.deck-card-item.is-ribbon-lens .card-word').boundingBox()
    const start = { x: word.x + word.width / 2, y: word.y + word.height / 2 }
    const before = await page.evaluate(() => scrollY)
    await touch(client, 'touchStart', start)
    for (let step = 1; step <= 8; step++) {
      // These intervals author a normal vertical finger gesture.
      await page.waitForTimeout(20)
      await touch(client, 'touchMove', { x: start.x + step * .5, y: start.y - step * 12 })
    }
    await touch(client, 'touchEnd')
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30)
    await expect.poll(() => mode(page)).toBe('paused')
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-dragging/)
    const events = (await inspectSpread(page)).events
    expect(events).toContainEqual(expect.objectContaining({ type: 'pointercancel', trusted: true }))
    expect(events.filter(event => event.type === 'pointermove').every(event => !event.defaultPrevented)).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('the footer can enter without gathering until it covers half the spread card', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    await openPaused(page)
    const cover = fraction => page.evaluate(fraction => {
      const card = document.querySelector('.deck-card-item.is-ribbon-lens').getBoundingClientRect()
      const footer = document.querySelector('.site-footer').getBoundingClientRect()
      scrollBy({ top: footer.top - (card.top + card.height * fraction), behavior: 'instant' })
    }, fraction)
    await cover(.8)
    await expect.poll(() => page.evaluate(() => document.querySelector('.site-footer').getBoundingClientRect().top)).toBeLessThan(900)
    // The observer has had a paint to deliver the entering-footer event.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await mode(page)).toBe('paused')
    await cover(.4)
    await expect.poll(() => mode(page)).toBe('fan')
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.moving)).toBe(false)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('a static spread stays open above half visibility and gathers below it while scrolling upward', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, reduced: true })
  try {
    await openPaused(page)
    const show = fraction => page.evaluate(fraction => {
      const card = document.querySelector('.deck-card-item.is-ribbon-lens').getBoundingClientRect()
      scrollBy({ top: card.top - (innerHeight - card.height * fraction), behavior: 'instant' })
    }, fraction)
    await show(.6)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await mode(page)).toBe('paused')
    await show(.4)
    await expect.poll(() => mode(page)).toBe('fan')
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('moving the mouse away during a small wheel scroll does not dismiss a visible spread', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    await openPaused(page)
    const before = await page.evaluate(() => scrollY)
    await page.mouse.move(20, 100)
    await page.mouse.wheel(0, -50)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before - 30)
    // Outlast the old 700ms mouse-leave dismissal, rather than only checking
    // before that erroneous timeout could have fired.
    await page.waitForTimeout(800)
    expect(await mode(page)).toBe('paused')
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('mouse opening drifts, Pause holds still, and Play resumes without hover pausing', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    const cpuRate = Number(process.env.BAITED_TOUCH_CPU_RATE || 1)
    await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
    await page.getByRole('button', { name: 'spread the deck', exact: true }).click()
    await expect.poll(() => mode(page)).toBe('cruise')
    const before = await page.evaluate(() => ({ position: window.__baitedSpread.position, at: performance.now() }))
    await page.waitForTimeout(2000)
    const afterDrift = await page.evaluate(() => ({ position: window.__baitedSpread.position, at: performance.now() }))
    const elapsed = (afterDrift.at - before.at) / 1000
    const speed = (afterDrift.position - before.position) / elapsed
    await writeFile(testInfo.outputPath('cruise-timing.json'), JSON.stringify({ cpuRate, before, after: afterDrift, elapsedSeconds: elapsed, cardsPerSecond: speed }, null, 2))
    expect(speed).toBeGreaterThanOrEqual(0.22)
    expect(speed).toBeLessThanOrEqual(0.28)
    expect((await inspectSpread(page)).announcements).toEqual([])
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect.poll(() => mode(page)).toBe('paused')
    const paused = await inspectSpread(page)
    await page.waitForTimeout(1000)
    const after = await inspectSpread(page)
    expect(after.position).toBe(paused.position)
    expect(after.transforms).toEqual(paused.transforms)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => position(page)).toBeGreaterThan(paused.position + 0.05)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('keyboard opens paused, arrows announce once, and Escape gathers the nearest card without moving focus', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    await openPaused(page)
    await expect(page.locator('#deck-status')).toHaveText('Deck spread out. Use the arrow keys to move along it and Escape to gather it.')
    await page.evaluate(() => { window.__ribbonProbe.status.length = 0 })
    const toggle = page.getByRole('button', { name: 'Back to the deck', exact: true })
    await toggle.press('ArrowRight')
    await expect.poll(() => mode(page)).toBe('paused')
    await expect.poll(() => position(page)).toBe(1)
    await expect(page.locator('#deck-status')).toHaveText('BANANA, easy. Card 2 of 10.')
    expect((await inspectSpread(page)).announcements).toHaveLength(1)
    const nearest = Math.round(await position(page))
    await page.evaluate(() => { window.__ribbonProbe.status.length = 0 })
    await toggle.press('Escape')
    await expect.poll(() => mode(page)).toBe('fan')
    expect(await position(page)).toBe(nearest)
    expect((await inspectSpread(page)).announcements).toHaveLength(1)
    await expect(page.getByRole('button', { name: 'spread the deck', exact: true })).toBeFocused()
    expect(errors).toEqual([])
  } finally { await context.close() }
})

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900], [3440, 1440]]) {
  test(`${width}x${height}: paused Cut Open faces fit between help and difficulty key without inner lenses`, async ({ browser }, testInfo) => {
    const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL, { width, height })
    try {
      await openPaused(page)
      await decodeFaces(page)
      const state = await inspectSpread(page)
      expect(state).toMatchObject({ mode: 'paused', openness: 1, glass: 0, total: 10, reveals: 0, overflow: false })
      expect(state.faces).toBe(state.cards.length)
      expect(state.cards.length).toBeGreaterThanOrEqual(3)
      expect(state.cards.length).toBeLessThanOrEqual(13)
      expect(state.images).toBeLessThanOrEqual(state.cards.length + 6)
      expect(state.clueFonts.length).toBe(2)
      for (const fontSize of state.clueFonts) expect(fontSize).toBeGreaterThanOrEqual(12)
      for (const card of state.cards) {
        expect(card.box.top, `${card.word}: top remains below the help`).toBeGreaterThanOrEqual(state.help.bottom)
        expect(card.box.bottom, `${card.word}: bottom stays above the difficulty key`).toBeLessThanOrEqual(state.levels.top - 8)
      }
      await testInfo.attach('spread-geometry.json', { body: Buffer.from(JSON.stringify(state, null, 2)), contentType: 'application/json' })
      await page.screenshot({ path: testInfo.outputPath(`spread-${width}.png`) })
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}

test('responsive resizing gathers an offscreen phone spread safely and reopening warms every desktop face', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844 })
  try {
    await openPaused(page)
    await decodeFaces(page)
    const phone = await inspectSpread(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.metrics.room)).toBeGreaterThan(1000)
    // The real responsive pin refresh moves this section offscreen. The row
    // must gather there, rather than keep drawing a hidden spread.
    await expect.poll(() => mode(page)).toBe('fan')
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-ribbon-open|is-ribbon-changing|is-dragging/)
    expect(await position(page)).toBe(Math.round(phone.position))
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.moving)).toBe(false)
    await parkInDeckPin(page)
    await expect(page.locator('#deck-hand')).toHaveClass(/is-live/)
    await openPaused(page)
    await decodeFaces(page)
    const desktop = await inspectSpread(page)
    expect(desktop.position).toBe(phone.position)
    expect(desktop.faces).toBeGreaterThan(phone.faces)
    expect(desktop).toMatchObject({ glass: 0, overflow: false, reveals: 0 })
    expect(await page.locator('.deck-card-item.is-ribbon-face:not(.is-out) .card-art img').evaluateAll(images => images.every(image => !!image.getAttribute('src') && image.complete && image.naturalWidth > 0))).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('reduced motion opens a static spread and uses instant keyboard navigation and gathering', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, reduced: true })
  try {
    await openPaused(page)
    await expect(page.locator('.ribbon-play')).toBeHidden()
    const before = await inspectSpread(page)
    await page.waitForTimeout(1000)
    expect((await inspectSpread(page)).transforms).toEqual(before.transforms)
    expect(await page.locator('#deck-hand').evaluate(hand => hand.getAnimations({ subtree: true }).length)).toBe(0)
    const toggle = page.getByRole('button', { name: 'Back to the deck', exact: true })
    await toggle.press('ArrowRight')
    expect(await position(page)).toBe(1)
    expect(await mode(page)).toBe('paused')
    await toggle.press('Escape')
    expect(await mode(page)).toBe('fan')
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('BANANA')
    expect(errors).toEqual([])
  } finally { await context.close() }
})
