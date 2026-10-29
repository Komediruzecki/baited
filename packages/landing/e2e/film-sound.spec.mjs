import { test, expect } from 'playwright/test'

// The trailer has no pause. While its sound is off and it has the screen (landed in the showreel)
// the sound button sits large in the middle of the picture; turning the sound on sends it back to
// the corner (player.js, styles.css .film-frame.is-muted).
for (const { width, height, touch } of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
]) {
  test(`${width}x${height}: the landed trailer offers its sound in the middle, and has no pause`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const centreOffset = () =>
      page.evaluate(() => {
        const frame = document.getElementById('film-frame').getBoundingClientRect()
        const button = document.getElementById('film-sound').getBoundingClientRect()
        return Math.hypot(button.left + button.width / 2 - (frame.left + frame.width / 2), button.top + button.height / 2 - (frame.top + frame.height / 2))
      })
    try {
      await page.goto(testInfo.project.use.baseURL)
      await expect(page.locator('.pixel-curtain')).toHaveCount(0)
      await expect(page.locator('#film-toggle, #film-frame [aria-label*="ause"]')).toHaveCount(0)
      // Where the showreel sticks to the top, the film has landed.
      const stuck = await page.locator('.hero').evaluate((hero) => hero.getBoundingClientRect().bottom + scrollY)
      await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), Math.round(stuck))
      await expect(page.locator('#showreel')).toHaveClass(/is-landed/)
      await expect.poll(() => page.locator('#hero-film').evaluate((video) => !video.paused && video.muted)).toBe(true)
      const sound = page.locator('#film-sound')
      await expect(sound).toBeVisible()
      await expect(sound).toHaveAccessibleName('Turn sound on')
      await expect(sound.locator('.film-sound__label')).toBeVisible()
      expect(await centreOffset()).toBeLessThan(2)
      await page.screenshot({ path: testInfo.outputPath('sound-offered.png') })

      await sound[touch ? 'tap' : 'click']()
      await expect.poll(() => page.locator('#hero-film').evaluate((video) => !video.muted && !video.paused)).toBe(true)
      await expect(page.locator('#film-frame')).not.toHaveClass(/is-muted/)
      await expect(sound).toHaveAccessibleName('Turn sound off')
      expect(await centreOffset()).toBeGreaterThan(40)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })
}
