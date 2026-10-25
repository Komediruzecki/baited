import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.js';
import type { AwardBoard } from '../shared/types.js';

test('local catches stop before reveal and leave score, history and awards unchanged until confirmation', () => {
  const f = fixture(); f.game.begin(); f.advance(1000);
  const id = f.game.round!.id, target = f.game.round!.word;
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
    assert.equal(view.phase, 'cooldown'); assert.equal(view.result?.word, target);
    assert.equal(view.result?.outcome, 'review'); assert.equal(view.score.wins, 0);
    assert.equal(view.round?.target, undefined);
  }
  assert.throws(() => f.game.award(id, 'hint'));
  assert.throws(() => f.game.decideCatch('another-round', 'confirm'));
  assert.throws(() => f.game.start());
  f.advance(90000); f.game.tick();
  assert.equal(f.game.result?.outcome, 'review');
  f.game.decideCatch(id, 'confirm');
  assert.equal(f.game.score.wins, 1); assert.equal(f.game.score.played, 1);
  assert.equal(f.game.result?.elapsed, 1, 'waiting for confirmation does not increase elapsed play');
  assert.equal(f.game.data.leaders.viewer.rounds, 1);
  assert.equal((f.game.awardBoard as AwardBoard | null)?.candidates.length, 1);
  assert.throws(() => f.game.decideCatch(id, 'confirm'));
  assert.throws(() => f.game.decideCatch(id, 'reject'));
  assert.equal(f.game.score.wins, 1); assert.equal(f.game.data.history.length, 1);
  assert.equal(f.game.transcript(f.transcript(), 'confirm'), false);
});

test('rejecting a local catch preserves the previous streak and requires a fresh word', () => {
  const f = fixture(); f.game.begin(); f.game.transcript(f.transcript());
  f.advance(10000); f.game.begin();
  const target = f.game.round!.word, id = f.game.round!.id;
  const before = { ...f.game.score };
  f.game.transcript(f.transcript(), 'confirm');
  assert.deepEqual(f.game.score, before);
  f.game.decideCatch(id, 'reject');
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.equal(f.game.score.wins, before.wins); assert.equal(f.game.score.streak, before.streak);
  assert.equal(f.game.score.best, before.best); assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.reverse());
  f.advance(10000); f.game.begin();
  assert.notEqual(f.game.round!.word, target);
  assert.throws(() => f.game.decideCatch(id, 'confirm'));
});

test('a confirmed catch can still be reversed with its hint award removed exactly once', () => {
  const f = fixture(); f.game.begin();
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  f.game.transcript(f.transcript(), 'confirm');
  f.game.decideCatch(f.game.round!.id, 'confirm');
  f.game.award(f.game.round!.id, f.game.awardBoard!.candidates[0].id);
  assert.equal(f.game.data.leaders.viewer.baits, 1);
  f.game.reverse();
  assert.equal(f.game.score.wins, 0); assert.equal(f.game.score.best, 0);
  assert.equal(f.game.data.leaders.viewer.baits, 0);
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.reverse());
});

test('auto and mission clocks wait for confirmation, then continue from the frozen time', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, auto: true, mission: 'three', missionDuration: 60 });
  f.game.begin(); f.advance(10000);
  const id = f.game.round!.id;
  f.game.transcript(f.transcript(), 'confirm');
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  assert.equal(f.game.view('studio').mission?.endsAt, null);
  f.advance(180000); f.game.tick();
  assert.equal(f.game.round!.id, id); assert.equal(f.game.nextAt, null);
  assert.equal(f.game.mission?.status, 'active'); assert.equal(f.game.mission?.completed, 0);
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  f.game.decideCatch(id, 'confirm');
  assert.equal(f.game.mission?.completed, 1);
  assert.equal(f.game.view('studio').mission?.remaining, 50000);
  f.advance(10000); f.game.tick();
  assert.equal(f.game.phase, 'active'); assert.notEqual(f.game.round!.id, id);
  assert.equal(f.game.view('studio').mission?.remaining, 40000);
});

test('Deepgram automatic scoring still awards immediately', () => {
  const f = fixture(); f.game.begin();
  assert.equal(f.game.transcript(f.transcript()), true);
  assert.equal(f.game.result?.outcome, 'caught'); assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.pendingCatch, false);
});

test('pending catches expire raw hints ten minutes after stopping without deciding or scoring', () => {
  const f = fixture(); f.game.begin();
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  f.game.transcript(f.transcript(), 'confirm');
  const id = f.game.round!.id;
  f.advance(599999); f.game.tick();
  assert.equal(f.game.round!.hints.length, 1);
  f.advance(1); f.game.tick();
  assert.equal(f.game.round!.hints.length, 0);
  assert.equal(f.game.pendingCatch, true);
  assert.equal(f.game.nextAt, null);
  assert.equal(f.game.score.played, 0);
  assert.equal(f.game.score.wins, 0);
  f.game.decideCatch(id, 'confirm');
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.awardBoard, null);
});

test('confirmation preserves the original hint deadline, including when no expiry tick ran', () => {
  for (const delay of [300000, 600000]) {
    const f = fixture(); f.game.begin();
    f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
    f.game.transcript(f.transcript(), 'confirm');
    const stoppedAt = f.now(), id = f.game.round!.id;
    f.advance(delay);
    f.game.decideCatch(id, 'confirm');
    assert.equal(f.game.round!.hints.length, 0);
    assert.equal(f.game.score.wins, 1);
    if (delay < 600000) {
      assert.equal(f.game.awardBoard?.expiresAt, stoppedAt + 600000);
      assert.equal(f.game.awardBoard?.candidates.length, 1);
      f.advance(600000 - delay); f.game.tick();
    }
    assert.equal(f.game.awardBoard, null);
    assert.throws(() => f.game.award(id, 'hint'));
  }
});
