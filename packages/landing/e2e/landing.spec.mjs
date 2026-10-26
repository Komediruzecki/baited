import { test, expect } from 'playwright/test'

const layouts = [
  { width: 320, height: 568, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 840, height: 900, touch: false },
  { width: 1440, height: 900, touch: false },
  { width: 1920, height: 1080, touch: false },
  { width: 390, height: 844, touch: true, reduced: true },
  { width: 1440, height: 900, touch: false, reduced: true },
]

for (const { width, height, touch, reduced = false } of layouts) {
  test(`${width}x${height}${reduced ? ' reduced motion' : ''}: layout, readable deck and footer navigation`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await page.goto(testInfo.project.use.baseURL)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('.why-vtg')).toHaveClass(/why-motion-ready/)
      await expect(page.locator('.pixel-curtain')).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

      if (width <= 700) {
        const button = await page.locator('.hero-cta').boundingBox()
        const icon = await page.locator('.hero-cta .px-btn__box').boundingBox()
        const label = await page.locator('.hero-cta .px-btn__label').boundingBox()
        expect(Math.abs(label.x + label.width / 2 - (icon.x + icon.width + button.x + button.width) / 2)).toBeLessThan(1)
      }
      const intro = await page.locator('.why-vtg__intro-sticky').boundingBox()
      const stack = await page.locator('.why-stack-shell').boundingBox()
      if (width < 840) expect(stack.y - intro.y - intro.height).toBeLessThanOrEqual(32)
      else expect(stack.x - intro.x - intro.width).toBeLessThanOrEqual(70)

      await page.locator('.hero-cta').scrollIntoViewIfNeeded()
      await expect(page.locator('#hero-title .split-unit')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('hero.png') })
      await page.locator('.hero-cta')[touch ? 'tap' : 'click']()
      await expect
        .poll(() =>
          page.evaluate(() => Math.abs(document.querySelector('#how').getBoundingClientRect().top - (innerWidth <= 700 ? 20 : 32)))
        )
        .toBeLessThan(2)
      await expect(page.locator('#how-title .split-unit')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('how.png') })

      if (!reduced) {
        const range = await page.evaluate(() => {
          const pin = ScrollTrigger.getAll().find((trigger) => trigger.pin?.matches('.deck-section'))
          const wipe = ScrollTrigger.getAll().find((trigger) => trigger.trigger?.matches('.site-footer') && trigger.vars.onUpdate)
          return { start: pin.start, wipe: wipe.start, end: pin.end, wipeEnd: wipe.end }
        })
        expect(range.wipe - range.start).toBeGreaterThanOrEqual(160)
        expect(Math.abs(range.end - range.wipeEnd)).toBeLessThan(2)
        await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), (range.start + range.wipe) / 2)
        await expect
          .poll(() =>
            page.locator('.footer-edge i').evaluateAll((cells) => cells.every((cell) => Number(cell.style.opacity) === 0))
          )
          .toBe(true)
        await expect(page.locator('#deck-title .split-unit')).toHaveCount(0)
        await expect
          .poll(() => page.locator('.deck-card-item.is-front img').evaluate((image) => image.complete && image.naturalWidth > 0))
          .toBe(true)
        await page.screenshot({ path: testInfo.outputPath('cards-before-wipe.png') })
        await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), range.wipe + (range.end - range.wipe) * 0.3)
        await expect
          .poll(() => page.locator('.footer-edge i').evaluateAll((cells) => cells.some((cell) => Number(cell.style.opacity) > 0)))
          .toBe(true)
      } else {
        await expect(page.locator('.cards-anchor.is-pinned, .footer-edge i')).toHaveCount(0)
      }

      for (let visit = 0; visit < 2; visit++) {
        await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
        await page.locator('.footer-links a[href="#cards"]')[touch ? 'tap' : 'click']()
        await expect(page).toHaveURL(/#cards$/)
        await expect(page.locator('#cards')).toBeFocused()
        await expect
          .poll(() =>
            page.locator('#deck-title').evaluate((title) => {
              const rect = title.getBoundingClientRect()
              return rect.top >= 0 && rect.bottom < innerHeight
            })
          )
          .toBe(true)
        await expect
          .poll(() => page.locator('.site-footer').evaluate((footer) => footer.getBoundingClientRect().top >= innerHeight))
          .toBe(true)
        // A pinned heading can be visible while smooth scrolling is still in flight.
        // Finish the fragment navigation before testing the browser's reload restoration.
        await expect
          .poll(() =>
            page.locator('#cards').evaluate((anchor) =>
              Math.abs(anchor.getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))
            )
          )
          .toBeLessThan(2)
      }
      await page.screenshot({ path: testInfo.outputPath('cards-from-footer.png') })
      await page.reload()
      await expect(page.locator('.pixel-curtain')).toHaveCount(0)
      await expect
        .poll(() =>
          page.locator('#deck-title').evaluate((title) => {
            const rect = title.getBoundingClientRect()
            return { visible: rect.top >= 0 && rect.bottom < innerHeight, top: rect.top, bottom: rect.bottom, scroll: scrollY }
          })
        )
        .toMatchObject({ visible: true })
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}
