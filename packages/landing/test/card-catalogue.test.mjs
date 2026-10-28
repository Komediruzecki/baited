import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { cards } from '../site/data.js'
import { expansion } from '../site/card-expansion.js'
import { words } from '../../app/server/words.ts'
import { forbiddenClues } from '../../app/server/cards.ts'
import { cardArtFile, proofWords } from '../../app/extension/presentation.js'

test('the expanded gallery covers the playable deck with accurate restrictions and usable example hints', () => {
  assert.equal(cards.length, 100)
  assert.equal(expansion.length, 82)
  assert.equal(new Set(cards.map(({ word }) => word)).size, cards.length)
  assert.deepEqual(new Set(cards.map(({ word }) => word)), new Set(Object.values(words).flat()))
  assert.deepEqual(new Set(proofWords), new Set(cards.map(({ word }) => word)))
  for (const card of cards) {
    assert.ok(words[card.difficulty].includes(card.word), `${card.word}: wrong difficulty`)
    assert.deepEqual(card.clues, forbiddenClues(card.word, card.difficulty), `${card.word}: wrong clues`)
    const hintWords = card.question.toLowerCase().match(/[a-z]+/g)
    for (const forbidden of [card.word, ...card.clues]) {
      assert.ok(!hintWords.includes(forbidden), `${card.word}: example gives away ${forbidden}`)
    }
  }
})

test('each card is an unchanged, recorded image in the landing, app and native Extension', async () => {
  const manifests = await Promise.all(['manifest', 'expansion-a', 'expansion-b', 'expansion-60-a', 'expansion-60-b', 'expansion-100'].map(async (name) =>
    JSON.parse(await readFile(new URL(`../../app/public/cards/proofs/${name}.json`, import.meta.url), 'utf8'))
  ))
  const assets = manifests.flatMap(({ assets }) => assets)
  assert.equal(assets.length, cards.length)
  assert.equal(new Set(assets.map(({ id }) => id)).size, cards.length)
  for (const card of cards) {
    const record = assets.find(({ id }) => id === card.word)
    assert.ok(record, `${card.word}: missing provenance`)
    assert.ok(record.prompt?.length > 100, `${card.word}: missing generation prompt`)
    const files = [
      new URL(`../../app/public/cards/proofs/${card.word}.png`, import.meta.url),
      new URL(`../site${card.art}`, import.meta.url),
      new URL(`../../app/extension/assets/${cardArtFile(card.word)}`, import.meta.url),
    ]
    for (const file of files) {
      const bytes = await readFile(file)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `${card.word}: ${file.pathname}`)
      assert.equal(bytes.length, record.bytes)
      assert.equal(bytes.readUInt32BE(16), record.width)
      assert.equal(bytes.readUInt32BE(20), record.height)
      assert.equal(bytes[25], 6, `${card.word}: original must have RGBA transparency`)
    }
  }
})
