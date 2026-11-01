import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'node:test';

const configPath = fileURLToPath(new URL('../wrangler.pilot.jsonc', import.meta.url));
const config = JSON.parse((await readFile(configPath, 'utf8')).replace(/^\s*\/\/.*$/gm, '')) as {
  assets: { run_worker_first: string[] };
};
const routes = config.assets.run_worker_first;
const routed = (path: string) => routes.some((pattern) => new RegExp('^' + pattern.split('*')
  .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(path));

test('pilot routes the speech page and hashed Whisper workers through security headers', () => {
  assert.ok(routed('/speech-lab'), 'the production speech page must reach the gateway');
  for (const worker of ['/assets/whisper-worker-3nYW0JTI.js', '/assets/whisper-worker-a_B-09.js'])
    assert.ok(routed(worker), `${worker} must reach the gateway for CSP and COEP`);
  assert.ok(routed('/moonshine-worker.js'));
  assert.ok(routed('/moonshine/runtime-0.1.5-csp1/moonshine.mjs'));
  assert.equal(routed('/assets/index-unrelated.js'), false, 'do not expand execution to every static asset');
});

// Release verification supplies its existing packaged build; ordinary unit runs
// do not create or download optional model assets just to inspect filenames.
const builtAssets = process.env.BAITED_PILOT_ASSETS;
test('every packaged application speech worker matches the pilot worker-first routes',
  { skip: !builtAssets && 'Set BAITED_PILOT_ASSETS to an existing packaged build.' }, async () => {
    const hashed = (await readdir(join(builtAssets!, 'assets'))).filter((name) => /^whisper-worker-.*\.js$/.test(name));
    assert.ok(hashed.length, 'the selected Whisper-enabled build must contain its emitted worker');
    const root = await readdir(builtAssets!);
    assert.ok(root.includes('moonshine-worker.js'));
    for (const worker of ['/moonshine-worker.js', ...hashed.map((name) => `/assets/${name}`)])
      assert.ok(routed(worker), `built worker ${worker} would bypass its CSP and COEP`);
  });
