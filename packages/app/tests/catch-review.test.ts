import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.js';
import type { AwardBoard } from '../shared/types.js';

test('OBS receives a word only for a caught or escaped result, never through history', () => {
  for (const outcome of [
    'review',
    'caught',
    'escaped',
    'skipped',
    'ended',
    'overturned',
  ] as const) {
    const f = fixture();
    f.game.begin();
    f.game.transcript(f.transcript());
    const priorWord = f.game.result!.word;
    f.advance(10000);
    f.game.begin();
    const word = f.game.round!.word;
    if (outcome === 'review' || outcome === 'overturned') {
      f.game.transcript(f.transcript(), 'confirm');
      if (outcome === 'overturned') f.game.decideCatch(f.game.round!.id, 'reject');
    } else f.game.end(outcome);

    const overlay = f.game.view('overlay');
    const revealed = outcome === 'caught' || outcome === 'escaped';
    assert.equal(overlay.result?.word, revealed ? word : undefined, outcome);
    assert.equal(Object.hasOwn(overlay.result!, 'word'), revealed, outcome);
    assert.ok(
      overlay.history.every((entry) => !Object.hasOwn(entry, 'word')),
      outcome,
    );
    assert.equal(JSON.stringify(overlay).includes(priorWord), false, outcome);
    if (!revealed) assert.equal(JSON.stringify(overlay).includes(word), false, outcome);
    assert.equal(f.game.view('studio').result?.word, word);
    assert.equal(f.game.view('viewer').result?.word, word);
    assert.equal(
      f.game.data.history.at(-1)?.word,
      priorWord,
      'projection must not mutate saved results',
    );
  }
});

test('local catches stop before reveal and leave score, history and awards unchanged until confirmation', () => {
  const f = fixture();
  f.game.begin();
  f.advance(1000);
  const id = f.game.round!.id,
    target = f.game.round!.word;
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  const before = { ...f.game.score };
  assert.equal(f.game.view('studio').round?.target, undefined);
  assert.equal(f.game.view('overlay').round?.target, undefined);
  assert.equal(f.game.view('viewer').round?.target, target);
  const updates: { phase: string; outcome: string | undefined }[] = [];
  f.game.onChange = () => updates.push({ phase: f.game.phase, outcome: f.game.result?.outcome });
  assert.equal(f.game.transcript(f.transcript(), 'confirm'), true);
  assert.deepEqual(updates, [{ phase: 'cooldown', outcome: 'review' }]);
  assert.deepEqual(f.game.score, before);
  assert.equal(f.game.data.history.length, 0);
  assert.equal(f.game.awardBoard, null);
  assert.deepEqual(f.game.data.leaders, {});
  for (const role of ['studio', 'overlay', 'viewer'] as const) {
    const view = f.game.view(role);
    assert.equal(view.phase, 'cooldown');
    assert.equal(view.result?.word, role === 'overlay' ? undefined : target);
    assert.equal(view.result?.outcome, 'review');
    assert.equal(view.score.wins, 0);
    assert.equal(view.round?.target, undefined);
  }
  const pendingOverlay = f.game.view('overlay');
  assert.equal(Object.hasOwn(pendingOverlay.result!, 'word'), false);
  assert.equal(JSON.stringify(pendingOverlay).includes(target), false);
  assert.throws(() => f.game.award(id, 'hint'));
  assert.throws(() => f.game.decideCatch('another-round', 'confirm'));
  assert.throws(() => f.game.start());
  f.advance(14999);
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'review');
  f.game.decideCatch(id, 'confirm');
  assert.equal(f.game.view('overlay').result?.word, target);
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.score.played, 1);
  assert.equal(
    f.game.result?.elapsed,
    1,
    'waiting for confirmation does not increase elapsed play',
  );
  assert.equal(f.game.data.leaders.viewer.rounds, 1);
  assert.equal((f.game.awardBoard as AwardBoard | null)?.candidates.length, 1);
  assert.throws(() => f.game.decideCatch(id, 'confirm'));
  assert.throws(() => f.game.decideCatch(id, 'reject'));
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.data.history.length, 1);
  assert.equal(f.game.transcript(f.transcript(), 'confirm'), false);
});

test('a revealed pending catch cannot become an escape through an unused guess, even after rejection', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, callBait: true });
  f.game.begin();
  const { id, epoch } = f.game.round!;
  assert.equal(f.game.round!.guessEnabled, true);
  assert.equal(f.game.round!.guessUsed, false);
  const before = { ...f.game.score };

  f.game.transcript(f.transcript(), 'confirm');
  const revealed = f.game.view('studio');
  assert.equal(revealed.phase, 'cooldown');
  assert.equal(revealed.result?.outcome, 'review');
  const learnedWord = revealed.result!.word!;
  assert.ok(learnedWord, 'The attempted guess comes from the word Studio has just revealed.');
  assert.throws(() => f.game.guess(id, epoch, learnedWord), /Only the current live word can be guessed/);
  assert.equal(f.game.result?.outcome, 'review');
  assert.equal(f.game.round!.guessUsed, false, 'Refusing the late guess does not spend a guess.');
  assert.deepEqual(f.game.score, before);
  assert.equal(f.game.data.history.length, 0);

  f.game.decideCatch(id, 'reject');
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.deepEqual(f.game.score, { ...before, played: before.played + 1 });
  const rejectedHistory = structuredClone(f.game.data.history);
  assert.deepEqual(rejectedHistory.map(result => ({ id: result.id, outcome: result.outcome })),
    [{ id, outcome: 'overturned' }]);
  assert.throws(() => f.game.guess(id, epoch, learnedWord), /Only the current live word can be guessed/);
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.deepEqual(f.game.score, { ...before, played: before.played + 1 });
  assert.deepEqual(f.game.data.history, rejectedHistory);

  f.advance(f.game.data.settings.cooldown * 1000);
  f.game.begin();
  const next = f.game.round!;
  assert.notEqual(next.id, id);
  assert.notEqual(next.word, learnedWord, 'Rejecting the catch requires a fresh secret word.');
  assert.throws(() => f.game.guess(id, epoch, learnedWord), /Only the current live word can be guessed/);
  assert.equal(next.guessUsed, false, 'A stale request cannot consume the next word’s guess.');
  assert.deepEqual(f.game.guess(next.id, next.epoch, next.word), { correct: true, bonus: 0 });
  assert.equal(f.game.result?.outcome, 'escaped');
  assert.equal(f.game.result?.reason, 'guess');
  assert.deepEqual(f.game.data.history.slice(1), rejectedHistory);
  assert.deepEqual(f.game.score, { ...before, played: before.played + 2 });
});

