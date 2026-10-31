import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventAnnouncement } from '../server/chat-copy.js';
import { baityChaosCopy } from '../extension/presentation.js';
import type { GameView } from '../shared/types.js';
import { fixture } from './fixtures.js';

function giftedView(): GameView {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript());
  const view = f.game.view('overlay');
  return { ...view, result: { ...view.result!, reason: 'baity-chaos', word: 'MARSHMALLOW' },
    score: { ...view.score, streak: 4 } };
}

test('Baity announces a correct guess and a gifted win without claiming speech detection', () => {
  const view = giftedView();
  const post = eventAnnouncement(view, { type: 'finish', streakBefore: 3 });
  assert.ok(post);
  assert.match(post.text, /You called MARSHMALLOW correctly\. But I'm saving chat's streak\. Chat wins this one\./);
  assert.match(post.text, /4/);
  assert.doesNotMatch(post.text, /said it|said MARSHMALLOW|catch confirmed|MVP|Streamer’s pick/i);
  assert.ok(post.text.length <= 500);
  assert.equal(post.key, 'result');
  assert.equal(post.ttl, 30000);

  const ordinary = eventAnnouncement({ ...view, result: { ...view.result!, reason: undefined } }, { type: 'finish', streakBefore: 3 });
  assert.ok(ordinary);
  assert.match(ordinary.text, /said MARSHMALLOW/i);
  assert.doesNotMatch(ordinary.text, /saving chat's streak|guessed correctly/i);
});

test('gift reversals name the removed gift rather than a rejected speech catch', () => {
  const view = giftedView();
  view.result!.outcome = 'overturned';
  view.result!.word = undefined;
  view.score.streak = 3;
  const reversed = eventAnnouncement(view, { type: 'reverse' });
  assert.ok(reversed);
  assert.equal(reversed.text, "My gift to chat was reversed. The streamer guessed correctly. Chat's streak is back to 3.");
  const finished = eventAnnouncement(view, { type: 'finish', streakBefore: 3 });
  assert.ok(finished);
  assert.match(finished.text, /gifted win was removed\. The streamer guessed correctly\./);
  assert.doesNotMatch(`${reversed.text} ${finished.text}`, /MARSHMALLOW|misheard|catch rejected/i);
});

test('gift copy is bounded and never needs an active word or a guess before the result', () => {
  const view = giftedView();
  view.result!.word = `${'x'.repeat(1000)}\nprivate`;
  const post = eventAnnouncement(view, { type: 'finish', streakBefore: 3 });
  assert.ok(post && post.text.length <= 500);
  assert.doesNotMatch(post.text, /\n|private/);
  view.result!.word = undefined;
  assert.match(eventAnnouncement(view, { type: 'finish', streakBefore: 3 })!.text, /You called it correctly/);

  const f = fixture();
  f.game.begin();
  const active = f.game.view('overlay');
  assert.equal(active.round!.target, undefined);
  const start = eventAnnouncement(active, { type: 'start' });
  assert.ok(start);
  assert.doesNotMatch(start.text, /guessed correctly|saving chat's streak/);
});

test('native gifted-result copy is reason-specific and has no word lookup', () => {
  assert.deepEqual(baityChaosCopy({ reason: 'baity-chaos', outcome: 'caught' }),
    ['Baity’s call', 'The streamer guessed correctly. Baity gave chat the win.']);
  assert.deepEqual(baityChaosCopy({ reason: 'baity-chaos', outcome: 'overturned' }),
    ['Gift reversed', 'Baity’s gifted win was removed.']);
  for (const outcome of ['review', 'escaped', 'skipped', 'ended'])
    assert.equal(baityChaosCopy({ reason: 'baity-chaos', outcome }), null);
  assert.equal(baityChaosCopy({ outcome: 'caught' }), null);
  assert.equal(baityChaosCopy(null), null);
});
