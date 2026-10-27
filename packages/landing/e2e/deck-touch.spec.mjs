import { test, expect } from 'playwright/test'

async function prepareDeck(browser, baseURL) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${baseURL}/#cards`)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('VOLCANO')
    await page.evaluate(() => {
      const pin = ScrollTrigger.getAll().find(trigger => trigger.pin?.matches('.deck-section'))
      const wipe = ScrollTrigger.getAll().find(trigger => trigger.trigger?.matches('.site-footer') && trigger.vars.onUpdate)
      if (!pin || !wipe) throw new Error('The motion-enabled deck pin and footer wipe must be ready')
      scrollTo({ top: (pin.start + wipe.start) / 2, behavior: 'instant' })
    })
    await expect(page.locator('#deck-hand')).toHaveClass(/is-live/)
    await expect.poll(() => page.locator('.deck-card-item.is-front .card-art img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.locator('.deck-card-item.is-front .card-art img').evaluate(image => image.decode())
    // Let the image-load and visibility callbacks start the initial reveal before
    // waiting for it to finish; that reveal is not part of the tested gesture.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.locator('.deck-card-item .card-art.is-resolving')).toHaveCount(0)
    await page.evaluate(() => {
      const hand = document.querySelector('#deck-hand')
      const state = window.__deckTouchProbe = {
        pointerId: null, events: [], frontWords: ['VOLCANO'],
        maxFronts: 1, maxImages: 0, maxReveals: 0, revealStarts: 0, revealing: 0,
      }
      const observe = () => {
        const word = hand.querySelector('.is-front .card-word')?.textContent.trim()
        if (word && word !== state.frontWords.at(-1)) state.frontWords.push(word)
        const revealing = hand.querySelectorAll('.card-art.is-resolving').length
        if (revealing > state.revealing) state.revealStarts += revealing - state.revealing
        state.revealing = revealing
        state.maxReveals = Math.max(state.maxReveals, revealing)
        state.maxFronts = Math.max(state.maxFronts, hand.querySelectorAll('.is-front').length)
        state.maxImages = Math.max(state.maxImages, hand.querySelectorAll('.card-art img[src]').length)
      }
      observe()
      new MutationObserver(observe).observe(hand, { subtree: true, attributes: true, attributeFilter: ['class', 'src'] })
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
        document.addEventListener(type, event => {
          if (!event.target.closest?.('#deck-hand')) return
          if (type === 'pointerdown') state.pointerId = event.pointerId
          state.events.push({
            type, trusted: event.isTrusted, pointerType: event.pointerType,
            target: event.target.id === 'deck-hand' ? 'hand' : event.target.matches('.card-word') ? 'word' : 'other',
            defaultPrevented: event.defaultPrevented,
          })
        })
      }
    })
    const word = await page.locator('.deck-card-item.is-front .card-word').boundingBox()
    const card = await page.locator('.deck-card-item.is-front').boundingBox()
    const start = { x: word.x + word.width / 2, y: word.y + word.height / 2 }
    expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.matches('span.card-word'), start)).toBe(true)
    return { context, page, errors, start, cardWidth: card.width, client: await context.newCDPSession(page) }
  } catch (error) {
    await context.close()
    throw error
  }
}

async function sendTouch(client, type, point) {
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: point ? [{ id: 1, x: point.x, y: point.y }] : [],
  })
}

async function deckState(page) {
  return page.evaluate(() => {
    const hand = document.querySelector('#deck-hand')
    const visible = element => {
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
      }
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
    }
    return {
      front: hand.querySelector('.is-front .card-word')?.textContent.trim(),
      frontCount: hand.querySelectorAll('.is-front').length,
      dragging: hand.classList.contains('is-dragging'),
      captures: hand.hasPointerCapture(window.__deckTouchProbe.pointerId),
      glass: [...hand.querySelectorAll('.deck-card-item:not(.is-out) g[filter]')].filter(visible).length,
      images: hand.querySelectorAll('.card-art img[src]').length,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      ...window.__deckTouchProbe,
    }
  })
}

test('trusted touch keeps dragging when implicit capture transfers from the word to the deck', async ({ browser }, testInfo) => {
  const { context, page, errors, start, cardWidth, client } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    expect(await deckState(page)).toMatchObject({ front: 'VOLCANO', images: 7, glass: 1, overflow: false })
    await sendTouch(client, 'touchStart', start)
    for (let step = 1; step <= 12; step++) {
      await page.waitForTimeout(15)
      await sendTouch(client, 'touchMove', { x: start.x - cardWidth * .2 * step / 12, y: start.y })
      if (step === 3) {
        // A descendant's lostpointercapture bubbles when capture moves to the
        // hand. It must not end the active drag before the finger is released.
        const state = await deckState(page)
        expect(state.events).toContainEqual(expect.objectContaining({ type: 'lostpointercapture', target: 'word', trusted: true }))
        expect(state).toMatchObject({ dragging: true, captures: true, glass: 1 })
      }
    }
    await sendTouch(client, 'touchEnd')
    await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText('BANANA')
    await expect(page.locator('#deck-hand')).not.toHaveClass(/is-dragging/)
    await expect.poll(async () => (await deckState(page)).revealStarts).toBe(1)
    await expect(page.locator('.deck-card-item .card-art.is-resolving')).toHaveCount(0)
    const state = await deckState(page)
    expect(state).toMatchObject({ front: 'BANANA', frontCount: 1, maxFronts: 1, captures: false, glass: 1, images: 7, maxImages: 7, maxReveals: 1, revealStarts: 1, overflow: false })
    expect(state.frontWords).toEqual(['VOLCANO', 'BANANA'])
    expect(state.events.filter(event => event.type === 'pointerup')).toHaveLength(1)
    expect(state.events.every(event => event.trusted && event.pointerType === 'touch')).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('a mostly vertical trusted touch gesture scrolls the page without changing the card', async ({ browser }, testInfo) => {
  const { context, page, errors, start, client } = await prepareDeck(browser, testInfo.project.use.baseURL)
  try {
    const before = await page.evaluate(() => scrollY)
    await sendTouch(client, 'touchStart', start)
    for (let step = 1; step <= 8; step++) {
      await page.waitForTimeout(20)
      await sendTouch(client, 'touchMove', { x: start.x + step * .5, y: start.y - step * 15 })
    }
    await sendTouch(client, 'touchEnd')
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 30)
    const state = await deckState(page)
    expect(state).toMatchObject({ front: 'VOLCANO', frontCount: 1, dragging: false, captures: false, images: 7, maxImages: 7, revealStarts: 0, overflow: false })
    expect(state.frontWords).toEqual(['VOLCANO'])
    expect(state.events.filter(event => event.type === 'pointermove').every(event => !event.defaultPrevented)).toBe(true)
    expect(state.events.every(event => event.trusted && event.pointerType === 'touch')).toBe(true)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})
