import { test, expect } from 'playwright/test'

// Lenis (site/smooth-scroll.js) eases the wheel and the section links, and learns of other scrolls
// only from their events. A link clicked before the event of a jump just made, and a jump made
// while it still eases, must both end where they would without it.
test('1920x1080: section links set off from where the page is, and a jump while Lenis eases holds', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(testInfo.project.use.baseURL)
    await expect(page.locator('.pixel-curtain')).toHaveCount(0)
    await expect(page.locator('html')).toHaveClass(/\blenis\b/)
    // The jump to the foot of the page and the click in one task, so the click comes first.
    await page.evaluate(() => {
      scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
      document.querySelector('.footer-links a[href="#cards"]').click()
    })
    await expect
      .poll(() => page.evaluate(() => Math.abs(document.getElementById('cards').getBoundingClientRect().top - parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop))))
      .toBeLessThan(1.5)

    // On the way to "How it plays", a jump to the top: it stays there.
    await page.locator('.site-nav a[href="#how"]').first().click()
    await expect(page.locator('html')).toHaveClass(/lenis-smooth/)
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})
