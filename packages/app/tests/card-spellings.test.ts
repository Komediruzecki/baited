import assert from 'node:assert/strict';
import test from 'node:test';
import { matches, clueMatches } from '../server/game.js';
import { fixture } from './fixtures.js';

test('equivalent card spellings match whole words without matching longer words or synonyms', () => {
  for (const [canonical, alternate] of [['donut', 'doughnut'], ['yogurt', 'yoghurt'], ['mustache', 'moustache']]) {
    assert.ok(matches(`Perhaps ${alternate.toUpperCase()}?`, canonical));
    assert.ok(matches(canonical, alternate));
    assert.ok(!matches(`${alternate}maker`, canonical));
    assert.ok(!matches(`${alternate}s`, canonical));
    assert.ok(clueMatches(`${alternate}s`, canonical));
    assert.ok(clueMatches(`${alternate}’s`, canonical));
  }
  assert.ok(!matches('pastry', 'donut'));
});

test('the new donut card accepts the speech spelling but requires streamer confirmation', () => {
  const f = fixture();
  f.game.begin();
  f.game.round!.word = 'donut';
  assert.ok(f.game.transcript(f.transcript('I want a doughnut'), 'confirm'));
  assert.equal(f.game.result?.outcome, 'review');
  assert.equal(f.game.score.wins, 0);
});

test('an alternate target spelling is a spoiler in chat, including easy cards without clue restrictions', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, difficulty: 'easy' });
  f.game.begin();
  f.game.round!.word = 'donut';
  assert.deepEqual(f.game.round!.clues, []);
  f.game.chat('alternate-spoiler', 'viewer', 'Viewer', 'Say doughnut', f.now());
  assert.equal(f.game.view('viewer').violations, 1);
  assert.equal(f.game.round!.hints[0].eligible, false);
});

test('a streamer guessing the equivalent spelling gets the same correct result', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, callBait: true });
  f.game.begin();
  f.game.round!.word = 'donut';
  assert.deepEqual(f.game.guess(f.game.round!.id, f.game.round!.epoch, 'DOUGHNUT'), { correct: true, bonus: 0 });
  assert.equal(f.game.result?.outcome, 'escaped');
});
