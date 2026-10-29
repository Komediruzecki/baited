import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { SCROLLERS, THUMB_MIN, thumbFor } from '../client/scrollbars';

type Metrics = { top: number; view: number; content: number };
type LandingScrollbar = { THUMB_MIN: number; thumbFor: (metrics: Metrics) => { size: number; offset: number } | null };

test('the page thumb is the landing’s, value for value', async () => {
  const landing = (await import(new URL('../../landing/site/scrollbar.js', import.meta.url).href)) as LandingScrollbar;
  assert.equal(THUMB_MIN, landing.THUMB_MIN);
  for (const view of [0, 300, 654, 900, 1440])
    for (const content of [0, 299, 300, 301, 900, 1396, 4637, 20000])
      for (const share of [-0.1, 0, 0.25, 0.5, 1, 1.2]) {
        const metrics = { top: Math.round((content - view) * share), view, content };
        assert.deepEqual(thumbFor(metrics), landing.thumbFor(metrics), JSON.stringify(metrics));
      }
});

test('an inner thumb keeps the landing’s proportions inside its inset track', () => {
  // A 300 px list holding 1200 px, with 4 px kept clear at each end: a quarter of the 292 px track.
  assert.deepEqual(thumbFor({ top: 0, view: 300, content: 1200, track: 292 }), { size: 73, offset: 0 });
  assert.deepEqual(thumbFor({ top: 900, view: 300, content: 1200, track: 292 }), { size: 73, offset: 219 });
  assert.equal(thumbFor({ top: 0, view: 300, content: 300, track: 292 }), null);
  assert.equal(thumbFor({ top: 0, view: 300, content: 20000, track: 292 })?.size, THUMB_MIN);
});

test('every element the stylesheets let scroll is on the scroller list', () => {
  const dir = new URL('../client/', import.meta.url);
  const listed = SCROLLERS.map((scroller) => new RegExp(`${scroller.replace(/[.-]/g, '\\$&')}(?![\\w-])`));
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.css'))) {
    const css = readFileSync(new URL(file, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, selectors, body] of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
      if (!/overflow(?:-x|-y)?\s*:\s*(?:[a-z]+\s+)?(?:auto|scroll)\b/.test(body)) continue;
      for (const selector of selectors.split(',').map((part) => part.trim())) {
        // A textarea can't hold a thumb. Its bar is hidden like every other, and it still scrolls.
        if (/\btextarea\b/.test(selector)) continue;
        if (!listed.some((pattern) => pattern.test(selector))) missing.push(`${file}: ${selector}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
