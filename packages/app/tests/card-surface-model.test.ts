import test from 'node:test';
import assert from 'node:assert/strict';
import { backs, finishes, finishHost, backShowsLogo, isBackId, isFinishId, isLogoMode } from '../client/card-finish-catalogue';
import { editions, parsePicks, type Picks } from '../client/card-lab-model';
import { CARD_SURFACE_STORAGE_KEY, DEFAULT_SURFACE_SELECTION, MAX_SURFACE_PAIRINGS, emptySurfaceReview, parseSurfaceChoice, parseSurfaceReview, parseSurfaceUrl, type SurfaceReview, type SurfaceSelection } from '../client/card-surface-model';

test('the catalogue contains exactly the approved materials and same-origin asset paths', () => {
  assert.deepEqual(finishes.map(item => item.id), ['stock', 'dither', 'prism', 'engraved', 'velvet', 'spotlight', 'glass']);
  assert.deepEqual(backs.map(item => item.id), ['current', 'dither', 'mosaic', 'prism', 'seal']);
  for (const item of [...finishes, ...backs]) {
    for (const path of [item.asset, item.swatch]) if (path) assert.match(path, /^\/card-lab\/(?:finishes|backs)\/[a-z-]+\.(?:webp|svg)$/);
  }
  assert.equal(finishes.filter(item => item.source === 'generated').length, 4);
  assert.equal(backs.filter(item => item.source === 'generated').length, 3);
});

test('finish hosts preserve own-stock editions, the Cut slab and all full-card editions', () => {
  for (const edition of editions) assert.equal(finishHost(edition.id), ['cut', 'cut-reveal', 'cut-open'].includes(edition.id) ? 'slab' : ['baseline', 'pixel', 'wide'].includes(edition.id) ? 'own' : 'full');
  for (const back of backs) {
    assert.equal(backShowsLogo(back.id, 'designed'), back.id !== 'seal');
    assert.equal(backShowsLogo(back.id, 'on'), true);
    assert.equal(backShowsLogo(back.id, 'off'), false);
  }
});

test('simple selections round-trip and unknown fields fall back independently', () => {
  const chosen = { version: 1, finish: 'engraved', back: 'mosaic', logo: 'off' };
  assert.deepEqual(parseSurfaceChoice(JSON.stringify(chosen)), chosen);
  assert.deepEqual(parseSurfaceChoice('{"version":1,"finish":"retired","back":"seal","logo":false}'), { version: 1, finish: 'stock', back: 'seal', logo: 'designed' });
  assert.deepEqual(parseSurfaceChoice(null, { finish: 'velvet', back: 'seal', logo: 'on' }), { version: 1, finish: 'velvet', back: 'seal', logo: 'on' });
  assert.throws(() => parseSurfaceChoice(null, { ...DEFAULT_SURFACE_SELECTION, finish: 'invented' } as unknown as SurfaceSelection), TypeError);
});

test('missing, corrupt and incompatible saves reset independently of prior results', () => {
  for (const source of [undefined, null, '', '{', 'null', '[]', '42', 'true', '"prism"', '{}', '{"version":2}', '{"version":"1"}']) assert.deepEqual(parseSurfaceReview(source), emptySurfaceReview(), String(source));
  const changed = emptySurfaceReview();
  changed.notes['front:prism'] = 'one browser choice';
  changed.finish = 'prism';
  assert.deepEqual(parseSurfaceReview(null), emptySurfaceReview());
  assert.deepEqual(DEFAULT_SURFACE_SELECTION, { finish: 'stock', back: 'current', logo: 'designed' });
});

test('full reviews preserve preferences, intentional empty notes and saved pairings', () => {
  const review: SurfaceReview = {
    version: 1, finish: 'engraved', back: 'mosaic', logo: 'designed', preferredFinish: 'prism', preferredBack: 'seal',
    notes: { 'front:engraved': '', 'back:mosaic': 'Check the fan.' },
    pairings: [{ edition: 'table-reveal', finish: 'engraved', back: 'mosaic', logo: 'designed', note: '', context: 'panel' }],
    updatedAt: '2026-10-27T01:00:00.000Z',
  };
  assert.deepEqual(parseSurfaceReview(JSON.stringify(review)), review);
  assert.deepEqual(JSON.parse(JSON.stringify(parseSurfaceReview(JSON.stringify(review)))), review);
});

