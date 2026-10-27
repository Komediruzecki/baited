import { copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cards, chapters } from '../site/data.js'

// A fixed public tasting deck, not the playable word bank. Keep a range of
// artwork and difficulties without turning the landing into a full answer list.
export const sampleWords = Object.freeze([
  'volcano', 'banana', 'monocle', 'kaleidoscope', 'dragon',
  'archipelago', 'hedgehog', 'squirrel', 'bagpipes', 'marshmallow',
])
export const sampleCards = sampleWords.map((word, index) => {
  const card = cards.find(card => card.word === word)
  if (!card) throw new Error(`Missing public sample: ${word}`)
  return { ...card, index }
})

export async function installPublicSamples({ source, stagingSite }) {
  const artwork = join(stagingSite, 'cards/proofs')
  await mkdir(artwork, { recursive: true })
  for (const card of sampleCards) {
    const name = `${card.word}.png`
    const input = join(source, 'cards/proofs', name)
    const info = await lstat(input)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Sample artwork must be a regular PNG file')
    await copyFile(input, join(artwork, name))
  }
  // Serialize only the sample. Importing the full source and hiding its extra
  // cards in the DOM would still publish every target, clue and example hint.
  await writeFile(join(stagingSite, 'data.js'),
    `// Public example cards. The full game catalogue is not part of this module.\nexport const cards = ${JSON.stringify(sampleCards, null, 2)}\n\nexport const chapters = ${JSON.stringify(chapters, null, 2)}\n`)
  const cssPath = join(stagingSite, 'styles.css')
  const css = await readFile(cssPath, 'utf8')
  await writeFile(cssPath, css.replace(/\.card-word--([a-z-]+)\s*\{\s*color:\s*#[0-9a-f]{6};?\s*\}/gi,
    (rule, word) => sampleWords.includes(word) ? rule : ''))
}
