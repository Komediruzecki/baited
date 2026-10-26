// Copy recorded originals without changing their pixels. All three deployable
// surfaces must contain the same bytes; the game must not depend on the landing.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { proofWords, cardArtFile } from '../extension/presentation.js';

const check = process.argv.includes('--check');
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('Usage: node scripts/sync-card-art.mjs [--check]');
const source = new URL('../public/cards/proofs/', import.meta.url);
const manifests = ['manifest', 'expansion-a', 'expansion-b', 'expansion-60-a', 'expansion-60-b'];
const assets = (await Promise.all(manifests.map(async (name) =>
  JSON.parse(await readFile(new URL(`${name}.json`, source), 'utf8'))
))).flatMap(({ assets }) => assets);
if (assets.length !== proofWords.length || new Set(assets.map(({ id }) => id)).size !== proofWords.length)
  throw new Error('Generation is incomplete or the catalogue has duplicate entries.');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function checkParent(path) {
  const parent = new URL('./', path);
  if ((await realpath(parent)) !== fileURLToPath(parent).replace(/\/$/, ''))
    throw new Error(`Artwork directories must not contain symlinks: ${fileURLToPath(parent)}`);
}
const plans = [];
for (const word of proofWords) {
  const record = assets.find(({ id }) => id === word);
  if (!record || record.file !== `${word}.png` || !/^[a-z]+$/.test(word))
    throw new Error(`Missing or invalid card record: ${word}`);
  const original = new URL(record.file, source);
  await checkParent(original);
  if (!(await lstat(original)).isFile()) throw new Error(`Original must be a regular file: ${word}`);
  if (hash(await readFile(original)) !== record.sha256)
    throw new Error(`Original does not match its generation receipt: ${word}`);
  for (const target of [
    new URL(`../../landing/site/cards/proofs/${record.file}`, import.meta.url),
    new URL(`../extension/assets/${cardArtFile(word)}`, import.meta.url),
  ]) {
    await checkParent(target);
    try {
      if (!(await lstat(target)).isFile())
        throw new Error(`Preserving non-file artwork destination: ${fileURLToPath(target)}`);
      if (hash(await readFile(target)) !== record.sha256)
        throw new Error(`Preserving unexpected existing artwork: ${fileURLToPath(target)}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      plans.push({ original, target });
    }
  }
}
if (check && plans.length) throw new Error(`${plans.length} card copies are missing. Run sync-card-art.mjs.`);
for (const { original, target } of plans) {
  await copyFile(original, target, constants.COPYFILE_EXCL);
}
console.log(`${proofWords.length} original cards verified. ${plans.length} unchanged copies added.`);
