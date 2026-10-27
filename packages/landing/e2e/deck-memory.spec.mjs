import { test, expect } from 'playwright/test'

// Browsing a finite catalogue must not retain a full-resolution image for every
// card visited. This checks resource ownership, not a device-specific RAM limit.
test('390px: repeated fan and ribbon browsing keeps artwork and promotion hints bounded', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${testInfo.project.use.baseURL}/?spread-debug#cards`)
    await page.waitForFunction(() => !!window.__baitedSpread)
    await page.evaluate(() => {
      const pin = ScrollTrigger.getAll().find(trigger => trigger.pin?.matches('.deck-section'))
      const wipe = ScrollTrigger.getAll().find(trigger => trigger.trigger?.matches('.site-footer') && trigger.vars.onUpdate)
      scrollTo({ top: (pin.start + wipe.start) / 2, behavior: 'instant' })
    })
    await expect(page.locator('#deck-hand')).toHaveClass(/is-live/)
    const inspect = () => page.evaluate(() => ({
      sources: document.querySelectorAll('.deck-card-item .card-art img[src]').length,
      promoted: [...document.querySelectorAll('.deck-card-item.is-out')].filter(item => getComputedStyle(item).willChange !== 'auto').length,
      paintedHidden: [...document.querySelectorAll('.deck-card-item.is-out .selected-card__back, .deck-card-item.is-out .card-art')].filter(item => item.checkVisibility({ visibilityProperty: true })).length,
    }))
    // The real fan controller settles at every visited card; no forced image
    // decode, synthetic resource eviction or browser memory override is used.
    for (let index = 0; index < 78; index++) {
      await page.evaluate(index => { window.__baitedSpread.to(index, { deliberate: true }); window.__baitedSpread.finish() }, index)
    }
    expect((await inspect()).sources, 'fan retains only its seven-card artwork window').toBeLessThanOrEqual(7)
    expect((await inspect()).promoted, 'offscreen cards must not reserve transform layers').toBe(0)
    expect((await inspect()).paintedHidden, 'hidden card children must not override their parent visibility').toBe(0)
    await page.evaluate(() => window.__baitedSpread.spread({ paused: true }))
    await expect.poll(() => page.evaluate(() => window.__baitedSpread.mode)).toBe('paused')
    for (let index = 0; index < 78; index += 3) {
      await page.evaluate(index => {
        const deck = window.__baitedSpread
        const start = deck.hold()
        const metrics = deck.metrics
        const pitch = .8 * metrics.width + (metrics.width <= 260 ? 12 : Math.round(metrics.width * .067))
        deck.drag(start + (index - start) * pitch * metrics.zoom / deck.dragUnit())
        deck.finish()
      }, index)
    }
    expect((await inspect()).sources, 'ribbon retains only its visible window and small lookahead').toBeLessThanOrEqual(8)
    expect((await inspect()).paintedHidden, 'the ribbon must also hide offscreen faces and backs').toBe(0)
    await page.evaluate(() => window.__baitedSpread.gather({ instant: true }))
    expect((await inspect()).sources).toBeLessThanOrEqual(7)
    const front = page.locator('.deck-card-item.is-front .card-art img')
    await expect.poll(() => front.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
    expect(await front.evaluate(image => Math.max(image.naturalWidth, image.naturalHeight)), 'landing requests display-sized artwork').toBeLessThanOrEqual(640)
    expect(errors).toEqual([])
  } finally { await context.close() }
})
