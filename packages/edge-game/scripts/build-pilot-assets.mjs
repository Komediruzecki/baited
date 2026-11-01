import { constants } from 'node:fs';
import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { illustratedWords, proofWords, streakFlameFiles } from '../../app/extension/presentation.js';
import { renderErrorDocument } from '../../app/shared/error-pages.js';

const edge = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(edge, '../app');
const requireApp = createRequire(resolve(app, 'package.json'));
const marker = '.baited-pilot-assets';
const output = resolve(edge, 'dist/pilot-assets');
const runtime = dirname(requireApp.resolve('@moonshine-ai/moonshine-wasm/moonshine.mjs'));
const publicAssets = [
  'pcm-worklet.js', 'moonshine-worker.js', 'brand/baited-pixel-white.svg',
  'error-page.css', 'brand/bait-bomb.png',
  ...streakFlameFiles.map((file) => `brand/${file}`),
  'fonts/inter-latin.woff2', 'fonts/intertight-latin.woff2', 'fonts/russo-one.ttf', 'fonts/baited-pixel.ttf',
  'card-lab/backs/back-prism.webp',
  ...illustratedWords.map((word) => `cards/proofs/${word}.png`),
];

async function copyFile(source, target) {
  // Only explicitly selected installed/public files are read. No env, data or server files.
  const sourceFile = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await sourceFile.stat();
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error('Pilot asset is not a regular file under 25 MiB.');
    await mkdir(dirname(target), { recursive: true });
    const destination = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    try { await destination.writeFile(await sourceFile.readFile()); } finally { await destination.close(); }
  } finally { await sourceFile.close(); }
}

export async function buildPilotAssets() {
  let entries = [];
  try { entries = await readdir(output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (entries.length && !entries.includes(marker)) throw new Error('Pilot output contains unrelated files. Choose a clean build output.');
  const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href);
  await build({ root: app, configFile: resolve(app, 'vite.config.ts'), base: '/',
    // Prevent Vite from discovering environment files while producing this public bundle.
    envDir: false, publicDir: false,
    build: { outDir: output, emptyOutDir: true, sourcemap: false } });
  await writeFile(resolve(output, marker), 'Baited edge pilot frontend build. Safe to replace with this script.\n');
  for (const file of publicAssets) await copyFile(resolve(app, 'public', file), resolve(output, file));
  await writeFile(resolve(output, '404.html'), renderErrorDocument('missing'));
  for (const file of await readdir(runtime)) {
    if (!/\.(?:js|mjs|wasm)$/.test(file)) continue;
    await copyFile(resolve(runtime, file), resolve(output, 'moonshine/runtime-0.1.5-csp1', file));
  }
  const license = resolve(app, 'licenses/moonshine');
  for (const file of await readdir(license)) {
    if ((await stat(resolve(license, file))).isFile()) await copyFile(resolve(license, file), resolve(output, 'licenses/moonshine', file));
  }
  const receipt = { output, cards: proofWords.length, illustrations: illustratedWords.length, modelDownloadOrigin: 'https://download.moonshine.ai',
    runtime: '@moonshine-ai/moonshine-wasm@0.1.5', providerResourcesCreated: false };
  const { output: _output, ...publicReceipt } = receipt;
  await writeFile(resolve(output, 'pilot-assets.json'), `${JSON.stringify(publicReceipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  buildPilotAssets().then((receipt) => console.log(JSON.stringify(receipt, null, 2))).catch((error) => {
    console.error(error.message); process.exitCode = 1;
  });
