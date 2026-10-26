import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clueCards } from '../server/cards.js';
import { words } from '../server/words.js';
import { proofWords } from '../extension/presentation.js';

// Public, fixed examples only. This file never reads a room or chooses a live target.
const target = new URL('../shared/card-review-catalogue.json', import.meta.url);
const examples = JSON.parse(readFileSync(new URL('../shared/card-examples.json', import.meta.url), 'utf8'));
const landingCss = readFileSync(new URL('../../landing/site/styles.css', import.meta.url), 'utf8');
const inks = Object.fromEntries([...landingCss.matchAll(/\.card-word--([a-z]+)\s*\{\s*color:\s*(#[a-f0-9]{6})/gi)].map(match => [match[1], match[2]]));
const catalogue = proofWords.map(word => {
  const difficulty = Object.entries(words).find(([, entries]) => entries.includes(word))?.[0];
  const clues = clueCards[word];
  if (!difficulty || clues?.length !== 4 || !examples[word] || !inks[word]) {
    throw new Error(`Incomplete review catalogue entry: ${word}`);
  }
  return { word, difficulty, clues, example: examples[word], ink: inks[word] };
});
const output = JSON.stringify(catalogue, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== output) throw new Error('Review catalogue is stale. Run pnpm catalogue:review.');
  console.log(`Review catalogue matches ${catalogue.length} playable targets.`);
} else {
  writeFileSync(target, output);
  console.log(`Wrote ${catalogue.length} fixed review examples to ${fileURLToPath(target)}.`);
}
