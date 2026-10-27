import { test, expect } from 'playwright/test'

const route = '/card-lab/?edition=table-open&word=marshmallow&finish=glass&back=mosaic&clue=pills'
const stage = (page) => page.locator('.cl-stage-area')
const tools = (page) => page.getByRole('navigation', { name: 'Card lab tools', exact: true })

async function decodedArt(page) {
  const images = stage(page).locator('img.bait-card-art')
  for (const image of await images.all()) await image.evaluate((node) => node.decode())
  await expect(stage(page).locator('.cl-pixel-art[data-resolving=true]')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [320, 768, 1440]) {
  test(`${width}px: Table Open removes the inner frame and preserves the paired card's art and layout`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${route}&compare=1&motion=reduced`)
    const framed = stage(page).locator('article[data-edition=table-reveal]')
    const open = stage(page).locator('article[data-edition=table-open]')
    await expect(framed).toBeVisible()
    await expect(open).toBeVisible()
    await decodedArt(page)
    await expect(framed.locator('.cl-glass')).toHaveCount(1)
    await expect(open.locator('.cl-glass')).toHaveCount(0)
    for (const card of [framed, open]) {
      await expect(card.locator('.cl-glass-field')).toHaveCount(1)
      await expect(card.locator('.cl-card__word')).toHaveText('MARSHMALLOW')
      await expect(card.locator('[data-clue-word]')).toHaveText(['sugar', 'campfire'])
    }
    const geometry = await stage(page).locator('article.cl-card').evaluateAll((cards) => cards.map((card) => {
      const box = (selector) => {
        const node = card.querySelector(selector)
        return [node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight]
      }
      return {
        card: [card.offsetWidth, card.offsetHeight],
        art: box('.cl-card__art'),
        word: box('.cl-card__word'),
        footer: box('.cl-card__foot'),
        image: card.querySelector('.bait-card-art').getAttribute('src'),
        frame: getComputedStyle(card.querySelector('.cl-card__art'), '::before').display,
      }
    }))
    expect(geometry).toHaveLength(2)
    expect(geometry[0].card).toEqual(geometry[1].card)
    expect(geometry[0].art).toEqual(geometry[1].art)
    expect(geometry[0].word).toEqual(geometry[1].word)
    expect(geometry[0].footer).toEqual(geometry[1].footer)
    expect(geometry[0].image).toBe(geometry[1].image)
    expect(geometry[1].frame).toBe('none')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await stage(page).screenshot({ path: testInfo.outputPath(`framed-open-${width}.png`) })

    // The compact real-host mock must still fit after result messages appear.
    await tools(page).getByRole('button', { name: 'Compare', exact: true }).click()
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption('panel')
    await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption('kaleidoscope')
    await page.getByRole('combobox', { name: 'Synthetic state', exact: true }).selectOption('caught')
    await expect(open.locator('.cl-card__word')).toHaveText('KALEIDOSCOPE')
    await expect(open.locator('.cl-card__verdict')).toHaveText('Chat wins')
    const fits = await stage(page).locator('.cl-context--panel').evaluate((node) => node.scrollHeight <= node.clientHeight + 1)
    expect(fits, 'The 318 × 500 Twitch panel fits the full result').toBe(true)
    await page.getByRole('combobox', { name: 'Synthetic state', exact: true }).selectOption('broadcaster')
    await expect(open).toHaveAttribute('data-face', 'back')
    await expect(open.locator('.cl-card__word, .bait-card-art, .cl-glass')).toHaveCount(0)
  })
}

test('touch selection, reload and exported picks keep Table Open separate from the framed edition', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    })
    await page.goto(route.replace('edition=table-open', 'edition=table-reveal'))
    await expect(stage(page).locator('article[data-edition=table-reveal] .cl-glass')).toHaveCount(1)
    await stage(page).getByRole('button', { name: 'Prefer Table Reveal', exact: true }).tap()
    await page.getByRole('radio', { name: /Table Open/ }).tap()
    await expect(page).toHaveURL(/[?&]edition=table-open(?:&|$)/)
    await expect(stage(page).locator('.cl-glass')).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: 'Bend glass', exact: true })).toHaveCount(0)
    await stage(page).getByRole('button', { name: 'Prefer Table Open', exact: true }).tap()
    await page.reload()
    await expect(stage(page).locator('article[data-edition=table-open]')).toBeVisible()
    await expect(stage(page).getByRole('button', { name: 'Your current pick', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Copy full review', exact: true }).tap()
    const review = JSON.parse(await page.getByRole('textbox', { name: 'Copy this full review', exact: true }).inputValue())
    expect(review.editions.preferred).toBe('table-open')
    expect(Object.keys(review.editions.picks)).toEqual(['table-reveal', 'table-open'])
    expect(review.surfaces.finish).toBe('glass')
    expect(review.surfaces.back).toBe('mosaic')
    await page.getByRole('radio', { name: /Table Reveal/ }).tap()
    await expect(stage(page).locator('article[data-edition=table-reveal] .cl-glass')).toHaveCount(1)
  } finally { await context.close() }
})

test('Table Open keeps the pixel reveal, and its artwork stays unframed across finishes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(route)
  const card = stage(page).locator('article[data-edition=table-open]')
  await decodedArt(page)
  await stage(page).locator('.cl-stage').focus()
  await stage(page).locator('.cl-stage').press('r')
  const art = card.locator('.cl-pixel-art')
  await expect(art).toHaveAttribute('data-resolving', 'true')
  await expect(art).toHaveAttribute('data-resolving', 'false')
  await expect(art.locator('canvas')).toHaveAttribute('width', '160')
  await expect(art.locator('img')).toHaveCSS('opacity', '1')
  for (const finish of ['stock', 'dither', 'prism', 'engraved', 'velvet', 'spotlight', 'glass']) {
    await page.locator(`input[name=finish][value=${finish}]`).check()
    const frame = await card.locator('.cl-card__art').evaluate((node) => ({
      decoration: getComputedStyle(node, '::before').display,
      aperture: getComputedStyle(node.querySelector('.cl-card__aperture')).display,
    }))
    expect(frame, finish).toEqual({ decoration: 'none', aperture: 'none' })
    await expect(card.locator('.cl-glass')).toHaveCount(0)
    await expect(card.locator('.cl-card__word')).toHaveText('MARSHMALLOW')
  }
})
