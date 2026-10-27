import { test, expect } from 'playwright/test'

for (const { width, height, touch, reduced = false } of [
  { width: 320, height: 568, touch: true },
  { width: 390, height: 844, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true, reduced: true },
]) {
  test(`${width}px${reduced ? ' reduced motion' : ''}: How it works reveals the word and illustration without the gallery dimmer`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(testInfo.project.use.baseURL)
      await expect(page.locator('.why-vtg')).toHaveClass(/why-motion-ready/)
      await expect(page.locator('.pixel-curtain')).toHaveCount(0)
      await page.evaluate(() => {
        const card = document.querySelector('.why-card--word')
        scrollTo({ top: card.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' })
      })
      if (!reduced) await expect(page.locator('.why-deal__card')).toHaveClass(/is-glinting/)
      const face = page.locator('.why-deal__face')
      await expect(face.locator('.card-word')).toHaveText('VOLCANO')
      await expect.poll(() => face.locator('.card-art img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
      // The gallery controller fades this full-face dimmer. The independent
      // How scene must not inherit an opaque layer over its word and artwork.
      const paintedDimmers = await face.locator('.card-shade').evaluateAll(shades => shades.filter(shade => {
        const style = getComputedStyle(shade)
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
      }).length)
      expect(paintedDimmers, 'revealed How card must not be covered by the gallery dimmer').toBe(0)
      await expect(face.locator('.card-art')).toBeVisible()
      await expect(face.locator('.card-word')).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('how-card-revealed.png') })
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}
