import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('dither runtime asset matches the committed seeded generator', () => {
  const result = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-card-dither.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.match(result, /matches the seeded generator/);
});

test('dither has exact rotational symmetry, dark interior and only the approved pixel inks', async () => {
  const svg = await readFile(new URL('../public/card-lab/finishes/dither.svg', import.meta.url), 'utf8');
  assert.match(svg, /viewBox="0 0 72 101" shape-rendering="crispEdges"/);
  assert.doesNotMatch(svg, /<(?:script|image|text|filter|linearGradient)\b/);
  const approved = new Set(['#9146ff', '#3b1a7a', '#1f0e42', '#0d0a12', '#c9a8ff']);
  const cells = Array.from({ length: 101 }, () => Array<string>(72).fill('#0d0a12'));
  for (const path of svg.matchAll(/<path fill="([^"]+)" d="([^"]*)"\/>/g)) {
    assert.ok(approved.has(path[1]));
    for (const run of path[2].matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, width] = run.slice(1).map(Number);
      assert.ok(y < 101 && x + width <= 72);
      for (let column = x; column < x + width; column++) cells[y][column] = path[1];
    }
  }
  let highlights = 0;
  for (let y = 0; y < 101; y++) {
    for (let x = 0; x < 72; x++) {
      assert.equal(cells[y][x], cells[100 - y][71 - x]);
      const distance = Math.min(x, y, 71 - x, 100 - y);
      if (distance > 13) assert.equal(cells[y][x], '#0d0a12');
      if (cells[y][x] === '#c9a8ff') { highlights++; assert.ok(distance <= 6); }
      if (distance <= 1) assert.ok(['#9146ff', '#c9a8ff'].includes(cells[y][x]));
    }
  }
  assert.ok(highlights > 0 && highlights < 30, 'sparse highlight cells must stay near the edges');
});
