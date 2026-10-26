import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_SURFACE_STORAGE_KEY, parseSurfaceChoice, type SurfaceChoice } from '../client/card-surface-model';

// These are parser fixtures, not proposed finish or back designs.
const finishes = ['finish-a', 'finish-b'] as const;
const backs = ['back-a', 'back-b'] as const;
const defaults = Object.freeze({ finish: finishes[0], back: backs[0], showLogo: true });
const parse = (source: string | null | undefined) => parseSurfaceChoice(source, finishes, backs, defaults);

test('surface choices have independent storage and a plain JSON export that preserves false', () => {
  assert.notEqual(CARD_SURFACE_STORAGE_KEY, 'baited.card-lab.v1');
  const choice: SurfaceChoice = { version: 1, finish: 'finish-b', back: 'back-b', showLogo: false };
  assert.deepEqual(parse(JSON.stringify(choice)), choice);
  assert.deepEqual(JSON.parse(JSON.stringify(parse(JSON.stringify(choice)))), choice);
});

test('missing, corrupt and incompatible saves fall back without changing the supplied defaults', () => {
  for (const source of [undefined, null, '', '{', 'null', '[]', '42', 'true', '"finish-b"', '{}', '{"version":2}', '{"version":"1"}']) {
    assert.deepEqual(parse(source), { version: 1, ...defaults }, String(source));
  }
  const result = parse(null);
  result.finish = 'finish-b';
  assert.equal(parse(null).finish, 'finish-a');
  assert.deepEqual(defaults, { finish: 'finish-a', back: 'back-a', showLogo: true });
});

test('invalid fields fall back independently while recognized IDs are preserved', () => {
  assert.deepEqual(parse('{"version":1,"finish":"retired-finish","back":"back-b","showLogo":"false"}'), {
    version: 1, finish: 'finish-a', back: 'back-b', showLogo: true,
  });
  assert.deepEqual(parse('{"version":1,"finish":"finish-b","back":null,"showLogo":false}'), {
    version: 1, finish: 'finish-b', back: 'back-a', showLogo: false,
  });
});

test('saved URLs, prototype-like properties and unrelated data never enter the output', () => {
  const source = '{"version":1,"finish":"https://example.invalid/foil.png","back":"__proto__","showLogo":true,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"imageUrl":"javascript:alert(1)","room":{"target":"private"},"picks":{"table":{"note":"keep separate"}}}';
  const result = parse(source);
  assert.deepEqual(result, { version: 1, ...defaults });
  assert.deepEqual(Object.keys(result), ['version', 'finish', 'back', 'showLogo']);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('invalid caller defaults fail explicitly instead of selecting an arbitrary design', () => {
  assert.throws(() => parseSurfaceChoice(null, finishes, backs, { ...defaults, finish: 'unknown' }), TypeError);
  assert.throws(() => parseSurfaceChoice(null, finishes, [], defaults), TypeError);
  assert.throws(() => parseSurfaceChoice(null, finishes, backs, { ...defaults, showLogo: 'false' as unknown as boolean }), TypeError);
});
