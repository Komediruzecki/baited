import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from '../server/game.js';
import { fixture } from './fixtures.js';

const confirmationWindow = 15_000;

test('a detected catch freezes play, stays private on OBS and automatically confirms at 15 seconds', () => {
  const f = fixture();
  f.game.begin();
  f.advance(1_000);
  f.game.chat('hint', 'viewer', 'Viewer', 'a subtle hint', f.now());
  const target = f.game.round!.word;
  const detectedAt = f.now();
  f.game.transcript(f.transcript(), 'confirm');
  assert.equal(f.game.result?.confirmAt, detectedAt + confirmationWindow);
  assert.equal(f.game.nextDeadline(), detectedAt + confirmationWindow);
  assert.equal(f.game.view('overlay').result?.word, undefined);
  assert.equal(f.game.data.history.length, 0);

  f.advance(confirmationWindow - 1);
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'review');
  assert.equal(f.game.score.wins, 0);
  f.advance(1);
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'caught');
  assert.equal(Object.hasOwn(f.game.result!, 'confirmAt'), false);
  assert.equal(f.game.result?.elapsed, 1);
  assert.equal(f.game.result?.at, detectedAt + confirmationWindow);
  assert.equal(f.game.view('overlay').result?.word, target);
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.score.streak, 1);
  assert.equal(f.game.data.leaders.viewer.rounds, 1);
  assert.equal(f.game.awardBoard?.candidates.length, 1);
  assert.equal(f.game.data.history.length, 1);
  f.game.tick();
  assert.equal(f.game.data.history.length, 1, 'A repeated timer must not score twice.');
});

test('manual confirm or reject cancels the pending timer and stale requests cannot change the result', () => {
  for (const decision of ['confirm', 'reject'] as const) {
    const f = fixture();
    f.game.begin();
    const id = f.game.round!.id;
    f.game.transcript(f.transcript(), 'confirm');
    f.advance(1_000);
    f.game.decideCatch(id, decision);
    assert.equal(f.game.result?.outcome, decision === 'confirm' ? 'caught' : 'overturned');
    assert.equal(Object.hasOwn(f.game.result!, 'confirmAt'), false);
    f.advance(confirmationWindow);
    f.game.tick();
    assert.equal(f.game.score.wins, decision === 'confirm' ? 1 : 0);
    assert.equal(f.game.data.history.length, 1);
    assert.throws(() => f.game.decideCatch(id, 'confirm'));
    assert.throws(() => f.game.decideCatch(id, 'reject'));
  }
});

test('a late manual rejection cannot beat the deadline and the automatically confirmed catch remains reversible', () => {
  const f = fixture();
  f.game.begin();
  const id = f.game.round!.id;
  f.game.transcript(f.transcript(), 'confirm');
  f.advance(confirmationWindow);
  assert.throws(() => f.game.decideCatch(id, 'reject'));
  assert.equal(f.game.result?.outcome, 'caught');
  f.game.reverse();
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.equal(f.game.score.wins, 0);
  assert.equal(f.game.score.streak, 0);
  assert.equal(Object.hasOwn(f.game.result!, 'confirmAt'), false);
  assert.equal(f.game.data.history.length, 1);
  assert.throws(() => f.game.reverse());
});

test('a stale alarm or decision from a rejected round cannot confirm the next pending catch', () => {
  const f = fixture();
  f.game.begin();
  const previous = f.game.round!.id;
  f.game.transcript(f.transcript(), 'confirm');
  const previousDeadline = f.game.result!.confirmAt!;
  f.advance(1_000);
  f.game.decideCatch(previous, 'reject');
  f.advance(10_000);
  f.game.begin();
  f.advance(1_000);
  f.game.transcript(f.transcript(), 'confirm');
  const current = f.game.round!.id;
  const currentDeadline = f.game.result!.confirmAt!;
  f.advance(previousDeadline - f.now());
  f.game.tick();
  assert.throws(() => f.game.decideCatch(previous, 'confirm'));
  assert.equal(f.game.result?.id, current);
  assert.equal(f.game.result?.outcome, 'review');
  assert.equal(f.game.result?.confirmAt, currentDeadline);
  assert.equal(f.game.score.wins, 0);
  f.advance(currentDeadline - f.now());
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'caught');
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.data.history.length, 2);
});

test('checkpoint recovery retains the confirmation deadline and late wakes settle it once at logical time', () => {
  const f = fixture();
  f.game.begin();
  f.advance(1_000);
  f.game.transcript(f.transcript(), 'confirm');
  const confirmAt = f.now() + confirmationWindow;
  const restored = Game.restore(f.game.checkpoint(), f.now, () => 0);
  assert.equal(restored.result?.confirmAt, confirmAt);
  assert.equal(restored.nextDeadline(), confirmAt);
  f.advance(confirmationWindow + 60_000);
  restored.advanceTo(f.now());
  assert.equal(restored.result?.outcome, 'caught');
  assert.equal(restored.result?.at, confirmAt);
  assert.equal(restored.phase, 'idle');
  assert.equal(restored.score.wins, 1);
  assert.equal(restored.data.history.length, 1);
  assert.equal(Object.hasOwn(restored.result!, 'confirmAt'), false);
  const recoveredAgain = Game.restore(restored.checkpoint(), f.now, () => 0);
  recoveredAgain.advanceTo(f.now());
  assert.equal(recoveredAgain.score.wins, 1);
  assert.equal(recoveredAgain.data.history.length, 1);
});

test('older pending checkpoints acquire the bounded deadline and reject corrupt confirmation deadlines', () => {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript(), 'confirm');
  const legacy = f.game.checkpoint();
  delete legacy.result!.confirmAt;
  const restored = Game.restore(legacy, f.now, () => 0);
  assert.equal(restored.result?.confirmAt, f.now() + confirmationWindow);
  f.advance(confirmationWindow);
  restored.advanceTo(f.now());
  assert.equal(restored.score.wins, 1);

  for (const confirmAt of [legacy.result!.at - 1, legacy.result!.at + 1, Infinity]) {
    const invalid = structuredClone(legacy);
    invalid.result!.confirmAt = confirmAt;
    assert.throws(() => Game.restore(invalid));
  }
  const completed = restored.checkpoint();
  completed.result!.confirmAt = f.now() + confirmationWindow;
  completed.data.history[0].confirmAt = completed.result!.confirmAt;
  assert.throws(() => Game.restore(completed));
});