test('rejecting a local catch preserves the previous streak and requires a fresh word', () => {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript());
  f.advance(10000);
  f.game.begin();
  const target = f.game.round!.word,
    id = f.game.round!.id;
  const before = { ...f.game.score };
  f.game.transcript(f.transcript(), 'confirm');
  assert.deepEqual(f.game.score, before);
  f.game.decideCatch(id, 'reject');
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.equal(f.game.score.wins, before.wins);
  assert.equal(f.game.score.streak, before.streak);
  assert.equal(f.game.score.best, before.best);
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.reverse());
  f.advance(10000);
  f.game.begin();
  assert.notEqual(f.game.round!.word, target);
  assert.throws(() => f.game.decideCatch(id, 'confirm'));
});

test('a confirmed catch can still be reversed with its hint award removed exactly once', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  f.game.transcript(f.transcript(), 'confirm');
  f.game.decideCatch(f.game.round!.id, 'confirm');
  f.game.award(f.game.round!.id, f.game.awardBoard!.candidates[0].id);
  assert.equal(f.game.data.leaders.viewer.baits, 1);
  f.game.reverse();
  assert.equal(f.game.score.wins, 0);
  assert.equal(f.game.score.best, 0);
  assert.equal(f.game.data.leaders.viewer.baits, 0);
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.reverse());
});

test('auto and mission clocks wait for automatic confirmation, then continue from the frozen time', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, auto: true, mission: 'three', missionDuration: 60 });
  f.game.begin();
  f.advance(10000);
  const id = f.game.round!.id;
  f.game.transcript(f.transcript(), 'confirm');
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  assert.equal(f.game.view('studio').mission?.endsAt, null);
  f.advance(14999);
  f.game.tick();
  assert.equal(f.game.round!.id, id);
  assert.equal(f.game.nextAt, null);
  assert.equal(f.game.mission?.status, 'active');
  assert.equal(f.game.mission?.completed, 0);
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  f.advance(1);
  f.game.tick();
  assert.equal(f.game.mission?.completed, 1);
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  f.advance(10000);
  f.game.tick();
  assert.equal(f.game.phase, 'active');
  assert.notEqual(f.game.round!.id, id);
  assert.equal(f.game.view('studio').mission?.remaining, 40000);
});

test('Deepgram automatic scoring still awards immediately', () => {
  const f = fixture();
  f.game.begin();
  assert.equal(f.game.transcript(f.transcript()), true);
  assert.equal(f.game.result?.outcome, 'caught');
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.pendingCatch, false);
});

test('automatic confirmation keeps the original ten-minute raw hint retention', () => {
  const f = fixture();
  f.game.begin();
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  f.game.transcript(f.transcript(), 'confirm');
  f.advance(15000);
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'caught');
  assert.equal(f.game.round!.hints.length, 0);
  assert.equal(f.game.awardBoard?.candidates.length, 1);
  f.advance(584999);
  f.game.tick();
  assert.equal(f.game.awardBoard?.candidates.length, 1);
  f.advance(1);
  f.game.tick();
  assert.equal(f.game.round!.hints.length, 0);
  assert.equal(f.game.pendingCatch, false);
  assert.equal(f.game.nextAt, null);
  assert.equal(f.game.score.played, 1);
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.awardBoard, null);
});

test('manual and automatic confirmation preserve the original hint deadline, including a late wake', () => {
  for (const delay of [14000, 300000, 600000]) {
    const f = fixture();
    f.game.begin();
    f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
    f.game.transcript(f.transcript(), 'confirm');
    const stoppedAt = f.now(),
      id = f.game.round!.id;
    f.advance(delay);
    if (delay < 15000) f.game.decideCatch(id, 'confirm');
    else f.game.tick();
    assert.equal(f.game.round!.hints.length, 0);
    assert.equal(f.game.score.wins, 1);
    if (delay < 600000) {
      assert.equal(f.game.awardBoard?.expiresAt, stoppedAt + 600000);
      assert.equal(f.game.awardBoard?.candidates.length, 1);
      f.advance(600000 - delay);
      f.game.tick();
    }
    assert.equal(f.game.awardBoard, null);
    assert.throws(() => f.game.award(id, 'hint'));
  }
});
