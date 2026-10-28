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
  nextStreakTier,
  streakArtFile,
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

test('tiers are ordered, named and drawn; the row centres on the current win', () => {
  assert.deepEqual(
    streakTiers.map((tier) => tier.count),
    [2, 3, 5, 10, 15, 25, 50],
  );
  assert.equal(streakMilestone(3)?.name, 'Heating up');
  assert.equal(streakMilestone(4), null);
  assert.equal(nextStreakTier(5)?.count, 10);
  assert.equal(nextStreakTier(50), null);
  // Fire is drawn as pixel flames; the big tiers reuse card art. No tier uses the bomb.
  assert.equal(streakArtFile('twin', 'extension'), 'streak-twin.svg');
  assert.equal(streakArtFile('ultraviolet', 'client'), '/brand/streak-flame-violet.svg');
  assert.equal(streakArtFile('volcano', 'extension'), 'card-volcano.png');
  for (const tier of streakTiers)
    for (const surface of ['client', 'extension'] as const)
      assert.doesNotMatch(streakArtFile(tier.art, surface), /bomb|undefined/);
  assert.deepEqual(
    streakRow(0).map((slot) => [slot.n, slot.state]),
    [[1, 'ahead'], [2, 'ahead'], [3, 'ahead'], [4, 'ahead'], [5, 'ahead']],
  );
  assert.deepEqual(
    streakRow(7).map((slot) => [slot.n, slot.state, slot.tier?.count ?? null]),
    [[5, 'won', 5], [6, 'won', null], [7, 'current', null], [8, 'ahead', null], [9, 'ahead', null]],
  );
});

test('wins in a row unlock each badge once, dated, and the view lists them', () => {
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
    [2, 3, 5].map((count) => ({ count, at: null })),
  );
  // Reaching an old tier again does not count as a first unlock.
  play(legacy);
  assert.equal(play(legacy).newBadge, undefined);
});

test('the bot celebrates streaks and badges, and says when a streak ends', () => {
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
  // Baity rotates between variants, so these match what every variant says.
  assert.match(texts.at(-2)!, /chat wins.*🔥 (3 in a row!|that's 3 straight!!)/);
  assert.match(texts.at(-1)!, /^🏅 .*Heating up.*On fire at 5/);
  assert.doesNotMatch(texts.at(-1)!, /again/);
  assert.match(streakText(f.game.view('overlay')), /^🔥 .*3.*best: 3\..*On fire.*5.* badges: 2 of 7 🏅$/);
  play(f, false);
  assert.match(texts.at(-1)!, /^⏭ WORD SKIPPED\. NEW BAIT NEXT\..*3-WIN STREAK 💀/);
  assert.match(streakText(f.game.view('overlay')), /BEST: 3\..* BADGES: 2 OF 7 🏅$/);
  play(f);
  play(f);
  assert.match(texts.at(-1)!, /^🏅 .*Spark again.*Heating up at 3/);
  assert.equal(parseCommand('!bait streak'), 'streak');
});
