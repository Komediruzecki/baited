import { test, expect } from 'playwright/test'
import sharp from 'sharp'

const stage = page => page.locator('.cl-stage-area')
const card = page => stage(page).locator('article.cl-card')
const route = '/card-lab/?finish=glass&back=mosaic&clue=rail&motion=reduced'

async function alphaBounds(word) {
  const { data, info } = await sharp(new URL(`../../app/public/cards/proofs/${word}.png`, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width, top = info.height, right = 0, bottom = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] < 8) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
  }
  return { left: left / info.width, top: top / info.height, right: right / info.width, bottom: bottom / info.height }
}

test('large subjects fit intact inside the artwork window, above the word and below the rail', async ({ page }) => {
  await page.goto(`${route}&word=squirrel`)
  for (const word of ['squirrel', 'bagpipes', 'marshmallow']) {
    await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption(word)
    await card(page).locator('img.bait-card-art').evaluate(node => node.decode())
    const alpha = await alphaBounds(word)
    const bounds = await card(page).evaluate(node => {
      const rect = selector => {
        const box = node.querySelector(selector).getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom }
      }
      return { art: rect('.cl-card__art'), image: rect('img.bait-card-art'), word: rect('.cl-card__word'), rail: rect('.cl-card__rail') }
    })
    const ink = {
      left: bounds.image.x + alpha.left * bounds.image.width,
      top: bounds.image.y + alpha.top * bounds.image.height,
      right: bounds.image.x + alpha.right * bounds.image.width,
      bottom: bounds.image.y + alpha.bottom * bounds.image.height,
    }
    expect(ink.top, `${word}: top of subject stays inside its window`).toBeGreaterThanOrEqual(bounds.art.y + 3)
    expect(ink.bottom, `${word}: bottom of subject stays inside its window`).toBeLessThanOrEqual(bounds.art.bottom - 3)
    expect(ink.left, `${word}: left edge stays inside its window`).toBeGreaterThanOrEqual(bounds.art.x + 3)
    expect(ink.right, `${word}: right edge stays inside its window`).toBeLessThanOrEqual(bounds.art.x + bounds.art.width - 3)
    expect(ink.top).toBeGreaterThan(bounds.rail.bottom)
    expect(ink.bottom).toBeLessThan(bounds.word.y)
  }
})

for (const context of ['deck', 'panel', 'phone', 'studio', 'desktop']) {
  test(`Cut Reveal and Cut Open keep the latest clue layout and angled finish in ${context}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: context === 'phone' ? 390 : 1440, height: 1000 })
    await page.goto(`${route}&edition=cut-reveal&word=bagpipes&ctx=${context}&compare=1&with=cut-reveal,cut-open`)
    const framed = stage(page).locator('[data-edition=cut-reveal]')
    const open = stage(page).locator('[data-edition=cut-open]')
    await expect(framed).toBeVisible()
    await expect(open).toBeVisible()
    await expect(framed.locator('.cl-glass')).toHaveCount(1)
    await expect(open.locator('.cl-glass')).toHaveCount(0)
    for (const node of [framed, open]) {
      await expect(node).toHaveAttribute('data-host', 'slab')
      await expect(node).toHaveAttribute('data-layout', 'table')
      await expect(node).toHaveAttribute('data-clue', 'rail')
      await expect(node.locator('.cl-card__word')).toHaveText('BAGPIPES')
      await node.locator('img.bait-card-art').evaluate(img => img.decode())
      await expect(node.locator('.cl-pixel-art')).toHaveCount(1)
      const clip = await node.locator('.cl-card__cut').evaluate(el => ({ display: getComputedStyle(el).display, clip: getComputedStyle(el).clipPath }))
      expect(clip.display).not.toBe('none')
      expect(clip.clip).toMatch(/^polygon/)
    }
    expect(await open.locator('.cl-card__art').evaluate(el => getComputedStyle(el, '::before').display)).toBe('none')
    if (context === 'panel') {
      await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption('kaleidoscope')
      await page.getByRole('combobox', { name: 'Synthetic state', exact: true }).selectOption('caught')
      for (const panel of await stage(page).locator('.cl-context--panel').all()) expect(await panel.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
    }
    await page.reload()
    await expect(framed).toBeVisible()
    await expect(open).toBeVisible()
    await stage(page).screenshot({ path: testInfo.outputPath(`cut-${context}.png`) })
  })
}

test('Cut picks survive reload, and pixel reveal respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`${route.replace('motion=reduced', 'motion=full')}&edition=cut-open&word=squirrel`)
  await card(page).locator('img.bait-card-art').evaluate(img => img.decode())
  await stage(page).locator('.cl-stage').focus()
  await stage(page).locator('.cl-stage').press('r')
  await expect(card(page).locator('.cl-pixel-art')).toHaveAttribute('data-resolving', 'true')
  await expect(card(page).locator('.cl-pixel-art')).toHaveAttribute('data-resolving', 'false')
  await expect(card(page).locator('canvas')).toHaveAttribute('width', '160')
  await stage(page).getByRole('button', { name: 'Prefer Cut Open', exact: true }).click()
  await page.getByRole('radio', { name: /Cut Reveal/ }).check()
  await stage(page).getByRole('button', { name: 'Prefer Cut Reveal', exact: true }).click()
  await page.reload()
  await expect(card(page)).toHaveAttribute('data-edition', 'cut-reveal')
  await expect(stage(page).getByRole('button', { name: 'Your current pick', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('baited.card-lab.v1')))
  expect(saved.preferred).toBe('cut-reveal')
  expect(saved.picks['cut-open']).toBeTruthy()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stage(page).locator('.cl-stage').press('r')
  await expect(card(page).locator('.cl-pixel-art')).toHaveAttribute('data-resolving', 'false')
})
