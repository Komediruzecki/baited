import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [runPath] = process.argv.slice(2);
if (!runPath || !process.env.HF_TOOLCHAIN || !process.env.HYPERFRAMES_BROWSER_PATH) {
  throw new Error('Pass the active registered output run and set HF_TOOLCHAIN and HYPERFRAMES_BROWSER_PATH.');
}
const run = resolve(runPath);
const requireTool = createRequire(join(resolve(process.env.HF_TOOLCHAIN), 'package.json'));
const { build } = requireTool('esbuild');
const { default: puppeteer } = await import(requireTool.resolve('puppeteer-core'));
await mkdir(join(run, 'deliverables'), { recursive: true });
await mkdir(join(run, 'scratch'), { recursive: true });
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./audio-entry.js', import.meta.url))],
  bundle: true, format: 'iife', write: false, platform: 'browser',
});
const browser = await puppeteer.launch({
  executablePath: process.env.HYPERFRAMES_BROWSER_PATH,
  userDataDir: join(run, 'scratch', 'audio-browser'),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><title>BAIT offline soundtrack export</title>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const data = await page.evaluate(() => window.renderBaitSoundtrack());
  await writeFile(join(run, 'deliverables', 'soundtrack-raw.wav'), Buffer.from(data, 'base64'));
  console.log('32s soundtrack exported: deal at 1.9s, confirmed catch at 23.3s.');
} finally {
  await browser.close();
}
