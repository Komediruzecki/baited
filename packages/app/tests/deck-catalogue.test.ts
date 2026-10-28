import assert from 'node:assert/strict';
import test from 'node:test';
import { words } from '../server/words.js';
import { clueCards, forbiddenClues } from '../server/cards.js';
import { Game, defaults, matches, spoils, type SavedGame } from '../server/game.js';
import { cardArtFile, proofWords } from '../extension/presentation.js';
import catalogue from '../shared/card-review-catalogue.json';

const difficulties = ['easy', 'medium', 'hard'] as const;
const counts = { easy: 35, medium: 34, hard: 31 };

test('the 100-card catalogue has distinct playable words and complete, consistent clues', () => {
  const targets = Object.values(words).flat();
  assert.equal(targets.length, 100);
  assert.equal(new Set(targets).size, targets.length, 'a target belongs to exactly one difficulty');
  assert.deepEqual(new Set(Object.keys(clueCards)), new Set(targets));
  assert.deepEqual(new Set(proofWords), new Set(targets));
  assert.deepEqual(new Set(catalogue.map(card => card.word)), new Set(targets));
  for (const difficulty of difficulties) {
    assert.equal(words[difficulty].length, counts[difficulty]);
    for (const word of words[difficulty]) {
      assert.match(word, /^[a-z]{3,14}$/, `${word}: supported one-word target`);
      const clues = clueCards[word];
      assert.equal(clues.length, 4, `${word}: complete authored clue set`);
      assert.equal(new Set(clues).size, 4, `${word}: distinct clues`);
      for (const clue of clues) {
        assert.match(clue, /^[a-z]+$/, `${word}: one readable clue per item`);
        assert.notEqual(clue, word, `${word}: target is already forbidden`);
      }
      const card = catalogue.find(entry => entry.word === word)!;
      assert.equal(card.difficulty, difficulty);
      assert.deepEqual(card.clues, clues);
      assert.equal(cardArtFile(word), `card-${word}.png`);
      assert.match(card.ink, /^#[0-9a-f]{6}$/i);
      for (const forbidden of [word, ...forbiddenClues(word, difficulty)]) {
        assert.equal(spoils(card.example, forbidden), false,
          `${word}: review example must not give away ${forbidden}`);
      }
    }
  }
});

test('every built-in card can be dealt without exposing its target or clues to Studio or OBS', () => {
  for (const difficulty of difficulties) {
    for (const [index, word] of words[difficulty].entries()) {
      const saved: SavedGame = {
        id: 'catalogue-room', owner: 'catalogue-owner', channel: 'catalogue_channel',
        mode: 'demo', overlayKey: 'fixture-overlay-key',
        settings: { ...defaults, difficulty }, history: [], priorWins: 0,
        priorPlayed: 0, priorBest: 0, leaders: {},
      };
      const game = new Game(saved, () => 100000, () => index);
      game.begin();
      const viewer = game.view('viewer');
      assert.equal(viewer.round?.target, word, word);
      assert.deepEqual(viewer.round?.forbiddenClues, forbiddenClues(word, difficulty), word);
      assert.equal(viewer.round?.ink, catalogue.find(card => card.word === word)?.ink, word);
      for (const role of ['studio', 'overlay'] as const) {
        const round = game.view(role).round!;
        assert.equal('target' in round, false, `${word}: ${role} cannot receive the active word`);
        assert.equal('forbiddenClues' in round, false, `${word}: ${role} cannot receive identifying clues`);
        assert.equal('example' in round, false, `${word}: ${role} cannot receive a revealing question`);
        assert.equal('ink' in round, false, `${word}: ${role} cannot identify the card by its ink`);
      }
      assert.ok(matches(`I meant ${word.toUpperCase()}!`, word), `${word}: whole-word text match`);
      assert.equal(matches(`prefix${word}suffix`, word), false, `${word}: no substring catch`);
    }
  }
});
