import { test, expect } from 'playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const styles = ['baseline', 'pills', 'rail', 'tokens', 'quiet']
const examples = [
  { word: 'dinosaur', clues: [] },
  { word: 'marshmallow', clues: ['sugar', 'campfire'] },
  { word: 'alchemy', clues: ['gold', 'transmutation', 'metal', 'elixir'] },
]
const longTarget = { word: 'kaleidoscope', clues: ['patterns', 'mirrors', 'colors', 'colours'] }
const route = '/card-lab/?edition=table-reveal&finish=glass&back=mosaic&view=clues&clue=pills&word=alchemy'
const studies = (page) => page.getByRole('region', { name: 'Forbidden-word styles', exact: true })
const tools = (page) => page.getByRole('navigation', { name: 'Card lab tools', exact: true })

async function ready(page) {
  await expect(studies(page)).toBeVisible()
  await expect(studies(page).locator('[data-clue-study]')).toHaveCount(styles.length)
  await page.evaluate(() => document.fonts.ready)
}

async function artReadyForCapture(page) {
  const images = studies(page).locator('img.bait-card-art:visible')
  await expect(images).toHaveCount(styles.length)
  for (const image of await images.all()) {
    // Full-page captures include offscreen studies. Wake a lazy illustration
    // through its actual viewport before decoding, without fetching substitutes.
    if (await image.getAttribute('loading') === 'lazy') await image.scrollIntoViewIfNeeded()
    const decoded = await image.evaluate(async (element) => {
      await element.decode()
      return { complete: element.complete, width: element.naturalWidth, height: element.naturalHeight }
    })
    expect(decoded.complete, 'Card illustration is completely loaded before capture').toBe(true)
    expect(decoded.width, 'Card illustration has decoded pixels').toBeGreaterThan(0)
    expect(decoded.height, 'Card illustration has decoded pixels').toBeGreaterThan(0)
  }
  await expect(studies(page).locator('.cl-pixel-art[data-resolving="true"]')).toHaveCount(0)
}

async function readableClues(page, example, context) {
  const group = studies(page)
  await expect(group.locator('.cl-card__word')).toHaveText(styles.map(() => example.word.toUpperCase()))
  const cards = await group.locator('[data-clue-study]').evaluateAll((items) => items.map((item) => {
    const card = item.querySelector('article.cl-card')
    const cardRect = card.getBoundingClientRect()
    const clues = [...card.querySelectorAll('[data-clue-word]')].map((clue) => {
      const style = getComputedStyle(clue)
      const rect = clue.getBoundingClientRect()
      const restrictionRect = clue.closest('.cl-card__restrictions, .cl-card__rule')?.getBoundingClientRect()
      const owner = clue.closest('li') || clue
      const walker = document.createTreeWalker(clue, NodeFilter.SHOW_TEXT)
      const textRects = []
      const text = []
      let decoration = false
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || node.parentElement.closest('[aria-hidden="true"], svg')) continue
        text.push(node.textContent)
        const range = document.createRange()
        range.selectNodeContents(node)
        textRects.push(...range.getClientRects())
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).textDecorationLine.includes('line-through')) decoration = true
          if (parent === card) break
        }
      }
      const within = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
      const obscuringBar = ['::before', '::after'].some((pseudo) => {
        const value = getComputedStyle(owner, pseudo)
        return value.content !== 'none' && value.position === 'absolute' && parseFloat(value.width) > rect.width / 2 && parseFloat(value.height) > 0 && parseFloat(value.height) <= 6
      })
      return {
        text: text.join('').trim().toLowerCase(),
        lineCount: new Set(textRects.map((value) => Math.round(value.top))).size,
        visible: rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0,
        fits: textRects.length > 0 && textRects.every((value) => within(value, rect) && within(value, cardRect) && (!restrictionRect || within(value, restrictionRect))),
        fontSize: parseFloat(style.fontSize),
        strike: decoration,
        obscuringBar,
        interactive: !!clue.closest('button, a, [role="button"], [role="link"]') || clue.tabIndex >= 0 || style.cursor === 'pointer',
        color: style.color,
      }
    })
    const frame = card.closest('.cl-context')
    return {
      id: item.dataset.clueStudy,
      layout: card.dataset.layout,
      treatment: card.dataset.clue,
      clues,
      panelFits: !frame.classList.contains('cl-context--panel') || frame.scrollHeight <= frame.clientHeight + 1,
    }
  }))
  expect(cards.map(({ id }) => id)).toEqual(styles)
  for (const card of cards) {
    expect(card.treatment, card.id).toBe(card.id)
    expect(card.layout, `${card.id}: studies use the compatible Table composition`).toBe('table')
    expect(card.clues.map(({ text }) => text), `${card.id}: exact ${example.word} clues`).toEqual(example.clues)
    // Boxes is the unchanged control. Record its known wrapping/height rather
    // than silently redesigning it to make the new variants' contract pass.
    if (card.id !== 'baseline') expect(card.panelFits, `${card.id}: full 318 × 500 panel fits`).toBe(true)
    for (const clue of card.clues) {
      const label = `${context}/${card.id}/${clue.text}`
      expect(clue.visible, label).toBe(true)
      expect(clue.fits, `${label}: every text fragment stays inside its stock`).toBe(true)
      if (card.id !== 'baseline') expect(clue.lineCount, `${label}: a clue never splits across lines`).toBe(1)
      expect(clue.fontSize, label).toBeGreaterThanOrEqual(context === 'studio' ? 9 : 12)
      expect(clue.strike, label).toBe(false)
      expect(clue.obscuringBar, label).toBe(false)
      expect(clue.interactive, `${label}: restrictions are text, not controls`).toBe(false)
      expect(clue.color, label).not.toBe('rgba(0, 0, 0, 0)')
    }
  }
  return cards
}