test('review parser bounds notes and pairings and rejects unknown editions, contexts and IDs', () => {
  const pairing = { edition: 'table', finish: 'prism', back: 'mosaic', logo: 'on', context: 'panel', note: 'x'.repeat(1200), asset: 'https://example.invalid/art.png' };
  const parsed = parseSurfaceReview(JSON.stringify({
    version: 1, preferredFinish: '__proto__', preferredBack: 'https://example.invalid',
    notes: { 'front:engraved': 'x'.repeat(1200), 'back:seal': '', 'front:unknown': 'discard', 'front:prism': 8 },
    pairings: [{ ...pairing, edition: 'unshipped' }, { ...pairing, context: 'room' }, { ...pairing, logo: true }, { ...pairing, finish: 'https://example.invalid' }, ...Array.from({ length: 15 }, () => pairing)],
    updatedAt: 'not a date',
  }));
  assert.equal(parsed.preferredFinish, null);
  assert.equal(parsed.preferredBack, null);
  assert.deepEqual(Object.keys(parsed.notes), ['front:engraved', 'back:seal']);
  assert.equal(parsed.notes['front:engraved']!.length, 1000);
  assert.equal(parsed.pairings.length, MAX_SURFACE_PAIRINGS);
  assert.equal(parsed.pairings[0].note.length, 1000);
  assert.equal('asset' in parsed.pairings[0], false);
  assert.equal(parsed.updatedAt, '');
});

test('arbitrary URLs, prototype properties and live-game fields cannot enter selections or exports', () => {
  for (const invalid of ['__proto__', 'constructor', 'https://example.invalid/a.webp', '../prism', 'javascript:alert(1)', null, 1]) {
    assert.equal(isFinishId(invalid), false); assert.equal(isBackId(invalid), false); assert.equal(isLogoMode(invalid), false);
  }
  const parsed = parseSurfaceReview('{"version":1,"finish":"https://example.invalid","back":"__proto__","logo":"javascript:alert(1)","__proto__":{"polluted":true},"notes":{"__proto__":{"polluted":true}},"room":{"target":"private"},"token":"private"}');
  assert.deepEqual(parsed, emptySurfaceReview());
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
  assert.equal(JSON.stringify(parsed).includes('private'), false);
});

test('URL state uses only known IDs and works without browser globals', () => {
  assert.equal(parseSurfaceUrl('?finish=glass').finish, 'glass');
  assert.deepEqual(parseSurfaceUrl('?finish=velvet&back=seal&logo=off&view=gallery'), { finish: 'velvet', back: 'seal', logo: 'off', view: 'gallery' });
  assert.deepEqual(parseSurfaceUrl('?finish=https%3A%2F%2Fexample.invalid&back=__proto__&logo=true&view=https%3A%2F%2Fexample.invalid'), { ...DEFAULT_SURFACE_SELECTION, view: 'stage' });
  const params = new URLSearchParams('back=prism');
  assert.deepEqual(parseSurfaceUrl(params, { finish: 'engraved', back: 'seal', logo: 'off' }), { finish: 'engraved', back: 'prism', logo: 'off', view: 'stage' });
  assert.equal(params.toString(), 'back=prism');
});

test('surface parsing leaves existing version-one edition picks and their export intact', () => {
  assert.notEqual(CARD_SURFACE_STORAGE_KEY, 'baited.card-lab.v1');
  const picks: Picks = { version: 1, preferred: 'glance-reveal', picks: { 'glance-reveal': { note: 'Existing choice.', reviewed: ['panel'], experimental: false } }, updatedAt: '2026-10-27T01:00:00.000Z' };
  const before = JSON.stringify(picks);
  parseSurfaceReview('{"version":1,"finish":"engraved","back":"mosaic","logo":"designed","preferredFinish":"prism"}');
  assert.equal(JSON.stringify(picks), before);
  assert.deepEqual(parsePicks(before), picks);
});
