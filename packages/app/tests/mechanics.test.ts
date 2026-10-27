import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.js';
import { Game, clueMatches } from '../server/game.js';
import { clueCards, forbiddenClues } from '../server/cards.js';
import { words } from '../server/words.js';

test('every original target has four distinct clues and difficulty reveals zero, two or four', () => {
  for (const word of Object.values(words).flat()) {
    assert.equal(new Set(clueCards[word]).size, 4, word);
    assert.ok(!clueCards[word].includes(word));
    assert.equal(forbiddenClues(word, 'easy').length, 0);
    assert.equal(forbiddenClues(word, 'medium').length, 2);
    assert.equal(forbiddenClues(word, 'hard').length, 4);
  }
  for (const text of ['BIRD', 'birds', 'bird’s', 'bird-house'])
    assert.ok(clueMatches(text, 'bird'));
  assert.ok(!clueMatches('birdwatching', 'bird'));
});

test('live clue lists and hint text remain outside studio and overlay projections', () => {
  const f = fixture();
  f.game.begin();
  assert.deepEqual(f.game.view('viewer').round?.forbiddenClues, ['bird', 'ice']);
  // The printed ink and example question name the word as surely as the word does.
  assert.equal(f.game.view('viewer').round?.ink, '#d9e3f2');
  assert.equal(f.game.view('viewer').round?.example, 'Who would win a belly-slide race?');
  f.game.chat('hint', 'a', 'Alex', 'a suspiciously fancy outfit', f.now());
  for (const role of ['studio', 'overlay'] as const) {
    assert.equal(f.game.view(role).round?.forbiddenClues, undefined);
    assert.ok(!JSON.stringify(f.game.view(role)).includes('suspiciously'));
    assert.ok(!/belly-slide|#d9e3f2|"ink"|"example"/.test(JSON.stringify(f.game.view(role))));
  }
  assert.equal(f.game.awardBoard, null);
  assert.ok(!JSON.stringify(f.game.data).includes('suspiciously'));
});

test('a forbidden hint cannot win an award; its author can still submit a clean hint', () => {
  const f = fixture();
  f.game.begin();
  assert.equal(f.game.chat('bad', 'a', 'Alex', 'Look at that BIRD!', f.now()), true);
  assert.equal(f.game.view('viewer').violations, 1);
  assert.equal(f.game.phase, 'active');
  f.advance(3000);
  f.game.chat('good', 'a', 'Alex', 'why the formal outfit?', f.now());
  f.game.transcript(f.transcript());
  const board = f.game.awardBoard!;
  assert.equal(board.candidates.length, 2);
  const bad = board.candidates.find((h) => !h.eligible)!,
    good = board.candidates.find((h) => h.eligible)!;
  assert.match(bad.reason!, /bird/);
  assert.throws(() => f.game.award(board.roundId, bad.id), /eligible/);
  f.game.award(board.roundId, good.id);
  assert.deepEqual(f.game.result?.award, { name: 'Alex' });
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.view('viewer').leaders[0].baits, 1);
  assert.equal(f.game.view('viewer').leaders[0].rounds, 1);
});

test('one spoiler cannot cancel a community win or crowd clean hints out of review', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('clean', 'good', 'Good', 'why are they dressed for dinner?', f.now());
  for (let i = 0; i < 100; i++)
    f.game.chat(`spoiler${i}`, 'bad', 'Bad', f.game.round!.word, f.now());
  assert.equal(f.game.phase, 'active');
  assert.equal(f.game.transcript(f.transcript()), true);
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.awardBoard!.candidates.filter((h) => h.eligible).length, 1);
  assert.equal(f.game.awardBoard!.candidates.filter((h) => !h.eligible).length, 1);
});

test('awards are manual, idempotent, replaceable and removed with an overturned win', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('a', 'a', 'Alex', 'first clean hint', f.now());
  f.game.chat('b', 'b', 'Blair', 'second clean hint', f.now());
  f.game.transcript(f.transcript());
  assert.equal(f.game.result?.award, undefined);
  const board = f.game.awardBoard!,
    [a, b] = board.candidates;
  f.game.award(board.roundId, a.id);
  f.game.award(board.roundId, a.id);
  assert.equal(f.game.data.leaders.a.baits, 1);
  f.game.award(board.roundId, b.id);
  assert.equal(f.game.data.leaders.a.baits, 0);
  assert.equal(f.game.data.leaders.b.baits, 1);
  f.game.reverse();
  assert.equal(f.game.data.leaders.b.baits, 0);
  assert.equal(f.game.result?.award, undefined);
  assert.equal(f.game.awardBoard, null);
  assert.equal(f.game.score.wins, 0);
});

