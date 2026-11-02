import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateCardArt, type CardArtSteps } from '../client/card-art-gate.js';
import type { ArtScreen } from '../shared/card-art-policy.js';

const image = (type = 'image/png', size = 64) => new Blob([new Uint8Array(size)], { type });

function run(decision: ArtScreen, size = { width: 900, height: 600 }) {
  const calls = { decoded: 0, screened: 0, fitted: 0, closed: 0 };
  const bitmap = { ...size, close: () => { calls.closed++; } } as unknown as ImageBitmap;
  const steps: CardArtSteps = {
    decode: async () => { calls.decoded++; return bitmap; },
    screen: async () => { calls.screened++; return decision; },
    fit: async () => { calls.fitted++; return { png: new Blob([], { type: 'image/png' }), width: 512, height: 341 }; },
  };
  return { calls, steps };
}

test('edge Studio fits only an image its on-device check accepts', async () => {
  const accepted = run('accepted');
  const fitted = await gateCardArt(image(), accepted.steps);
  assert.deepEqual([fitted.width, fitted.height], [512, 341]);
  assert.deepEqual(accepted.calls, { decoded: 1, screened: 1, fitted: 1, closed: 1 });
  for (const [decision, message] of [
    ['blocked', /did not pass the sexual-content check/],
    ['uncertain', /could not clear this artwork/],
    ['unavailable', /could not run in this browser/],
  ] as const) {
    const refused = run(decision);
    await assert.rejects(gateCardArt(image(), refused.steps), message, decision);
    assert.deepEqual(refused.calls, { decoded: 1, screened: 1, fitted: 0, closed: 1 }, `${decision} leaves no PNG to upload`);
  }
});

test('edge Studio refuses what it cannot check before the model runs', async () => {
  const large = run('accepted', { width: 9000, height: 10 });
  await assert.rejects(gateCardArt(image(), large.steps), /too many pixels/);
  assert.deepEqual(large.calls, { decoded: 1, screened: 0, fitted: 0, closed: 1 });
  const untouched = run('accepted');
  await assert.rejects(gateCardArt(image('image/svg+xml'), untouched.steps), /PNG, JPEG or WebP/);
  await assert.rejects(gateCardArt(image('image/png', 0), untouched.steps), /smaller than 5 MB/);
  await assert.rejects(gateCardArt(image('image/png', 5 * 1024 * 1024 + 1), untouched.steps), /smaller than 5 MB/);
  assert.equal(untouched.calls.decoded, 0);
  await assert.rejects(gateCardArt(image(), { ...untouched.steps, decode: async () => { throw new Error('fixture decode failure'); } }), /could not be read/);
  assert.equal(untouched.calls.screened, 0);
});
