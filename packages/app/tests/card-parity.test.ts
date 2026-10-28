import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardBack } from '../client/CardBack';
import { CutCard } from '../client/CutCard';
import { cardWordSize, glassRules } from '../extension/presentation.js';
import { PIXEL_REVEAL_MS, PIXEL_STEP_MS, PIXEL_STEPS, revealPixels } from '../extension/pixel-reveal.js';
import catalogue from '../shared/card-review-catalogue.json';

// The landing's approved card (packages/landing/selected-cards) is the source of truth for
// every product card. extension/card.css restates its pixel values in landing pixels
// (calc(N * var(--cut-u))), so this test reads both stylesheets and compares them value by
// value. A change on the landing fails here until the product card follows it.
const landingRoot = new URL('../../landing/', import.meta.url);
const appRoot = new URL('../', import.meta.url);
const text = (root: URL, path: string) => readFileSync(new URL(path, root), 'utf8');
const bytes = (root: URL, path: string) => readFileSync(new URL(path, root));

type Rules = Map<string, Map<string, string>>;

/** Top-level rules only: @media blocks are presentation fallbacks, not the approved card. */
function parseCss(css: string): Rules {
  const flat = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@[^{}]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rules: Rules = new Map();
  for (const [, selectors, body] of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = new Map<string, string>();
    for (const part of body.split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '));
    }
    for (const selector of selectors.split(',')) {
      const key = selector.trim().replace(/\s*>\s*/g, '>').replace(/\s+/g, ' ');
      const merged = rules.get(key) ?? new Map<string, string>();
      for (const [name, value] of declarations) merged.set(name, value);
      rules.set(key, merged);
    }
  }
  return rules;
}

const landingCss = parseCss(text(landingRoot, 'selected-cards/selected-cards.css'));
const landingBase = parseCss(text(landingRoot, 'site/styles.css'));
const cardCss = parseCss(text(appRoot, 'extension/card.css'));
const tokens = parseCss(text(appRoot, 'extension/tokens.css')).get(':root') ?? new Map<string, string>();
const landingTokens = new Map([
  ...(landingBase.get(':root') ?? []),
  ...[...(landingCss.get('.selected-card') ?? [])].filter(([name]) => name.startsWith('--clue-') || name === '--selected-height'),
]);

function declared(rules: Rules, selector: string, property: string) {
  const value = rules.get(selector)?.get(property);
  assert.ok(value !== undefined, `${selector} declares ${property}`);
  return value;
}
const resolve = (value: string, variables: Map<string, string>) =>
  value.replace(/var\((--[\w-]+)\)/g, (whole, name: string) => variables.get(name) ?? whole);