test('review expires after ten minutes and raw hints never enter saved game data', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('a', 'a', 'Alex', 'a unique private hint body', f.now());
  f.game.transcript(f.transcript());
  assert.equal(f.game.round!.hints.length, 0);
  assert.ok(!JSON.stringify(f.game.data).includes('unique private'));
  const board = f.game.awardBoard!;
  f.advance(600000);
  f.game.tick();
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.award(board.roundId, board.candidates[0].id));
});

test('non-winning rounds and commands cannot produce an award', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('command', 'a', 'Alex', '!bait', f.now());
  f.game.end('skipped');
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.award(f.game.round!.id, 'invented'));
});

test('the latest award can be selected during the next word without exposing live hints', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('a', 'a', 'Alex', 'previous round hint', f.now());
  f.game.transcript(f.transcript());
  const board = f.game.awardBoard!;
  f.advance(10000);
  f.game.tick();
  f.game.begin();
  f.game.chat('b', 'b', 'Blair', 'new hidden hint', f.now());
  assert.ok(!JSON.stringify(f.game.awardBoard).includes('new hidden'));
  f.game.award(board.roundId, board.candidates[0].id);
  assert.equal(f.game.data.history[0].award?.name, 'Alex');
  f.game.transcript(f.transcript());
  assert.throws(() => f.game.award(board.roundId, board.candidates[0].id));
});

test('Call the bait is optional and rejects multi-word or stale guesses without consuming a try', () => {
  const f = fixture();
  f.game.begin();
  assert.throws(() => f.game.guess(f.game.round!.id, 1, 'penguin'), /off/);
  f.game.end('ended');
  f.advance(10000);
  f.game.tick();
  f.game.update({ ...f.game.data.settings, callBait: true });
  f.game.begin();
  const r = f.game.round!;
  assert.throws(() => f.game.guess('stale', r.epoch, 'penguin'), /current/);
  assert.throws(() => f.game.guess(r.id, r.epoch, 'two words'), /one word/);
  assert.equal(r.guessUsed, false);
  f.game.pause();
  assert.throws(() => f.game.guess(r.id, r.epoch, r.word));
  const epoch = r.epoch;
  f.game.resume();
  assert.throws(() => f.game.guess(r.id, epoch, r.word));
  assert.equal(r.guessUsed, false);
});

test('a wrong private guess adds fifteen seconds once and never enters public state or storage', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, callBait: true });
  f.game.begin();
  const r = f.game.round!,
    deadline = r.endsAt,
    duration = r.duration;
  assert.deepEqual(f.game.guess(r.id, r.epoch, 'secretwrongguess'), { correct: false, bonus: 15 });
  assert.equal(r.endsAt, deadline + 15000);
  assert.equal(r.duration, duration + 15000);
  assert.throws(() => f.game.guess(r.id, r.epoch, r.word), /one guess/);
  for (const role of ['studio', 'viewer', 'overlay'] as const)
    assert.ok(!JSON.stringify(f.game.view(role)).includes('secretwrongguess'));
  assert.ok(!JSON.stringify(f.game.data).includes('secretwrongguess'));
});

test('a correct typed guess escapes and closes speech for that word', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, callBait: true });
  f.game.begin();
  const r = f.game.round!,
    old = f.transcript();
  assert.deepEqual(f.game.guess(r.id, r.epoch, 'ＰＥＮＧＵＩＮ!'), { correct: true, bonus: 0 });
  assert.equal(f.game.result?.reason, 'guess');
  assert.equal(f.game.result?.outcome, 'escaped');
  assert.equal(f.game.score.wins, 0);
  assert.equal(f.game.transcript(old), false);
});

test('a three-word mission advances one target at a time on a single clock', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three', missionDuration: 180 });
  f.game.begin();
  const missionId = f.game.mission!.id,
    seen = new Set<string>();
  for (let i = 0; i < 3; i++) {
    seen.add(f.game.round!.word);
    assert.equal(f.game.view('viewer').mission!.completed, i);
    assert.ok(!JSON.stringify(f.game.view('studio')).includes('clues'));
    f.advance(5000);
    f.game.transcript(f.transcript());
    assert.equal(f.game.mission!.completed, i + 1);
    f.advance(10000);
    f.game.tick();
  }
  assert.equal(seen.size, 3);
  assert.equal(f.game.mission!.status, 'complete');
  assert.equal(f.game.mission!.id, missionId);
  assert.equal(f.game.phase, 'idle');
  assert.equal(f.game.score.wins, 3);
  const remaining = f.game.view('viewer').mission!.remaining;
  f.advance(900000);
  f.game.tick();
  assert.equal(f.game.view('viewer').mission!.remaining, remaining);
  f.game.begin();
  assert.notEqual(f.game.mission!.id, missionId);
  assert.equal(f.game.mission!.completed, 0);
});

