import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CardLibraryError as CoreCardLibraryError, defaults, Game, type GameCheckpoint, type Settings } from '@baited/game-core';
import { CardLibraryError } from '../server/card-library.js';

function fixture(settings: Partial<Settings> = {}) {
  let time = 100000, serial = 0;
  const clock = () => time;
  const uuid = () => `generated-${++serial}`;
  let game = new Game({
    id: 'room-test', owner: 'owner', channel: 'bait_channel', mode: 'demo', overlayKey: 'overlay-secret',
    settings: { ...defaults, ...settings }, history: [], priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {},
  }, clock, () => 0, uuid);
  const json = () => JSON.parse(JSON.stringify(game.checkpoint())) as GameCheckpoint;
  return {
    get game() { return game; }, clock, uuid, json,
    set: (at: number) => { time = at; },
    add: (milliseconds: number) => { time += milliseconds; },
    recover: () => { game = Game.restore(json(), clock, () => 0, uuid); return game; },
    chat: (id: string, userId: string, text = 'a subtle clue') => game.chat(id, userId, userId, text, time),
    transcript: (id = 'speech', text = game.round!.word) => ({
      roundId: game.round!.id, epoch: game.round!.epoch, text, final: true,
      confidence: 0.99, capturedAt: time, id,
    }),
  };
}

test('full checkpoint preserves false-return chat and transcript mutations, votes, latest clues and private projection', () => {
  const f = fixture({ callBait: true });
  f.game.deckFor = () => [{ target: 'penguin', difficulty: 'medium', blockedClues: ['bird', 'ice'],
    acceptedSpellings: ['pingu'], cardId: 'card-private', revision: 7, artId: 'art-private' }];
  f.game.begin();
  f.game.artFor = () => 'https://art.invalid/round-capability';
  f.chat('one', 'a', 'first clue');
  f.chat('vote', 'a', '!skip');
  assert.equal(f.chat('throttled', 'a', 'second clue'), false);
  f.add(3000);
  for (let n = 2; n <= 4; n++) { f.chat(`clue-${n}`, 'a', `clue number ${n}`); f.add(3000); }
  let notifications = 0;
  f.game.onChange = () => notifications++;
  assert.equal(f.chat('spoiler', 'b', 'p1ngu'), false);
  assert.equal(notifications, 0, 'false-return spoof changes durable review state without onChange');
  assert.equal(f.game.transcript(f.transcript('uncertain', 'nothing')), false);
  f.game.guess(f.game.round!.id, f.game.round!.epoch, 'wrong');
  const before = f.json();
  assert.equal(before.round!.hints.filter((hint) => hint.eligible).length, 3);
  assert.deepEqual(before.round!.hints.filter((hint) => hint.eligible).map((hint) => hint.text),
    ['clue number 2', 'clue number 3', 'clue number 4']);
  assert.equal(before.round!.violations, 1);
  f.recover();
  assert.deepEqual(f.json(), before);
  assert.equal(f.game.round!.participants instanceof Map, true);
  assert.equal(f.game.round!.votes instanceof Set, true);
  assert.equal(f.game.round!.seen instanceof Set, true);
  assert.equal(f.chat('throttled', 'c', 'retry changed identity'), false, 'rejected IDs survive');
  assert.equal(f.chat('spoiler', 'c'), false, 'spoiler IDs survive');
  assert.equal(f.game.transcript(f.transcript('uncertain')), false, 'seen failed transcript survives');
  assert.equal(f.chat('new-vote', 'a', '!skip'), false, 'vote user dedupe survives');
  for (const role of ['studio', 'overlay'] as const) {
    const projected = JSON.stringify(f.game.view(role));
    for (const secret of ['penguin', 'pingu', 'card-private', 'art-private', 'overlay-secret'])
      assert.equal(projected.includes(secret), false, `${role} leaked ${secret}`);
  }
  assert.equal(f.game.view('viewer').round!.target, 'penguin');
  assert.equal(f.game.round!.cardRevision, 7);
  assert.throws(() => f.game.guess(f.game.round!.id, f.game.round!.epoch, 'penguin'), /one guess/);
});

test('paused round, mission remaining, mic and connection survive; resume rejects stale epoch', () => {
  const f = fixture({ mission: 'three', missionDuration: 60 });
  f.game.mic = 'listening'; f.game.connection = { status: 'connected', detail: 'Fixture' };
  f.game.begin(); f.add(1234);
  const old = f.transcript();
  f.game.pause();
  const before = f.json();
  f.recover(); f.set(1000000); f.game.advanceTo(f.clock());
  assert.deepEqual(f.json(), before);
  assert.equal(f.game.nextDeadline(), null);
  f.game.resume();
  assert.equal(f.game.round!.remaining, 58766);
  assert.equal(f.game.mission!.endsAt, 1058766);
  assert.equal(f.game.transcript(old), false);
  assert.equal(f.game.transcript(f.transcript('new')), true);
});

