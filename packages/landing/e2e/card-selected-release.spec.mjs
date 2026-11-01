import { test, expect } from 'playwright/test'

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px: approved Cut Open cards keep complete artwork above readable words`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/?spread-debug#cards')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.deck-card-item .selected-card')).toHaveCount(10)
    await expect(page.locator('.selected-card:not([data-edition="cut-open"][data-finish="glass"][data-back="prism"][data-art-frame="open"])')).toHaveCount(0)
    await expect(page.locator('.selected-glass, .selected-card filter')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => !!window.__baitedSpread)).toBe(true)
    await page.locator('#deck-hand').scrollIntoViewIfNeeded()
    for (const word of ['hedgehog', 'bagpipes', 'squirrel', 'kaleidoscope', 'marshmallow']) {
      await page.evaluate(word => {
        const index = [...document.querySelectorAll('.deck-card-item .card-word')].findIndex(node => node.textContent.toLowerCase() === word)
        if (index < 0) throw new Error(`Missing ${word}`)
        window.__baitedSpread.to(index, { deliberate: true })
        window.__baitedSpread.finish()
      }, word)
      const face = page.locator('.deck-card-item.is-front .selected-card')
      await expect(face.locator('.card-word')).toHaveText(word.toUpperCase())
      await expect.poll(() => face.locator('.card-art img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
      const geometry = await face.evaluate(card => {
        const art = card.querySelector('.card-art')
        const image = art.querySelector('img')
        const square = card.querySelector('.selected-card__square')
        const field = card.querySelector('.selected-glass-field')
        const localTop = node => {
          let top = 0
          for (; node && node !== card; node = node.offsetParent) top += node.offsetTop
          return top
        }
        return {
          style: card.dataset.clue,
          stock: getComputedStyle(card).backgroundColor,
          clip: getComputedStyle(field).clipPath,
          imageFit: getComputedStyle(image).objectFit,
          left: image.offsetLeft, top: image.offsetTop,
          right: square.clientWidth - image.offsetLeft - image.clientWidth,
          bottom: square.clientHeight - image.offsetTop - image.clientHeight,
          imageBottom: localTop(image) + image.clientHeight,
          wordTop: localTop(card.querySelector('.card-word')),
          overflow: card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1,
        }
      })
      expect(geometry).toMatchObject({ style: 'rail', stock: 'rgb(36, 36, 38)', imageFit: 'contain', overflow: false })
      for (const side of ['left', 'top', 'right', 'bottom']) expect(geometry[side], `${word}: ${side} art padding`).toBeGreaterThanOrEqual(3)
      expect(geometry.clip).toMatch(/^polygon/)
      expect(geometry.imageBottom, `${word}: artwork clears the title`).toBeLessThan(geometry.wordTop)
      await expect(face.locator('.card-art.is-resolving')).toHaveCount(0)
    }
    const back = page.locator('.deck-card-item:not(.is-out):not(.is-front) .selected-card__back').first()
    expect(await back.evaluate(node => getComputedStyle(node).backgroundImage)).toContain('/assets/card-deck/back-prism.webp')
    const asset = await page.request.get('/assets/card-deck/back-prism.webp')
    expect(asset.status()).toBe(200)
    await page.screenshot({ path: testInfo.outputPath(`cut-open-prism-${width}.png`) })
    expect(errors).toEqual([])
  })
}

test('a new settled card resolves from pixels once and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?spread-debug#cards')
  await expect.poll(() => page.evaluate(() => !!window.__baitedSpread)).toBe(true)
  await page.evaluate(() => {
    const pin = ScrollTrigger.getAll().find(trigger => trigger.pin?.matches('.deck-section'))
    const wipe = ScrollTrigger.getAll().find(trigger => trigger.trigger?.matches('.site-footer') && trigger.vars.onUpdate)
    scrollTo({ top: (pin.start + wipe.start) / 2, behavior: 'instant' })
    window.__pixelProof = []
    // Observe the card requested by ArrowRight, not an initial reveal that can
    // finish between the key press and the next card's spring settling in CI.
    const items = [...document.querySelectorAll('.deck-card-item')]
    window.__pixelProofTarget = items[(items.findIndex(item => item.classList.contains('is-front')) + 1) % items.length]
    new MutationObserver(() => {
      const next = window.__pixelProofTarget
      const art = next.classList.contains('is-front') && next.querySelector('.card-art')
      if (art?.classList.contains('is-resolving')) window.__pixelProof.push([art.querySelector('canvas').width, art.classList.contains('is-swapped')])
    }).observe(document.querySelector('#deck-hand'), { subtree: true, attributes: true, attributeFilter: ['class', 'width'] })
  })
  await expect(page.locator('#deck-hand')).toHaveClass(/is-live/)
  await page.locator('#deck-hand').focus()
  await page.locator('#deck-hand').press('ArrowRight')
  await expect.poll(() => page.evaluate(() =>
    window.__pixelProof.some(([, swapped]) => !swapped) && window.__pixelProof.some(([, swapped]) => swapped)
  )).toBe(true)
  await expect(page.locator('.card-art.is-resolving')).toHaveCount(0)
  await expect(page.locator('.deck-card-item.is-front .card-art.is-pixelated')).toHaveCount(0)
  const sampled = await page.evaluate(() => window.__pixelProof)
  expect(sampled.every(([width]) => width === 32)).toBe(true)
  expect(sampled.some(([, swapped]) => !swapped) && sampled.some(([, swapped]) => swapped)).toBe(true)
  const firstWord = await page.locator('.deck-card-item.is-front .card-word').textContent()
  await page.evaluate(() => {
    // emulateMedia returns when the preference is set, not when its change
    // listeners and GSAP's breakpoint refresh have finished. Wait for that
    // event and the following paint before issuing another deck command.
    window.__pixelMediaReady = new Promise(resolve => {
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }, { once: true })
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => window.__pixelMediaReady)
  await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText(firstWord)
  const nextWord = await page.evaluate(() => {
    window.__pixelProof.length = 0
    const items = [...document.querySelectorAll('.deck-card-item')]
    window.__pixelProofTarget = items[(items.findIndex(item => item.classList.contains('is-front')) + 1) % items.length]
    return window.__pixelProofTarget.querySelector('.card-word').textContent
  })
  await page.locator('#deck-hand').press('ArrowRight')
  await expect(page.locator('.deck-card-item.is-front .card-word')).toHaveText(nextWord)
  await expect.poll(() => page.evaluate(() => !window.__baitedSpread.moving)).toBe(true)
  await expect.poll(() => page.locator('.deck-card-item.is-front .card-art img')
    .evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
  // Let any reveal scheduled by settling/image load reach its first paint.
  // The observer remains attached, so even a completed animation is detected.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(page.locator('.card-art.is-resolving')).toHaveCount(0)
  expect(await page.evaluate(() => window.__pixelProof)).toEqual([])
})
