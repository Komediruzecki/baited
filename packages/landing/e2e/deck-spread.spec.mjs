import { test, expect } from 'playwright/test'

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
        probe.events.push({ type, trusted: event.isTrusted, pointerType: event.pointerType, target: event.target.matches('.card-word') ? 'word' : event.target.id === 'deck-hand' ? 'hand' : 'other' })
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
  await touch(client, 'touchStart', start)
  const steps = duration < 260 ? 6 : 20
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
    expect(state).toMatchObject({ glass: 1, reveals: 0, total: 78, overflow: false })
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
    await dragTouch(page, client, { duration: 150 })
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('BANANA')
    expect(await mode(page)).toBe('fan')
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-ribbon-open|is-dragging/)
    expect((await inspectSpread(page)).events.every(event => event.trusted)).toBe(true)
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('390px: trusted pointer cancellation folds the ribbon and leaves no drift running', async ({ browser }, testInfo) => {
  const { context, page, errors, client } = await prepareDeck(browser, testInfo.project.use.baseURL, { width: 390, height: 844, touch: true })
  try {
    await dragTouch(page, client, { end: false })
    await expect(page.locator('#deck-hand')).toHaveClass(/is-ribbon-open/)
    await touch(client, 'touchCancel')
    await expect.poll(() => mode(page)).toBe('fan')
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-ribbon-open|is-dragging/)
    const before = (await inspectSpread(page)).transforms
    await page.waitForTimeout(1000)
    expect((await inspectSpread(page)).transforms).toEqual(before)
    expect((await inspectSpread(page)).events).toContainEqual(expect.objectContaining({ type: 'pointercancel', trusted: true }))
    expect(errors).toEqual([])
  } finally { await context.close() }
})

test('mouse opening drifts, Pause holds still, and Play resumes without hover pausing', async ({ browser }, testInfo) => {
  const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    await page.getByRole('button', { name: 'spread the deck', exact: true }).click()
    await expect.poll(() => mode(page)).toBe('cruise')
    const before = await position(page)
    const started = Date.now()
    await page.waitForTimeout(2000)
    const elapsed = (Date.now() - started) / 1000
    const speed = ((await position(page)) - before) / elapsed
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
    await expect(page.locator('#deck-status')).toHaveText('BANANA, easy. Card 2 of 78.')
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
  test(`${width}x${height}: paused faces fit between help and difficulty key with one Glass lens`, async ({ browser }, testInfo) => {
    const { context, page, errors } = await prepareDeck(browser, testInfo.project.use.baseURL, { width, height })
    try {
      await openPaused(page)
      await decodeFaces(page)
      const state = await inspectSpread(page)
      expect(state).toMatchObject({ mode: 'paused', openness: 1, glass: 1, total: 78, reveals: 0, overflow: false })
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
    expect(desktop).toMatchObject({ glass: 1, overflow: false, reveals: 0 })
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
