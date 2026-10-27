import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import {
  badgeAnnouncement,
  eventAnnouncement,
  parseCommand,
  streakText,
} from '../server/chat-copy.js';
import {
  finishArt,
  nextStreakTier,
  streakMilestone,
  streakRow,
  streakTiers,
} from '../extension/presentation.js';
import { fixture } from './fixtures.js';

function play(f: ReturnType<typeof fixture>, win = true) {
  f.advance(11000);
  f.game.begin();
  if (win) f.game.transcript(f.transcript());
  else f.game.end('skipped');
  return f.game.data.history[0];
}

test('tiers are ordered Card Lab finishes; the row centres on the current win', () => {
  assert.deepEqual(
    streakTiers.map((tier) => [tier.count, tier.finish]),
    [[2, 'stock'], [3, 'dither'], [5, 'velvet'], [10, 'engraved'], [15, 'spotlight'], [25, 'prism']],
  );
  assert.equal(streakMilestone(3)?.name, 'Dither');
  assert.equal(streakMilestone(4), null);
  assert.equal(nextStreakTier(5)?.count, 10);
  assert.equal(nextStreakTier(25), null);
  // Textures come from the Card Lab; the Extension ships its own copies.
  assert.equal(finishArt('stock', 'client'), null);
  assert.equal(finishArt('velvet', 'client'), '/card-lab/finishes/front-velvet.webp');
  assert.equal(finishArt('velvet', 'client', true), '/card-lab/finishes/front-velvet-swatch.webp');
  assert.equal(finishArt('dither', 'client', true), '/card-lab/finishes/dither.svg');
  assert.equal(finishArt('prism', 'extension'), 'finish-prism.webp');
  assert.equal(finishArt('glass' as never, 'client'), null);
  assert.deepEqual(
    streakRow(0).map((slot) => [slot.n, slot.state]),
    [[1, 'ahead'], [2, 'ahead'], [3, 'ahead'], [4, 'ahead'], [5, 'ahead']],
  );
  assert.deepEqual(
    streakRow(7).map((slot) => [slot.n, slot.state, slot.tier?.count ?? null]),
    [[5, 'won', 5], [6, 'won', null], [7, 'current', null], [8, 'ahead', null], [9, 'ahead', null]],
  );
});

test('wins in a row unlock each card once, dated and printed with its word', () => {
  const f = fixture();
  const results = Array.from({ length: 5 }, () => play(f));
  assert.deepEqual(
    results.map((result) => [result.milestone ?? null, result.newBadge ?? false]),
    [[null, false], [2, true], [3, true], [null, false], [5, true]],
  );
  assert.equal(f.game.score.streak, 5);
  const view = f.game.view('overlay');
  assert.deepEqual(view.badges.map((badge) => badge.count), [2, 3, 5]);
  assert.ok(view.badges.every((badge) => typeof badge.at === 'number'));
  assert.deepEqual(
    view.badges.map((badge) => badge.word),
    [results[1].word, results[2].word, results[4].word],
  );
  // A skip ends the streak. Reaching a tier again is celebrated but unlocks nothing new.
  play(f, false);
  assert.equal(f.game.score.streak, 0);
  play(f);
  const again = play(f);
  assert.deepEqual([again.milestone, again.newBadge ?? false], [2, false]);
  assert.equal(f.game.view('viewer').badges.length, 3);
});

test('a reversed win takes back the badge it unlocked; a rejected catch keeps the streak', () => {
  const f = fixture();
  const unlock = (count: number) => f.game.data.streakBadges?.[count];
  play(f);
  play(f);
  const third = play(f);
  assert.equal(third.newBadge, true);
  f.game.reverse();
  assert.equal(f.game.score.streak, 2);
  assert.equal(f.game.data.history[0].milestone, undefined);
  assert.deepEqual(f.game.view('studio').badges.map((badge) => badge.count), [2]);
  assert.equal(unlock(3), undefined);
  // Earning it again later records the new round.
  const regained = play(f);
  assert.equal(regained.newBadge, true);
  assert.equal(unlock(3)?.round, regained.id);

  f.advance(11000);
  f.game.begin();
  f.game.transcript(f.transcript(), 'confirm');
  f.game.decideCatch(f.game.round!.id, 'reject');
  assert.equal(f.game.score.streak, 3);
});

test('unlocks survive a restart; bests from before dates were kept still count', () => {
  const f = fixture();
  play(f);
  play(f);
  const saved = JSON.parse(JSON.stringify(f.game.data));
  const restored = new Game(saved);
  assert.equal(restored.score.streak, 0);
  assert.deepEqual(restored.view('viewer').badges.map((badge) => badge.count), [2]);
  const legacy = fixture();
  legacy.game.data.priorBest = 6;
  assert.deepEqual(
    legacy.game.view('viewer').badges,
    [2, 3, 5].map((count) => ({ count, at: null, word: null })),
  );
  // Reaching an old tier again does not count as a first unlock.
  play(legacy);
  assert.equal(play(legacy).newBadge, undefined);
});

test('the bot celebrates streaks and cards, and says when a streak ends', () => {
  const f = fixture();
  const texts: string[] = [];
  f.game.onEvent = (event) => {
    const view = f.game.view('overlay');
    const announcement = eventAnnouncement(view, event);
    if (announcement) texts.push(announcement.text);
    const badge = event.type === 'finish' ? badgeAnnouncement(view) : null;
    if (badge) texts.push(badge.text);
  };
  play(f);
  play(f);
  play(f);
  assert.match(texts.at(-2)!, /Chat wins, 3 in a row!/);
  assert.equal(
    texts.at(-1),
    '🃏 New streak card: Dither edition! Chat won 3 in a row. Next card: Velvet at 5.',
  );
  assert.equal(streakText(f.game.view('overlay')), '🃏 Chat is on a 3-win streak. Best: 3. Next card: Velvet at 5 in a row. Streak cards: 2 of 6.');
  play(f, false);
  assert.match(texts.at(-1)!, /Word skipped\. New bait next\. That ends chat's 3-win streak\./);
  assert.equal(streakText(f.game.view('overlay')), 'No streak running. Best: 3. Win a round to start one. Streak cards: 2 of 6.');
  play(f);
  play(f);
  assert.equal(texts.at(-1), '🃏 2 in a row: the Stock card again! Next card: Dither at 3.');
  assert.equal(parseCommand('!bait streak'), 'streak');
});