test('catch review and award ownership survive recovery; correction edits history and removes award and badge', () => {
  const f = fixture();
  for (let n = 0; n < 2; n++) {
    f.game.begin(); f.game.transcript(f.transcript(`catch-${n}`)); f.add(10000); f.game.tick();
  }
  f.game.begin(); f.chat('hint', 'a'); f.chat('other-hint', 'b', 'another clue');
  f.game.transcript(f.transcript(), 'confirm');
  const pending = f.json();
  f.recover();
  assert.deepEqual(f.json(), pending);
  assert.equal(f.game.score.wins, 2);
  assert.equal(f.game.pendingCatch, true);
  assert.equal(f.game.awardBoard, null);
  f.add(5000); f.game.advanceTo(f.clock());
  f.game.decideCatch(f.game.round!.id, 'confirm');
  f.recover();
  assert.equal(f.game.result, f.game.data.history[0], 'restore preserves result/history alias');
  assert.equal(f.game.result!.newBadge, true);
  const board = f.game.awardBoard!;
  f.game.award(board.roundId, board.candidates[0].id);
  f.recover(); f.game.award(board.roundId, board.candidates[0].id);
  assert.equal(f.game.data.leaders.a.baits, 1, 'retrying an award does not increment it');
  f.game.award(board.roundId, board.candidates[1].id);
  f.recover();
  assert.equal(f.game.data.leaders.a.baits, 0);
  assert.equal(f.game.data.leaders.b.baits, 1);
  assert.equal(f.game.result!.award!.name, 'b');
  f.game.reverse();
  assert.equal(f.game.data.history[0].outcome, 'overturned');
  assert.equal(f.game.data.history[0].award, undefined);
  assert.equal(f.game.data.leaders.b.baits, 0);
  assert.deepEqual(f.game.score, { wins: 2, played: 3, streak: 2, best: 2 });
  assert.equal(f.game.data.streakBadges?.['3'], undefined);
  f.recover(); assert.throws(() => f.game.reverse(), /latest detection/);
});

test('moderation after an awarded wake removes only the selected hint award', () => {
  const f = fixture(); f.game.begin(); f.chat('hint-a', 'a'); f.chat('hint-b', 'b');
  f.game.transcript(f.transcript());
  const board = f.game.awardBoard!; f.game.award(board.roundId, board.candidates[0].id);
  f.recover(); assert.equal(f.game.dropMessage('hint-a', 'wrong-user'), false);
  assert.equal(f.game.dropMessage('hint-a', 'a'), true);
  assert.equal(f.game.data.history[0].award, undefined);
  assert.equal(f.game.data.leaders.a.baits, 0);
  f.recover(); assert.equal(f.game.awardBoard!.candidates.length, 1);
});

test('mission completion, reversal and recovered skip votes preserve the existing rules', () => {
  const f = fixture({ mission: 'three', missionDuration: 60 });
  f.game.begin();
  for (let n = 0; n < 3; n++) {
    f.game.transcript(f.transcript(`catch-${n}`)); f.recover();
    if (n < 2) { f.add(10000); f.game.advanceTo(f.clock()); f.recover(); }
  }
  assert.equal(f.game.mission!.status, 'complete');
  f.add(10000); f.game.advanceTo(f.clock()); f.recover();
  f.game.reverse(); f.recover();
  assert.equal(f.game.mission!.status, 'active');
  assert.equal(f.game.mission!.completed, 2);
  f.add(10000); f.game.advanceTo(f.clock());
  f.chat('vote-a', 'a', '!skip'); f.recover(); f.chat('vote-b', 'b', '!skip'); f.recover();
  assert.equal(f.chat('vote-a-retry', 'a', '!skip'), false);
  f.chat('vote-c', 'c', '!skip');
  const skipped = f.json(); f.recover();
  assert.equal(skipped.skipUsed, true);
  assert.equal(f.chat('vote-c-retry', 'c', '!skip'), false);
  assert.equal(f.game.data.history.filter((entry) => entry.outcome === 'skipped').length, 1);
  assert.deepEqual(f.json(), skipped);
});

test('late and duplicate alarms follow the ideal logical timeline including settle and auto rounds', () => {
  const ideal = fixture({ duration: 30, cooldown: 5, auto: true });
  const late = fixture({ duration: 30, cooldown: 5, auto: true });
  for (const f of [ideal, late]) { f.game.mic = 'listening'; f.game.begin(); }
  const finishAt = 175000;
  for (let due = ideal.game.nextDeadline(); due !== null && due <= finishAt; due = ideal.game.nextDeadline()) {
    ideal.set(due); ideal.game.tick();
  }
  ideal.set(finishAt);
  late.set(finishAt); late.recover(); late.game.advanceTo(finishAt);
  assert.deepEqual(late.json(), ideal.json());
  assert.equal(late.game.data.history[1].at, 131500, 'late wake must not skip speech settling');
  assert.equal(late.game.data.history[0].at, 168000);
  assert.equal(late.game.round!.startedAt, 173000);
  const after = late.json(); late.recover(); late.game.advanceTo(finishAt);
  assert.deepEqual(late.json(), after, 'duplicate alarm cannot apply a second result');
  assert.equal(late.game.view('viewer').serverTime, finishAt, 'logical clock does not leak after reconcile');
});