test('mission pauses freeze the shared clock and a wrong guess extends that clock', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three', missionDuration: 60, callBait: true });
  f.game.begin();
  f.advance(10000);
  f.game.pause();
  f.advance(900000);
  f.game.tick();
  assert.equal(f.game.view('viewer').mission!.remaining, 50000);
  f.game.resume();
  const deadline = f.game.mission!.endsAt;
  f.game.guess(f.game.round!.id, f.game.round!.epoch, 'wrongguess');
  assert.equal(f.game.mission!.endsAt, deadline + 15000);
  assert.equal(f.game.view('viewer').mission!.remaining, 65000);
});

test('a mission can expire during the between-word cooldown without erasing landed words', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three', missionDuration: 60 });
  f.game.begin();
  f.advance(55000);
  f.game.transcript(f.transcript());
  f.advance(5000);
  f.game.tick();
  assert.equal(f.game.mission!.status, 'failed');
  assert.equal(f.game.phase, 'idle');
  assert.equal(f.game.mission!.completed, 1);
  assert.equal(f.game.score.wins, 1);
});

test('calling the bait correctly ends the mission; a skip only replaces its current word', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three', callBait: true });
  f.game.begin();
  const first = f.game.round!.word;
  f.game.end('skipped');
  f.advance(10000);
  f.game.tick();
  assert.notEqual(f.game.round!.word, first);
  assert.equal(f.game.mission!.completed, 0);
  f.game.guess(f.game.round!.id, f.game.round!.epoch, f.game.round!.word);
  assert.equal(f.game.mission!.status, 'escaped');
});

test('reversing the third win restores mission progress and replaces the revealed word', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three' });
  f.game.begin();
  for (let i = 0; i < 2; i++) {
    f.game.transcript(f.transcript());
    f.advance(10000);
    f.game.tick();
  }
  const revealed = f.game.round!.word;
  f.game.transcript(f.transcript());
  assert.equal(f.game.mission!.status, 'complete');
  f.game.reverse();
  assert.equal(f.game.mission!.status, 'active');
  assert.equal(f.game.mission!.completed, 2);
  assert.equal(f.game.score.wins, 2);
  f.advance(10000);
  f.game.tick();
  assert.equal(f.game.phase, 'active');
  assert.notEqual(f.game.round!.word, revealed);
  f.game.transcript(f.transcript());
  assert.equal(f.game.mission!.status, 'complete');
});

test('rule changes apply to the next word, and old saved settings get safe defaults', () => {
  const f = fixture();
  f.game.begin();
  f.game.update({ ...f.game.data.settings, difficulty: 'hard', callBait: true, mission: 'three' });
  assert.deepEqual(f.game.view('viewer').round!.forbiddenClues, ['bird', 'ice']);
  assert.equal(f.game.round!.guessEnabled, false);
  assert.equal(f.game.mission, null);
  const saved = JSON.parse(JSON.stringify(f.game.data));
  delete saved.settings.mission;
  delete saved.settings.missionDuration;
  delete saved.settings.callBait;
  const restored = new Game(saved);
  assert.equal(restored.data.settings.mission, 'single');
  assert.equal(restored.data.settings.callBait, false);
});
test('manual awards preserve the thousand-record cap when a recent chatter was pruned', () => {
  const f = fixture();
  f.game.begin();
  for (let i = 0; i < 1002; i++)
    f.game.chat(`id${i}`, `user${i}`, `Viewer${i}`, 'a clean clue', f.now());
  f.game.transcript(f.transcript());
  assert.equal(Object.keys(f.game.data.leaders).length, 1000);
  const board = f.game.awardBoard!,
    hint = board.candidates.find((h) => h.name === 'Viewer1001')!;
  f.game.award(board.roundId, hint.id);
  assert.equal(Object.keys(f.game.data.leaders).length, 1000);
  assert.equal(f.game.data.leaders.user1001.rounds, 1);
  assert.equal(f.game.data.leaders.user1001.baits, 1);
});
test('automatic play starts a fresh mission after time expires between words', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three', missionDuration: 60, auto: true });
  f.game.begin();
  const mission = f.game.mission!.id;
  f.advance(55000);
  f.game.transcript(f.transcript());
  f.advance(5000);
  f.game.tick();
  assert.equal(f.game.mission!.status, 'failed');
  assert.equal(f.game.phase, 'cooldown');
  f.advance(10000);
  f.game.tick();
  assert.equal(f.game.mission!.status, 'active');
  assert.notEqual(f.game.mission!.id, mission);
});