const normal = (value: string) =>
  value
    .toLowerCase()
    .replace(/url\('[^']*\/([^'/]+)'\)/g, 'url($1)')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*\/\s*/g, '/')
    .replace(/(^|[\s(,])(-?)\.(\d)/g, '$1$20.$3')
    .replace(/\s+/g, ' ')
    .trim();
/** card.css in landing pixels: one --cut-u is one pixel of the landing's 300 px card. */
const landingPixels = (value: string) =>
  value
    .replace(/calc\((-?[\d.]+) \* var\(--cut-u\)\)/g, '$1px')
    .replace(/(-?[\d.]+) \* var\(--cut-u\)/g, '$1px')
    .replace(/max\([\d.]+px, (-?[\d.]+px)\)/g, '$1')
    .replace(/--cut-/g, '--selected-');
const landingValue = (selector: string, property: string, rules = landingCss) =>
  normal(resolve(declared(rules, selector, property), landingTokens));
const cardValue = (selector: string, property: string) =>
  normal(landingPixels(resolve(declared(cardCss, selector, property), tokens)));

/** "600 12px / 1.333 var(--b-ui)" as numbers, with the line height in pixels. */
function font(value: string) {
  const match = /^(?:(\d+) )?(-?[\d.]+)px ?\/ ?([\d.]+)(px)? /.exec(normal(landingPixels(value)).replace(/\//, ' / ') + ' ');
  assert.ok(match, `font shorthand ${value}`);
  const size = Number(match[2]);
  return { weight: match[1] ? Number(match[1]) : undefined, size, line: match[4] ? Number(match[3]) : Number(match[3]) * size };
}
const px = (value: string) => Number(/^(-?[\d.]+)px$/.exec(normal(value))?.[1]);

test('the app restates the landing card values in landing pixels', () => {
  // [landing selector, property, card.css selector, card.css property]
  const pairs: [string, string, string, string?][] = [
    ['.selected-card', '--selected-art', '.cut-card', '--cut-art'],
    ['.selected-card', '--selected-pad-top', '.cut-card', '--cut-pad-top'],
    ['.selected-card', '--selected-pad-x', '.cut-card', '--cut-pad-x'],
    ['.selected-card', '--selected-top', '.cut-card', '--cut-top'],
    ['.selected-card', 'padding', '.cut-card'],
    ['.selected-card', 'background', '.cut-card'],
    ['.selected-card', 'color', '.cut-card'],
    ['.selected-card', 'border-radius', '.cut-card'],
    ['.selected-card', 'border-radius', '.prism-back'],
    ['.selected-card .selected-glass-field', 'top', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'left', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'width', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'height', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'z-index', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'background', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'background-size', '.cut-card__field'],
    ['.selected-card .selected-glass-field', 'clip-path', '.cut-card__field'],
    ['.selected-card .card-top>span:first-child', 'padding', '.cut-card__chip'],
    ['.selected-card .card-top>span:first-child', 'background', '.cut-card__chip'],
    ['.selected-card .card-top>span:first-child', 'border-radius', '.cut-card__chip'],
    ['.selected-card .card-pips', 'padding', '.cut-card__pips'],
    ['.selected-card .card-pips', 'background', '.cut-card__pips'],
    ['.selected-card .card-pips', 'border-radius', '.cut-card__pips'],
    ['.selected-card .card-pips', 'gap', '.cut-card__pips'],
    ['.selected-card .card-pips i', 'width', '.cut-card__pips i'],
    ['.selected-card .card-pips i', 'height', '.cut-card__pips i'],
    ['.selected-card .card-art', 'flex', '.cut-card__art'],
    ['.selected-card .card-art', 'width', '.cut-card__art'],
    ['.selected-card .card-art', 'height', '.cut-card__art'],
    ['.selected-card .card-art', 'min-height', '.cut-card__art'],
    ['.selected-card .card-art', 'margin', '.cut-card__art'],
    ['.selected-card .card-art', 'isolation', '.cut-card__art'],
    ['.selected-card .card-art::after', 'left', '.cut-card__art::after'],
    ['.selected-card .card-art::after', 'right', '.cut-card__art::after'],
    ['.selected-card .card-art::after', 'bottom', '.cut-card__art::after'],
    ['.selected-card .card-art::after', 'height', '.cut-card__art::after'],
    ['.selected-card .card-art::after', 'background', '.cut-card__art::after'],
    ['.selected-card .card-art::after', 'clip-path', '.cut-card__art::after'],
    ['.selected-card__square', 'display', '.cut-card__square'],
    ['.selected-card__square', 'position', '.cut-card__square'],
    ['.selected-card__square', 'height', '.cut-card__square'],
    ['.selected-card__square', 'aspect-ratio', '.cut-card__square'],
    ['.selected-card__square', 'max-width', '.cut-card__square'],
    ['.selected-card .card-art img', 'inset', '.cut-card__reveal'],
    ['.selected-card .card-art img', 'object-fit', '.cut-card__image'],
    ['.selected-card .card-art img', 'image-rendering', '.cut-card__image'],
    ['.selected-card__pixels', 'image-rendering', '.cut-card__pixels'],
    ['.selected-card__plate', 'flex', '.cut-card__plate'],
    ['.selected-card__plate', 'min-height', '.cut-card__plate'],
    ['.selected-card__plate', 'margin', '.cut-card__plate'],
    ['.selected-card__plate', 'padding', '.cut-card__plate'],
    ['.selected-card .card-word', 'letter-spacing', '.cut-card__word'],
    ['.selected-card .card-forbidden', 'margin-top', '.cut-card__rules'],
    ['.selected-card .card-forbidden__label', 'color', '.cut-card__rules-label'],
    ['.selected-card[data-clue=rail] .card-forbidden__label', 'gap', '.cut-card__rules-label'],
    ['.selected-card[data-clue=rail] .card-forbidden__label::before', 'width', '.cut-card__rules-label::before'],
    ['.selected-card[data-clue=rail] .card-forbidden__label::before', 'border-top', '.cut-card__rules-label::before'],
    ['.selected-card .card-clues', 'grid-template-columns', '.cut-card__clues'],
    ['.selected-card .card-clues', 'justify-content', '.cut-card__clues'],
    ['.selected-card[data-clue=rail] .card-clues', 'justify-items', '.cut-card__clues'],
    ['.selected-card[data-clue=rail] .card-clues', 'gap', '.cut-card__clues'],
    ['.selected-card[data-clue=rail] .card-clues li', 'justify-content', '.cut-card__clues li'],
    ['.selected-card:not([data-clue=baseline]) .card-clues li', 'letter-spacing', '.cut-card__clues li'],
    ['.selected-card:not([data-clue=baseline]) .card-clues li', 'color', '.cut-card__clues li'],
    ['.selected-card .card-clues li', 'gap', '.cut-card__clues li'],
    ['.selected-card .card-clues li::before', 'width', '.cut-card__clues li::before'],
    ['.selected-card .card-clues li::before', 'height', '.cut-card__clues li::before'],
    ['.selected-card .card-easy', 'margin', '.cut-card__note'],
    ['.selected-card .card-easy', 'color', '.cut-card__note'],
    ['.selected-card .card-question', 'margin', '.cut-card__question'],
    ['.selected-card .card-question', 'color', '.cut-card__question'],
    ['.selected-card .card-footer', 'margin-top', '.cut-card__footer'],
    ['.selected-card .card-footer', 'padding-top', '.cut-card__footer'],
    ['.selected-card .card-footer', 'min-height', '.cut-card__footer'],
    ['.selected-card__signature', 'width', '.cut-card .cut-card__signature'],
    ['.selected-card__back', 'background', '.prism-back'],
    ['.selected-card__back::after', 'inset', '.prism-back::after'],
    ['.selected-card__back::after', 'border', '.prism-back::after'],
    ['.selected-card__back::after', 'border-radius', '.prism-back::after'],
    ['.selected-card__back img', 'width', '.prism-back .prism-back__mark'],
  ];
  for (const [landing, property, card, cardProperty = property] of pairs)
    assert.equal(cardValue(card, cardProperty), landingValue(landing, property), `${card} ${cardProperty} follows ${landing} ${property}`);

  // The base card under the selected one: edge, lit top edge and drop shadow.
  for (const selector of ['.cut-card', '.prism-back']) {
    for (const property of ['border', 'border-top-color', 'box-shadow'])
      assert.equal(cardValue(selector, property), landingValue('.bait-card', property, landingBase), `${selector} ${property}`);
  }
  assert.equal(cardValue('.cut-card__top', 'letter-spacing'), landingValue('.card-top', 'letter-spacing', landingBase));
  assert.equal(cardValue('.cut-card__top', 'justify-content'), landingValue('.card-top', 'justify-content', landingBase));
  assert.equal(cardValue('.cut-card__pips i', 'border'), landingValue('.card-pips i', 'border', landingBase));
  assert.equal(
    cardValue('.cut-card__footer', 'border-top'),
    `1px solid ${landingValue('.selected-card .card-footer', 'border-color')}`,
  );
  assert.equal(cardValue('.cut-card .cut-card__signature', 'color'), landingValue('.selected-card__signature', 'background'));
  assert.equal(
    cardValue('.cut-card__rules-label', 'margin'),
    `0 0 ${landingValue('.selected-card[data-clue=rail] .card-forbidden__label', 'margin-bottom')}`,
  );
  // Rules that outrank the landing values are listed here on purpose. The only product
  // guard lets a streamer's long custom clue wrap inside the card.
  assert.deepEqual(
    [...cardCss.keys()].filter((selector) => selector.startsWith('.cut-card .')).sort(),
    ['.cut-card .cut-card__clues', '.cut-card .cut-card__clues li', '.cut-card .cut-card__signature'],
  );
  assert.equal(cardValue('.cut-card .cut-card__clues', 'grid-template-columns'), 'repeat(2,minmax(0,max-content))');
  // rgb(201 168 255 / 18%) is #c9a8ff at alpha 0x2e.
  assert.match(landingValue('.card-pips i.is-filled', 'box-shadow', landingBase), /^0 0 0 2\.5px rgb\(201 168 255\/18%\)$/);
  assert.equal(cardValue('.cut-card__pips i[data-filled=\'true\']', 'box-shadow'), '0 0 0 2.5px #c9a8ff2e');
});

test('type sizes and line heights match the landing at 300 px', () => {
  const close = (actual: number, expected: number, label: string) =>
    assert.ok(Math.abs(actual - expected) < 0.05, `${label}: ${actual} is ${expected}`);
  const word = font(declared(cardCss, '.cut-card__word', 'font'));
  assert.equal(word.size, px(landingValue('.selected-card .card-word', 'font-size')));
  close(word.line / word.size, Number(landingValue('.selected-card .card-word', 'line-height')), 'word line height');
  assert.equal(
    px(cardValue(".cut-card__word[data-word-size='medium']", 'font-size')),
    px(landingValue('.selected-card .card-word--long', 'font-size')),
  );
  const top = font(declared(cardCss, '.cut-card__top', 'font'));
  assert.equal(top.size, px(landingValue('.card-top', 'font-size', landingBase)));
  assert.equal(top.weight, Number(landingValue('.card-top', 'font-weight', landingBase)));
  close(top.line / top.size, Number(landingValue('.card-top', 'line-height', landingBase)), 'top row line height');
  assert.equal(font(declared(cardCss, '.cut-card__chip', 'font')).size, px(landingValue('.selected-card .card-top>span:first-child', 'font-size')));

  const label = font(declared(cardCss, '.cut-card__rules-label', 'font'));
  assert.equal(label.size, px(landingValue('.selected-card .card-forbidden__label', 'font-size')));
  close(label.line, px(landingValue('.selected-card .card-forbidden__label', 'line-height')), 'clue label line');
  assert.equal(label.weight, Number(landingValue('.selected-card .card-forbidden__label', 'font-weight')));

  const clue = font(declared(cardCss, '.cut-card__clues li', 'font'));
  const landingClue = font(declared(landingCss, '.selected-card .card-clues li', 'font'));
  assert.equal(clue.size, landingClue.size);
  assert.equal(clue.weight, landingClue.weight);
  close(clue.line, landingClue.line, 'clue line');

  const note = font(declared(cardCss, '.cut-card__note', 'font'));
  const landingNote = font(declared(landingCss, '.selected-card .card-easy', 'font'));
  assert.deepEqual([note.size, note.weight], [landingNote.size, landingNote.weight]);
  close(note.line, landingNote.line, 'easy note line');

  const question = font(declared(cardCss, '.cut-card__question', 'font'));
  assert.equal(question.size, px(landingValue('.selected-card .card-question', 'font-size')));
  close(question.line, px(landingValue('.selected-card .card-question', 'line-height')), 'question line');
});

test('the approved card has no glint, and neither does any product card', () => {
  assert.equal(landingValue('.selected-card::after', 'display'), 'none');
  assert.equal(cardCss.has('.cut-card::after'), false);
  for (const path of ['extension/card.css', 'extension/overlay.css', 'client/result-card.css', 'client/cut-card.css'])
    assert.doesNotMatch(text(appRoot, path).replace(/\/\*[\s\S]*?\*\//g, ''), /glint/i, `${path} has no glint`);
});

test('Glass rules, word steps and the pixel reveal are the landing\'s own', async () => {
  const landing = await import(new URL('selected-cards/selected-cards.js', landingRoot).href);
  assert.deepEqual({ ...landing.selectedCardStyle }, { edition: 'cut-open', finish: 'glass', back: 'prism', artFrame: 'open' });
  assert.equal(glassRules(landing.glassOptics.pitch), landing.glassRules(landing.glassOptics.pitch));

  const source = text(landingRoot, 'selected-cards/selected-cards.js');
  const opacity = Number(/function glass\(\)[\s\S]*?rules\(([\d.]+)\)/.exec(source)?.[1]);
  assert.equal(opacity, 0.22);
  const field = renderToStaticMarkup(React.createElement(CutCard, { word: 'volcano' }));
  assert.match(field, new RegExp(`stroke-opacity="${opacity}" stroke-width="${landing.glassOptics.line}"`));
  for (const page of ['extension/viewer.html', 'extension/overlay.html'])
    assert.match(text(appRoot, page), new RegExp(`stroke-opacity="${opacity}" stroke-width="${landing.glassOptics.line}"`), page);

  const steps = /const steps = \[([^\]]+)\]/.exec(source)?.[1].split(',').map(Number);
  assert.deepEqual([...PIXEL_STEPS], steps);
  assert.equal(PIXEL_REVEAL_MS, Number(/elapsed >= (\d+)/.exec(source)?.[1]));
  assert.equal(PIXEL_STEP_MS, Number(/elapsed \/ (\d+)/.exec(source)?.[1]));

  const threshold = Number(/card\.word\.length > (\d+)/.exec(source)?.[1]);
  assert.equal(threshold, 10);
  for (const { word } of catalogue)
    assert.equal(cardWordSize(word) !== 'short', word.length > threshold, `${word} steps down only past ${threshold} letters`);
});

test('the Prism back is the landing\'s image, byte for byte, on every surface', () => {
  const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
  const source = bytes(appRoot, 'public/card-lab/backs/back-prism.webp');
  assert.equal(sha(bytes(appRoot, 'extension/assets/back-prism.webp')), sha(source));
  assert.match(text(landingRoot, 'scripts/build-site.mjs'), /public\/card-lab\/backs\/back-prism\.webp/);
  assert.match(renderToStaticMarkup(React.createElement(CardBack)), /class="prism-back"[^>]*><span class="prism-back__mark baited-glyph"/);
  const face = renderToStaticMarkup(React.createElement(CutCard, { word: 'volcano' }));
  assert.match(face, /data-edition="cut-open" data-finish="glass" data-art-frame="open"/);
  assert.match(face, /class="cut-card__reveal"><img[^>]*class="bait-card-art cut-card__image"[^>]*><canvas class="cut-card__pixels" width="1" height="1"/);
});

interface FakeCanvas {
  width: number;
  height: number;
  drawn: number[];
  getContext(kind: string): unknown;
}
function revealHarness({ reduced = false, hidden = false, frames = true } = {}) {
  const saved = {
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
    doc: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    media: globalThis.matchMedia,
  };
  const queue: FrameRequestCallback[] = [];
  const listeners = new Map<string, () => void>();
  if (frames) {
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => queue.push(callback);
    globalThis.cancelAnimationFrame = () => queue.splice(0);
  } else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { hidden, addEventListener: (name: string, fn: () => void) => listeners.set(name, fn), removeEventListener: (name: string) => listeners.delete(name) },
  });
  globalThis.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce') })) as typeof matchMedia;
  const canvas: FakeCanvas = {
    width: 1,
    height: 1,
    drawn: [],
    getContext: () => ({ imageSmoothingEnabled: true, clearRect() {}, drawImage: (_: unknown, __: number, ___: number, width: number) => canvas.drawn.push(width) }),
  };
  const holder = { dataset: {} as Record<string, string> };
  const image = { complete: true, naturalWidth: 1254, naturalHeight: 1254 };
  const run = (time: number) => queue.splice(0).forEach((callback) => callback(time));
  const put = (name: string, value: unknown) =>
    value === undefined ? Reflect.deleteProperty(globalThis, name) : Reflect.set(globalThis, name, value);
  const restore = () => {
    put('requestAnimationFrame', saved.raf);
    put('cancelAnimationFrame', saved.caf);
    put('matchMedia', saved.media);
    if (saved.doc) Object.defineProperty(globalThis, 'document', saved.doc);
    else Reflect.deleteProperty(globalThis, 'document');
  };
  const start = (hold = 0) =>
    revealPixels({ holder: holder as unknown as HTMLElement, image: image as unknown as HTMLImageElement, canvas: canvas as unknown as HTMLCanvasElement, hold });
  return { canvas, holder, listeners, run, restore, start, queue };
}

test('the pixel reveal steps through the landing blocks and always empties its canvas', () => {
  const play = revealHarness();
  try {
    play.start();
    assert.equal(play.holder.dataset.resolving, 'true');
    assert.deepEqual(play.canvas.drawn, [8], 'the coarsest step paints at once, before any finished image shows');
    for (let time = 0; time <= 700; time += 30) play.run(time);
    assert.deepEqual(play.canvas.drawn, [...PIXEL_STEPS]);
    assert.equal(play.holder.dataset.resolving, 'false');
    assert.deepEqual([play.canvas.width, play.canvas.height], [1, 1], 'a finished reveal keeps no artwork in the canvas');
    assert.equal(play.listeners.size, 0);
  } finally {
    play.restore();
  }

  const stopped = revealHarness();
  try {
    const stop = stopped.start(200);
    stopped.run(0);
    stopped.run(150);
    assert.deepEqual(stopped.canvas.drawn, [8], 'the hold keeps the coarsest step while a face turns');
    stop();
    assert.deepEqual([stopped.canvas.width, stopped.canvas.height], [1, 1], 'clearing a card empties its pixels');
    assert.equal(stopped.holder.dataset.resolving, 'false');
    assert.equal(stopped.queue.length, 0);
  } finally {
    stopped.restore();
  }

  const hiding = revealHarness();
  try {
    hiding.start();
    (globalThis.document as { hidden: boolean }).hidden = true;
    hiding.listeners.get('visibilitychange')?.();
    assert.deepEqual([hiding.canvas.width, hiding.canvas.height], [1, 1], 'a hidden page stops and empties the reveal');
  } finally {
    hiding.restore();
  }

  for (const options of [{ reduced: true }, { hidden: true }, { frames: false }]) {
    const still = revealHarness(options);
    try {
      still.start()();
      assert.deepEqual(still.canvas.drawn, [], `${JSON.stringify(options)} shows the finished image`);
      assert.equal(still.holder.dataset.resolving, undefined);
    } finally {
      still.restore();
    }
  }
});