test('recovering inside speech grace accepts a final from before deadline once', () => {
  const f = fixture({ duration: 30 }); f.game.mic = 'listening'; f.game.begin();
  const final = { ...f.transcript(), capturedAt: 129999, id: 'last-final' };
  f.set(130500); f.recover(); f.game.advanceTo(f.clock());
  assert.equal(f.game.phase, 'settling');
  assert.equal(f.game.nextDeadline(), 131500);
  f.recover(); assert.equal(f.game.transcript(final, 'confirm'), true);
  f.recover(); assert.equal(f.game.transcript(final, 'confirm'), false);
  f.game.decideCatch(f.game.round!.id, 'reject'); f.recover();
  assert.equal(f.game.data.history[0].outcome, 'overturned');
  assert.equal(f.game.score.wins, 0);
});

test('late mission expiry and private review retention happen at logical deadlines', () => {
  const f = fixture({ mission: 'three', missionDuration: 60, cooldown: 60 });
  f.game.begin(); f.chat('hint', 'a'); f.game.transcript(f.transcript()); f.recover();
  f.set(170000); f.game.advanceTo(f.clock());
  assert.equal(f.game.mission!.status, 'failed');
  assert.equal(f.game.phase, 'idle');
  assert.equal(f.game.nextDeadline(), 700000);
  f.set(700100); f.recover(); f.game.advanceTo(f.clock());
  assert.equal(f.game.awardBoard, null); assert.equal(f.json().review, null);
  const pending = fixture(); pending.game.begin(); pending.chat('hint', 'a');
  pending.game.transcript(pending.transcript(), 'confirm'); pending.recover();
  pending.set(700100); pending.game.advanceTo(pending.clock());
  assert.equal(pending.game.pendingCatch, false); assert.deepEqual(pending.game.round!.hints, []);
  assert.equal(pending.game.result?.outcome, 'caught');
  assert.equal(pending.game.result?.at, 115000, 'late wake confirms at the original logical deadline');
  assert.equal(pending.game.score.wins, 1);
  assert.equal(pending.game.awardBoard, null, 'automatic confirmation does not renew raw hint retention');
});

test('checkpoint is detached and restore rejects unknown versions, missing state, duplicates and broken result links', () => {
  const f = fixture(); f.game.begin(); f.chat('hint', 'a'); f.game.transcript(f.transcript());
  const original = f.json(); const clone = f.game.checkpoint(); clone.data.history[0].word = 'tampered';
  assert.notEqual(f.game.result!.word, 'tampered');
  const mutations: ((state: any) => void)[] = [
    (state) => { state.version = 2; },
    (state) => { state.unknown = true; },
    (state) => { delete state.recentChat; },
    (state) => { delete state.data.settings.mission; },
    (state) => { state.round.participants.push(state.round.participants[0]); },
    (state) => { state.result.word = 'changed'; },
    (state) => { state.resultHistoryId = null; },
    (state) => { state.phase = 'active'; },
    (state) => { state.review.selectedHintId = 'missing'; },
    (state) => { state.round.endsAt = Infinity; },
    (state) => { Object.defineProperty(state.data.leaders, '__proto__', { value: { name: 'forged', rounds: 99 }, enumerable: true }); },
    (state) => { state.data.leaders.constructor = { name: 'forged', rounds: 99 }; },
    (state) => { state.data.leaders.prototype = { name: 'forged', rounds: 99 }; },
  ];
  for (const mutation of mutations) {
    const state = structuredClone(original); mutation(state);
    assert.throws(() => Game.restore(state), String(mutation));
  }
  assert.equal(CardLibraryError, CoreCardLibraryError);
  assert.ok(new CoreCardLibraryError(409, 'fixture') instanceof CardLibraryError);
});


test('a bounded late-wake attempt fails without altering its durable source and restores wall clock', () => {
  const f = fixture({ duration: 30, cooldown: 5, auto: true });
  f.game.mic = 'listening'; f.game.begin();
  const durable = f.json();
  f.set(175000);
  const candidate = Game.restore(durable, f.clock, () => 0, f.uuid);
  assert.throws(() => candidate.advanceTo(f.clock(), 1), /Too many overdue/);
  assert.equal(candidate.phase, 'settling', 'candidate may have partially reconciled; discard it');
  assert.equal(candidate.view('viewer').serverTime, f.clock());
  assert.deepEqual(durable, f.json(), 'durable source and original game remain unchanged');
  const fresh = Game.restore(durable, f.clock, () => 0, f.uuid);
  fresh.advanceTo(f.clock(), 128);
  assert.equal(fresh.round!.startedAt, 173000);
  assert.equal(fresh.data.history.length, 2);
  assert.throws(() => fresh.advanceTo(f.clock(), 0), /Invalid transition limit/);
});
