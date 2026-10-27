import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_CLUE_STORAGE_KEY, MAX_CLUE_NOTE_LENGTH, clueTreatments, emptyClueReview,
  isClueTreatmentId, parseClueReview, parseClueUrl, type ClueReview, type ClueTreatmentId,
} from '../client/card-clue-catalogue';
import { contexts, exactClues, parsePicks, reviewDeck, type Picks } from '../client/card-lab-model';
import { CARD_SURFACE_STORAGE_KEY, parseSurfaceReview, type SurfaceReview } from '../client/card-surface-model';

test('the catalogue exposes five fixed presentation IDs and rejects arbitrary identifiers', () => {
  assert.deepEqual(clueTreatments.map(item => item.id), ['baseline', 'pills', 'rail', 'tokens', 'quiet']);
  for (const item of clueTreatments) {
    assert.equal(isClueTreatmentId(item.id), true);
    assert.ok(item.name.trim());
    assert.ok(item.note.trim());
  }
  for (const invalid of [undefined, null, 0, true, {}, [], '__proto__', 'constructor', 'Pills', '../pills', 'https://example.invalid', 'javascript:alert(1)']) {
    assert.equal(isClueTreatmentId(invalid), false);
  }
});

test('fresh choices use the provisional Ruled proposal without sharing mutable state or setting a preference', () => {
  assert.deepEqual(emptyClueReview(), { version: 1, selected: 'rail', preferred: null, picks: {}, updatedAt: '' });
  const first = emptyClueReview();
  first.selected = 'quiet';
  first.preferred = 'tokens';
  first.picks.rail = { note: 'A local choice.', reviewed: ['panel'] };
  assert.deepEqual(parseClueReview(null), emptyClueReview());
  assert.deepEqual(parseClueReview(undefined), emptyClueReview());
});

test('selection and preference round-trip independently with all notes and reviewed contexts', () => {
  const saved: ClueReview = {
    version: 1, selected: 'quiet', preferred: 'rail',
    picks: {
      baseline: { note: '', reviewed: ['deck'] },
      pills: { note: 'Compare in the narrow panel.', reviewed: ['panel', 'phone'] },
      rail: { note: 'Preferred, even while inspecting another treatment.', reviewed: ['desktop', 'studio'] },
      tokens: { note: 'Check result state.', reviewed: ['obs'] },
      quiet: { note: 'Still considering.', reviewed: [] },
    },
    updatedAt: '2026-10-27T01:00:00.000Z',
  };
  assert.deepEqual(parseClueReview(JSON.stringify(saved)), saved);
  assert.deepEqual(JSON.parse(JSON.stringify(parseClueReview(JSON.stringify(saved)))), saved);
  assert.equal(parseClueReview(JSON.stringify({ ...saved, preferred: null })).preferred, null);
});

test('corrupt, primitive and incompatible storage resets without throwing', () => {
  for (const source of [undefined, null, '', '{', 'null', '[]', '42', 'true', '"rail"', '{}', '{"version":2}', '{"version":"1"}']) {
    assert.deepEqual(parseClueReview(source), emptyClueReview(), String(source));
  }
  for (const picks of [undefined, null, false, 1, 'pills', []]) {
    const result = parseClueReview(JSON.stringify({ version: 1, selected: 'quiet', preferred: 'tokens', picks }));
    assert.equal(result.selected, 'quiet');
    assert.equal(result.preferred, 'tokens');
    assert.deepEqual(result.picks, {});
  }
});

test('review parsing filters unknown fields, bounds notes and deduplicates known contexts', () => {
  const parsed = parseClueReview(JSON.stringify({
    version: 1, selected: 'retired', preferred: '__proto__',
    picks: {
      baseline: null, pills: [],
      rail: { note: 'x'.repeat(1200), reviewed: ['panel', 'panel', 'phone', 'https://example.invalid', 7, null, ...contexts.map(item => item[0])], asset: 'https://example.invalid' },
      tokens: { note: false, reviewed: 'panel' },
      quiet: { note: '<script>this remains plain note text</script>', reviewed: ['obs'] },
      invented: { note: 'discard', reviewed: ['panel'] },
    },
    updatedAt: 'not a date',
  }));
  assert.equal(parsed.selected, 'rail');
  assert.equal(parsed.preferred, null);
  assert.deepEqual(Object.keys(parsed.picks), ['rail', 'tokens', 'quiet']);
  assert.equal(parsed.picks.rail!.note.length, MAX_CLUE_NOTE_LENGTH);
  assert.deepEqual(parsed.picks.rail!.reviewed, ['panel', 'phone', 'deck', 'desktop', 'studio', 'obs']);
  assert.deepEqual(parsed.picks.tokens, { note: '', reviewed: [] });
  assert.equal(parsed.picks.quiet!.note, '<script>this remains plain note text</script>');
  assert.equal('asset' in parsed.picks.rail!, false);
  assert.equal(parsed.updatedAt, '');
});

