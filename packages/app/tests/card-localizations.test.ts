import assert from 'node:assert/strict';
import test from 'node:test';
import localizations from '../shared/card-localizations.json';
import originalExamples from '../shared/card-examples.v1.json';
import { words } from '../server/words.js';
import { clueCards, forbiddenClues } from '../server/cards.js';
import { spoils } from '../server/game.js';

const cards = localizations.cards as Record<string, (typeof localizations.cards)['banana']>;
const originals = originalExamples as Record<string, string>;
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('hr-HR');
const phrasePresent = (text: string, phrase: string) =>
  (` ${normalize(text).replace(/[^\p{L}\p{N}]+/gu, ' ')} `).includes(` ${normalize(phrase)} `);

test('English and Croatian review content covers every canonical card and preserves original questions', () => {
  assert.equal(localizations.version, 1);
  assert.deepEqual(new Set(Object.keys(cards)), new Set(Object.values(words).flat()));
  assert.equal(Object.keys(cards).length, 100);
  for (const [id, card] of Object.entries(cards)) {
    assert.equal(card.en.target, id);
    assert.equal(card.en.originalQuestion, originals[id], `${id}: original question preserved verbatim`);
    assert.deepEqual(card.en.clues, clueCards[id], `${id}: no English rules rebalance`);
    if (card.en.question !== card.en.originalQuestion)
      assert.ok(card.en.alternatives.includes(card.en.originalQuestion), `${id}: original also offered as an alternative`);
    assert.equal(card.hr.clues.length, 4, `${id}: complete Croatian clue set`);
    assert.equal(new Set(card.hr.clues.map(normalize)).size, 4, `${id}: distinct translated clues`);
    assert.ok(card.hr.target.length >= 2 && card.hr.target.length <= 30, `${id}: readable translated target`);
    assert.equal(new Set(card.hr.acceptedSpellings).size, card.hr.acceptedSpellings.length);
    assert.ok(!card.hr.acceptedSpellings.includes(card.hr.target), `${id}: aliases exclude canonical target`);
    for (const locale of [card.en, card.hr]) {
      assert.ok(locale.question.endsWith('?'), `${id}: question remains a question`);
      assert.ok(locale.question.length <= 150, `${id}: bounded on-card question`);
    }
  }
  assert.deepEqual(Object.keys(localizations.labels.en), Object.keys(localizations.labels.hr));
  assert.equal(localizations.cards.ghost.en.question, "What's your favorite scary movie?");
});

test('recommended English questions respect the real spoiler matcher at each built-in difficulty', () => {
  for (const [difficulty, targets] of Object.entries(words)) for (const target of targets) {
    const forbidden = [target, ...forbiddenClues(target, difficulty as keyof typeof words)];
    for (const question of [cards[target].en.question, ...cards[target].en.alternatives]) {
      for (const word of forbidden)
        assert.equal(spoils(question, word), false, `${target}: question gives away ${word}`);
    }
  }
});

test('Croatian recommended questions contain neither exact target forms nor active clue phrases', () => {
  for (const [difficulty, targets] of Object.entries(words)) for (const id of targets) {
    const card = cards[id].hr;
    const forbidden = [card.target, ...card.acceptedSpellings, ...card.clues.slice(0, { easy: 0, medium: 2, hard: 4 }[difficulty as keyof typeof words])];
    for (const question of [card.question, ...card.alternatives]) for (const phrase of forbidden)
      assert.equal(phrasePresent(question, phrase), false, `${id}: Croatian question contains ${phrase}`);
  }
});

test('recording-only bait remains outside the natural 100-card deck', () => {
  assert.deepEqual(Object.keys(localizations.recordingCards), ['bait']);
  assert.equal('bait' in cards, false);
  assert.equal(localizations.recordingCards.bait.en.target, 'bait');
  assert.equal(localizations.recordingCards.bait.hr.target, 'mamac');
  assert.deepEqual(localizations.recordingCards.bait.en.clues, []);
});
