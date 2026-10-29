import { test, expect } from 'playwright/test'

// On a phone the film's flight out of the hero does not follow the scroll (showreel.js): the first
// scroll sets it off, it flies in its own time to the middle of the screen and waits there, fixed,
// while the page scrolls on under it; back at the top it flies home to its card. The hero's ribbons
// run on phones too, drawn smaller (hero-scribble.js).
test('390x844: the ribbons draw, and the film flies out in its own time, waits in the middle and flies home', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const centre = (selector) =>
    page.locator(selector).evaluate((element) => {
      const box = element.getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })
  const scroll = (top) => page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), top)
  try {
    await page.goto(testInfo.project.use.baseURL)
    await expect(page.locator('.pixel-curtain')).toHaveCount(0)
    const reel = page.locator('#showreel')

    // The entrance ribbon comes with the hero.
    await expect
      .poll(() =>
        page.locator('canvas.hero-scribble').evaluate((canvas) => {
          const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
          for (let i = 3; i < data.length; i += 4) if (data[i]) return true
          return false
        })
      )
      .toBe(true)

    // A little scroll, and the film flies out by itself to the middle of the screen.
    await scroll(40)
    await expect(reel).toHaveClass(/is-landed/)
    const middle = await page.evaluate(() => innerHeight / 2)
    const landed = await centre('#showreel > .film-wrap')
    expect(Math.abs(landed.y - middle)).toBeLessThan(2)
    // Scrolling on leaves it where it is, through to where the showreel sticks and past it.
    const stuck = await page.locator('.hero').evaluate((hero) => hero.getBoundingClientRect().bottom + scrollY)
    for (const top of [300, Math.round(stuck), Math.round(stuck) + 120]) {
      await scroll(top)
      const held = await centre('#showreel > .film-wrap')
      expect(Math.abs(held.y - landed.y)).toBeLessThan(1)
    }

    // Back at the top it flies home to its card.
    await scroll(0)
    await expect(reel).not.toHaveClass(/is-holding/)
    await expect
      .poll(async () => {
        const [film, card] = [await centre('#showreel > .film-wrap'), await centre('.hero-stage')]
        return Math.hypot(film.x - card.x, film.y - card.y)
      })
      .toBeLessThan(2)
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})