test('timestamps preserve valid UTC exports and reject malformed or impossible dates', () => {
  for (const updatedAt of [42, null, 'today', '2026-10-27', '2026-02-31T01:00:00.000Z', '2026-10-27T01:00:00+00:00']) {
    assert.equal(parseClueReview(JSON.stringify({ version: 1, updatedAt })).updatedAt, '');
  }
  const timestamp = '2026-10-27T01:00:00.000Z';
  assert.equal(parseClueReview(JSON.stringify({ version: 1, updatedAt: timestamp })).updatedAt, timestamp);
});

test('prototype keys and live word data cannot enter saved treatment reviews', () => {
  const value = parseClueReview('{"version":1,"selected":"rail","preferred":"tokens","__proto__":{"polluted":true},"picks":{"__proto__":{"polluted":true},"rail":{"note":"","reviewed":["panel"],"clues":["secret"],"word":"private"}},"word":"private","clues":["secret"],"token":"private"}');
  assert.deepEqual(value, { version: 1, selected: 'rail', preferred: 'tokens', picks: { rail: { note: '', reviewed: ['panel'] } }, updatedAt: '' });
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.getPrototypeOf(value.picks), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
  assert.equal(JSON.stringify(value).includes('private'), false);
  assert.equal(JSON.stringify(value).includes('secret'), false);
});

test('URL selection accepts only clue IDs and preserves caller defaults and parameters', () => {
  assert.equal(parseClueUrl(''), 'rail');
  for (const { id } of clueTreatments) assert.equal(parseClueUrl(`?clue=${id}`), id);
  assert.equal(parseClueUrl('?clue=%72ail'), 'rail');
  for (const invalid of ['__proto__', 'constructor', 'Pills', '../pills', 'https://example.invalid', '%E0%A4%A', '']) {
    assert.equal(parseClueUrl(`?clue=${invalid}`, 'quiet'), 'quiet');
  }
  assert.equal(parseClueUrl('?clue=rail&clue=quiet'), 'rail');
  assert.equal(parseClueUrl('?clue=unknown&clue=rail', 'tokens'), 'tokens');
  const params = new URLSearchParams('clue=rail&finish=glass&view=clues');
  const before = params.toString();
  assert.equal(parseClueUrl(params, 'baseline'), 'rail');
  assert.equal(params.toString(), before);
  assert.throws(() => parseClueUrl('', 'invented' as ClueTreatmentId), TypeError);
});

test('clue review storage stays independent of existing edition, surface and playable clue data', () => {
  assert.equal(CARD_CLUE_STORAGE_KEY, 'baited.card-clues.v1');
  assert.notEqual(CARD_CLUE_STORAGE_KEY, 'baited.card-lab.v1');
  assert.notEqual(CARD_CLUE_STORAGE_KEY, CARD_SURFACE_STORAGE_KEY);
  const picks: Picks = { version: 1, preferred: 'table-reveal', picks: { 'table-reveal': { note: 'Keep.', reviewed: ['panel'], experimental: false } }, updatedAt: '2026-10-27T01:00:00.000Z' };
  const surfaces: SurfaceReview = { version: 1, finish: 'glass', back: 'mosaic', logo: 'designed', preferredFinish: 'glass', preferredBack: null, notes: { 'front:glass': 'Bend on.' }, pairings: [], updatedAt: '2026-10-27T01:00:00.000Z' };
  const picksJSON = JSON.stringify(picks);
  const surfacesJSON = JSON.stringify(surfaces);
  const cluesBefore = reviewDeck.map(entry => exactClues(entry));
  parseClueReview('{"version":1,"selected":"tokens","preferred":"rail","picks":{"rail":{"note":"Compare.","reviewed":["panel"]}},"clues":["override"]}');
  assert.equal(JSON.stringify(picks), picksJSON);
  assert.equal(JSON.stringify(surfaces), surfacesJSON);
  assert.deepEqual(parsePicks(picksJSON), picks);
  assert.deepEqual(parseSurfaceReview(surfacesJSON), surfaces);
  assert.deepEqual(reviewDeck.map(entry => exactClues(entry)), cluesBefore);
  assert.deepEqual([...new Set(reviewDeck.map(entry => exactClues(entry).length))].sort(), [0, 2, 4]);
});