for (const width of [320, 768, 1440]) {
  test(`${width}px: all five clue treatments keep real easy, medium and hard words readable`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(route)
    await ready(page)
    const measurements = []
    for (const context of ['deck', 'panel', 'studio']) {
      await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption(context)
      for (const example of examples) {
        await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption(example.word)
        measurements.push({ context, word: example.word, cards: await readableClues(page, example, context) })
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    }
    await page.getByRole('combobox', { name: 'Context', exact: true }).selectOption('panel')
    await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption(longTarget.word)
    measurements.push({ context: 'panel', word: longTarget.word, cards: await readableClues(page, longTarget, 'panel') })
    await page.getByRole('combobox', { name: 'Word', exact: true }).selectOption(examples[2].word)
    await readableClues(page, examples[2], 'panel')
    const geometryPath = testInfo.outputPath('clue-geometry.json')
    writeFileSync(geometryPath, JSON.stringify(measurements, null, 2))
    await testInfo.attach('clue-geometry.json', { path: geometryPath, contentType: 'application/json' })
    await artReadyForCapture(page)
    await page.screenshot({ path: testInfo.outputPath(`clue-studies-${width}.png`), fullPage: true })
  })
}

test('clue selection survives stage navigation and reload without rewriting existing review choices', async ({ page }) => {
  const editionSave = { version: 1, preferred: 'foil', picks: { foil: { note: 'Keep this previous review.', reviewed: ['obs'], experimental: false } }, updatedAt: '2026-10-27T01:00:00.000Z' }
  const surfaceSave = { version: 1, finish: 'glass', back: 'mosaic', logo: 'designed', preferredFinish: 'glass', preferredBack: 'mosaic', notes: { 'back:mosaic': 'Keep this previous note.' }, pairings: [], updatedAt: '2026-10-27T01:00:00.000Z' }
  const editionRaw = JSON.stringify(editionSave, null, 2)
  const surfaceRaw = JSON.stringify(surfaceSave, null, 2)
  await page.addInitScript(({ editionRaw, surfaceRaw }) => {
    if (!localStorage.getItem('baited.card-lab.v1')) localStorage.setItem('baited.card-lab.v1', editionRaw)
    if (!localStorage.getItem('baited.card-surfaces.v1')) localStorage.setItem('baited.card-surfaces.v1', surfaceRaw)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  }, { editionRaw, surfaceRaw })
  await page.goto(route.replace('&clue=pills', '').replace('edition=table-reveal', 'edition=foil'))
  await ready(page)
  await expect(page).toHaveURL(/(?:[?&])clue=rail(?:&|$)/)
  expect(await page.evaluate(() => localStorage.getItem('baited.card-clues.v1'))).toBeNull()
  await readableClues(page, examples[2], 'deck')
  await studies(page).locator('[data-clue-study="tokens"]').getByRole('button', { name: 'Show on stage', exact: true }).click()
  await expect(page).toHaveURL(/(?=.*[?&]view=stage(?:&|$))(?=.*[?&]clue=tokens(?:&|$))/)
  await expect(page.locator('.cl-stage-area article.cl-card[data-clue="tokens"]')).toBeVisible()
  await page.reload()
  await expect(page.locator('.cl-stage-area article.cl-card[data-clue="tokens"]')).toBeVisible()
  const selector = page.getByRole('group', { name: 'Forbidden-word style', exact: true })
  await selector.locator('input[value="tokens"]').focus()
  await selector.locator('input[value="tokens"]').press('ArrowRight')
  await expect(selector.locator('input[value="quiet"]')).toBeChecked()
  await expect(page.locator('.cl-stage-area article.cl-card[data-clue="quiet"]')).toBeVisible()
  await selector.locator('input[value="quiet"]').press('ArrowLeft')
  await expect(selector.locator('input[value="tokens"]')).toBeChecked()
  expect(await page.evaluate(() => localStorage.getItem('baited.card-clues.v1'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('baited.card-lab.v1'))).toBe(editionRaw)
  expect(await page.evaluate(() => localStorage.getItem('baited.card-surfaces.v1'))).toBe(surfaceRaw)
  await page.locator('.cl-stage').focus()
  await page.locator('.cl-stage').press('f')
  await expect(page.locator('.cl-stage-area article.cl-card[data-face="back"]')).toHaveCount(1)
  await tools(page).getByRole('button', { name: 'Clue styles', exact: true }).click()
  await ready(page)
  await expect(studies(page).locator('article.cl-card[data-face="back"]')).toHaveCount(0)
  await readableClues(page, examples[2], 'deck')
  await studies(page).locator('[data-clue-study="tokens"]').getByRole('button', { name: /^Prefer / }).click()
  const saved = await page.evaluate(() => ({
    editions: JSON.parse(localStorage.getItem('baited.card-lab.v1')),
    surfaces: JSON.parse(localStorage.getItem('baited.card-surfaces.v1')),
    clues: JSON.parse(localStorage.getItem('baited.card-clues.v1')),
    editionRaw: localStorage.getItem('baited.card-lab.v1'),
    surfaceRaw: localStorage.getItem('baited.card-surfaces.v1'),
  }))
  expect(saved.editions).toEqual(editionSave)
  expect(saved.surfaces).toEqual(surfaceSave)
  expect(saved.editionRaw).toBe(editionRaw)
  expect(saved.surfaceRaw).toBe(surfaceRaw)
  expect(saved.clues.version).toBe(1)
  expect(saved.clues.selected).toBe('tokens')
  expect(saved.clues.preferred).toBe('tokens')
  await page.getByRole('button', { name: 'Copy full review', exact: true }).click()
  const exported = JSON.parse(await page.getByRole('textbox', { name: 'Copy this full review', exact: true }).inputValue())
  expect(exported.editions).toEqual(editionSave)
  expect(exported.surfaces).toEqual({ ...surfaceSave, view: 'stage' })
  expect(exported.clues).toEqual(saved.clues)
  await page.goto(route.replace('&clue=pills', ''))
  await ready(page)
  await expect(page).toHaveURL(/(?:[?&])clue=tokens(?:&|$)/)
  await expect(studies(page).locator('[data-clue-study="tokens"]').getByRole('button', { pressed: true })).toHaveCount(1)
})

test('reduced motion and forced colors preserve clue readability and hide words on face-down states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })
  await page.goto(`${route}&ctx=panel&motion=reduced`)
  await ready(page)
  for (const state of ['live', 'urgent', 'paused', 'review', 'caught', 'reconnecting']) {
    await page.getByRole('combobox', { name: 'Synthetic state', exact: true }).selectOption(state)
    await readableClues(page, examples[2], 'panel')
  }
  const animated = await studies(page).locator('article.cl-card').evaluateAll((cards) => cards.flatMap((card) => card.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').map((animation) => animation.animationName)))
  expect(animated).toEqual([])
  await artReadyForCapture(page)
  await page.screenshot({ path: testInfo.outputPath('clue-studies-forced-colors.png'), fullPage: true })
  for (const state of ['waiting', 'broadcaster']) {
    await page.getByRole('combobox', { name: 'Synthetic state', exact: true }).selectOption(state)
    await expect(studies(page).locator('article.cl-card[data-face="back"]')).toHaveCount(styles.length)
    await expect(studies(page).locator('[data-clue-word], .cl-card__word')).toHaveCount(0)
    await expect(studies(page).locator('article[aria-label*="ALCHEMY"]')).toHaveCount(0)
    await expect(studies(page).locator('img[src*="alchemy"]')).toHaveCount(0)
  }
})

// Each width gets its own page/trace and the normal 45-second test budget. The
// complete 78-card × four-style matrix is unchanged; one 16-navigation test made
// tens of thousands of traced assertions share a single CI deadline.
for (const width of [320, 390, 1440, 1920]) {
  test(`${width}px: all 78 native landing cards fit all four proposed clue styles`, async ({ page }, testInfo) => {
    const catalogue = JSON.parse(readFileSync(new URL('../../app/shared/card-review-catalogue.json', import.meta.url), 'utf8'))
    expect(catalogue).toHaveLength(78)
    const expected = Object.fromEntries(catalogue.map((card) => [card.word, {
      clues: card.clues.slice(0, card.difficulty === 'hard' ? 4 : card.difficulty === 'medium' ? 2 : 0),
      question: card.example,
    }]))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const measurements = []
    await page.setViewportSize({ width, height: 1000 })
    for (const treatment of ['rail', 'pills', 'tokens', 'quiet']) {
      await page.goto(`/?clue=${treatment}#cards`)
      const cards = page.locator('.deck-card-item .selected-card')
      await expect(cards).toHaveCount(catalogue.length)
      await page.evaluate(() => document.fonts.ready)
      const results = await cards.evaluateAll((nodes) => nodes.map((card) => {
        const measured = (element) => ({
          width: element.clientWidth,
          height: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
        })
        // The fanned cards are rotated and translated. Offset/client metrics
        // inspect their actual layout without comparing transformed rectangles.
        const bottomInCard = (element) => {
          let bottom = element.offsetHeight
          for (let node = element; node && node !== card; node = node.offsetParent) {
            bottom += node.offsetTop
            if (!node.offsetParent || !card.contains(node.offsetParent)) return null
          }
          return bottom
        }
        const plate = card.querySelector('.selected-card__plate')
        const question = card.querySelector('.card-question')
        const footer = card.querySelector('.card-footer')
        const restriction = card.querySelector('.card-clues, .card-rule, .card-easy')
        const terms = [...card.querySelectorAll('[data-clue-word]')].map((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
          const style = getComputedStyle(element)
          return {
            text: element.textContent.trim().toLowerCase(),
            lines: rects.length,
            fontSize: parseFloat(style.fontSize),
            strike: style.textDecorationLine.includes('line-through'),
            interactive: !!element.closest('button, a, [role="button"], [role="link"]') || element.tabIndex >= 0,
          }
        })
        const containers = [card, plate, restriction, question, footer, ...card.querySelectorAll('.card-clues li')]
        return {
          word: card.querySelector('.card-word').textContent.trim().toLowerCase(),
          treatment: card.dataset.clue,
          terms,
          question: question.textContent.trim(),
          easy: !!card.querySelector('.card-easy'),
          containers: containers.map((element) => ({ name: element.className, ...measured(element) })),
          art: measured(card.querySelector('.card-art')),
          square: measured(card.querySelector('.selected-card__square')),
          questionBottom: bottomInCard(question),
          footerBottom: bottomInCard(footer),
          cardHeight: card.clientHeight,
        }
      }))
      expect(new Set(results.map((card) => card.word)).size).toBe(catalogue.length)
      for (const card of results) {
        const label = `${width}px/${treatment}/${card.word}`
        expect(card.treatment, label).toBe(treatment)
        expect(card.terms.map((term) => term.text), `${label}: canonical 0/2/4 clues`).toEqual(expected[card.word].clues)
        expect(card.question, `${label}: complete question`).toBe(expected[card.word].question)
        expect(card.easy, `${label}: easy card's explicit rule`).toBe(expected[card.word].clues.length === 0)
        for (const term of card.terms) {
          expect(term.lines, `${label}/${term.text}: whole word stays on one line`).toBe(1)
          expect(term.fontSize, `${label}/${term.text}`).toBeGreaterThanOrEqual(12)
          expect(term.strike, `${label}/${term.text}`).toBe(false)
          expect(term.interactive, `${label}/${term.text}`).toBe(false)
        }
        for (const container of card.containers) {
          expect(container.width, `${label}/${container.name}: content has a layout box`).toBeGreaterThan(0)
          expect(container.scrollWidth, `${label}/${container.name}: no horizontal spill`).toBeLessThanOrEqual(container.width + 1)
          expect(container.scrollHeight, `${label}/${container.name}: no vertical clipping`).toBeLessThanOrEqual(container.height + 1)
        }
        expect(card.art.height, `${label}: art window`).toBeGreaterThanOrEqual(80)
        expect(card.square.width, `${label}: square art width`).toBeGreaterThanOrEqual(80)
        expect(card.square.height, `${label}: square art height`).toBeGreaterThanOrEqual(80)
        expect(card.questionBottom, `${label}: question is inside card`).not.toBeNull()
        expect(card.footerBottom, `${label}: footer is inside card`).not.toBeNull()
        expect(card.questionBottom, `${label}: question is inside card`).toBeLessThanOrEqual(card.cardHeight + 1)
        expect(card.footerBottom, `${label}: footer is inside card`).toBeLessThanOrEqual(card.cardHeight + 1)
      }
      measurements.push({ width, treatment, cards: results })
      if ((width === 320 && ['rail', 'pills'].includes(treatment)) || (width === 1440 && treatment === 'quiet')) {
        await page.screenshot({ path: testInfo.outputPath(`native-cards-${width}-${treatment}.png`) })
      }
    }
    const geometryPath = testInfo.outputPath('native-all-78-clue-geometry.json')
    writeFileSync(geometryPath, JSON.stringify(measurements))
    await testInfo.attach('native-all-78-clue-geometry.json', { path: geometryPath, contentType: 'application/json' })
  })
}
