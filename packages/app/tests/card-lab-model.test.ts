import test from 'node:test';
import assert from 'node:assert/strict';
import { exactClues, generic, emptyPicks, parsePicks, reviewDeck, editions, type Picks } from '../client/card-lab-model';
import { words } from '../server/words';
import { forbiddenClues } from '../server/cards';
import type { Difficulty } from '../shared/types';

test('the lab uses all 78 real words with their actual difficulty and exact playable clues', () => {
  const actual = Object.entries(words).flatMap(([difficulty, pool]) => pool.map(word => ({ word, difficulty })));
  assert.equal(reviewDeck.length, 78);
  assert.equal(new Set(reviewDeck.map(entry => entry.word)).size, 78);
  assert.deepEqual(reviewDeck.map(entry => entry.word).sort(), actual.map(entry => entry.word).sort());
  for (const entry of reviewDeck) {
    const expected = actual.find(item => item.word === entry.word)!;
    assert.equal(entry.difficulty, expected.difficulty, entry.word);
    assert.deepEqual(exactClues(entry), forbiddenClues(entry.word, expected.difficulty as Difficulty), entry.word);
  }
});

test('clue selection does not mutate the shared catalogue or invent hard-mode easy cards', () => {
  const dinosaur = reviewDeck.find(entry => entry.word === 'dinosaur')!;
  const marshmallow = reviewDeck.find(entry => entry.word === 'marshmallow')!;
  const alchemy = reviewDeck.find(entry => entry.word === 'alchemy')!;
  assert.deepEqual(exactClues(dinosaur), []);
  assert.deepEqual(exactClues(marshmallow), ['sugar', 'campfire']);
  assert.deepEqual(exactClues(alchemy), ['gold', 'transmutation', 'metal', 'elixir']);
  const copy = exactClues(alchemy);
  copy[0] = 'changed only in test';
  assert.equal(alchemy.clues[0], 'gold');
  assert.equal(generic.synthetic, true);
  assert.equal(reviewDeck.some(entry => entry.word === generic.word), false);
});

test('exported picks round-trip without losing preferred edition, empty notes or reviewed contexts', () => {
  const saved: Picks = {
    version: 1,
    preferred: 'foil',
    picks: {
      table: { note: '', reviewed: ['deck', 'panel'], experimental: false },
      foil: { note: 'Win reveal only.', reviewed: ['obs'], experimental: false },
      picture: { note: 'Keep experimental.', reviewed: ['phone'], experimental: true },
    },
    updatedAt: '2026-10-26T21:00:00.000Z',
  };
  assert.deepEqual(parsePicks(JSON.stringify(saved)), saved);
});

test('malformed or incompatible stored values reset to empty choices', () => {
  for (const source of [null, '', '{', 'null', '[]', '42', '{}', '{"version":2,"picks":{}}', '{"version":1,"picks":null}']) {
    assert.deepEqual(parsePicks(source), emptyPicks(), String(source));
  }
});

test('saved preferences keep only known editions and contexts, cap notes and derive experiment status', () => {
  const value = {
    version: 1,
    preferred: 'untrusted-edition',
    picks: {
      table: { note: 'x'.repeat(1200), reviewed: ['panel', 'https://example.invalid', 7, 'obs'], experimental: true },
      picture: { note: '<script>still plain note text</script>', reviewed: ['phone'], experimental: false },
      invented: { note: 'discard', reviewed: ['panel'] },
      foil: { note: 42, reviewed: ['obs'] },
    },
    updatedAt: 7,
  };
  const parsed = parsePicks(JSON.stringify(value));
  assert.equal(parsed.preferred, null);
  assert.equal(parsed.updatedAt, '');
  assert.deepEqual(Object.keys(parsed.picks), ['table', 'picture']);
  assert.equal(parsed.picks.table!.note.length, 1000);
  assert.deepEqual(parsed.picks.table!.reviewed, ['panel', 'obs']);
  assert.equal(parsed.picks.table!.experimental, false);
  assert.equal(parsed.picks.picture!.experimental, true);
  assert.equal(parsed.picks.picture!.note, '<script>still plain note text</script>');
  assert.equal(new Set(editions.map(entry => entry.id)).size, editions.length);
});

test('unrelated storage properties and prototype-like keys cannot enter the exported choices', () => {
  const parsed = parsePicks('{"version":1,"preferred":null,"picks":{"__proto__":{"polluted":true}},"token":"never-a-choice","room":{"target":"never-a-choice"}}');
  assert.deepEqual(parsed, emptyPicks());
  assert.equal('token' in parsed, false);
  assert.equal('room' in parsed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(parsed.picks, '__proto__'), false);
});
