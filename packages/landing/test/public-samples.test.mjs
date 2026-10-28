import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { cards } from '../site/data.js'
import { sampleCards, sampleWords, installPublicSamples } from '../scripts/public-samples.mjs'
import { prepareStaticSite } from '../scripts/build-site.mjs'

test('the public sample is ten distinct canonical cards with all three difficulties', () => {
  assert.equal(sampleCards.length, 10)
  assert.equal(new Set(sampleWords).size, 10)
  assert.deepEqual(new Set(sampleCards.map(card => card.difficulty)), new Set(['easy', 'medium', 'hard']))
  for (const [index, sample] of sampleCards.entries()) {
    assert.equal(sample.index, index)
    const original = cards.find(card => card.word === sample.word)
    assert.deepEqual({ ...sample, index: original.index }, original)
  }
  assert.equal(cards.length, 100, 'sampling does not shrink the game or design catalogue')
})

for (const environment of ['dev', 'prod']) {
  test(`${environment}: the landing publishes only sample data, artwork and word-color rules`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'baited-public-samples-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const source = new URL('../site/', import.meta.url).pathname
    const destination = join(root, `site-${environment}`)
    // Use the actual staging exclusions, not a trimmed fixture that could hide
    // an accidental catalogue/asset leak in the source tree.
    await prepareStaticSite({ environment, source, destination, excludedRoots: ['cards', 'card-expansion.js'] })
    await installPublicSamples({ source, stagingSite: destination })
    const published = await import(pathToFileURL(join(destination, 'data.js')))
    assert.deepEqual(published.cards, sampleCards)
    assert.ok(!(await readdir(destination)).includes('card-expansion.js'))
    assert.deepEqual((await readdir(join(destination, 'cards/proofs'))).sort(), sampleWords.map(word => `${word}.png`).sort())
    const css = await readFile(join(destination, 'styles.css'), 'utf8')
    assert.deepEqual(new Set([...css.matchAll(/\.card-word--([a-z-]+)\s*\{\s*color:/g)].map(match => match[1])), new Set(sampleWords))
    assert.doesNotMatch(await readFile(join(destination, 'data.js'), 'utf8'), /expansion|zeppelin|tumbleweed/)
  })
}
