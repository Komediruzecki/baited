import assert from 'node:assert/strict';
import test from 'node:test';
import { Game, CATCH_CONFIRM_MS, defaults, settingsSchema } from '../server/game.js';
import { fixture } from './fixtures.js';

function recording() {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, recordingMode: true, difficulty: 'hard', mission: 'three', callBait: false });
  return f;
}
function next(f: ReturnType<typeof fixture>) {
  f.advance(f.game.data.settings.cooldown * 1000);
  f.game.start();
}

test('the recording sequence uses real round outcomes, then returns to the selected random deck', () => {
  const f = recording(), g = f.game;
  g.start();
  assert.equal(g.round!.word, 'banana');
  assert.equal(g.round!.difficulty, 'easy');
  assert.deepEqual(g.round!.clues, []);
  assert.equal(g.mission, null);
  assert.equal(g.round!.guessEnabled, true);
  assert.deepEqual(g.guess(g.round!.id, g.round!.epoch, 'banana'), { correct: true, bonus: 0 });
  assert.deepEqual(g.score, { wins: 0, played: 1, streak: 0, best: 0 });
  next(f);
  assert.equal(g.round!.word, 'ghost');
  assert.equal(g.transcript(f.transcript('My favourite is Ghost Face'), 'confirm'), true);
  assert.equal(g.pendingCatch, true);
  f.advance(CATCH_CONFIRM_MS); g.tick();
  assert.equal(g.score.wins, 1);
  next(f);
  assert.equal(g.round!.word, 'bait');
  const deadline = g.round!.endsAt;
  assert.deepEqual(g.guess(g.round!.id, g.round!.epoch, 'fish'), { correct: false, bonus: 15 });
  assert.equal(g.round!.endsAt, deadline + 15000);
  assert.equal(g.transcript(f.transcript('You will never bait me'), 'confirm'), true);
  f.advance(CATCH_CONFIRM_MS); g.tick();
  assert.deepEqual(g.score, { wins: 2, played: 3, streak: 2, best: 2 });
  next(f);
  assert.equal(g.round!.difficulty, 'hard');
  assert.equal(g.round!.guessEnabled, false);
  assert.ok(g.mission);
  assert.ok(g.deckFor('hard').some(card => card.target === g.round!.word));
  assert.equal(g.view('studio').recording!.roundsStarted, 4);
});

test('restart clears an active take without removing lifetime results or microphone authorization', () => {
  const f = recording(), g = f.game;
  g.connection = { status: 'connected', detail: 'Fixture connected' }; g.mic = 'listening';
  g.start(); g.end('caught'); next(f);
  const oldRound = { ...g.round! }, oldTranscript = f.transcript(), takeId = g.data.recordingTake!.id;
  const history = structuredClone(g.data.history);
  g.transcript(f.transcript('ghost'), 'confirm');
  assert.ok(g.pendingCatch);
  g.restartTake(takeId);
  assert.equal(g.phase, 'idle'); assert.equal(g.round, null); assert.equal(g.result, null);
  assert.equal(g.nextDeadline(), null); assert.equal(g.nextAt, null); assert.equal(g.awardBoard, null);
  assert.equal(g.mission, null); assert.equal(g.mic, 'listening'); assert.equal(g.connection.status, 'connected');
  assert.deepEqual(g.data.history, history);
  assert.deepEqual(g.score, { wins: 0, played: 0, streak: 0, best: 0 });
  assert.equal(g.view('studio').recording!.roundsStarted, 0);
  assert.notEqual(g.data.recordingTake!.id, takeId);
  assert.throws(() => g.restartTake(takeId), /take has changed/);
  assert.throws(() => g.decideCatch(oldRound.id, 'confirm'), /current pending/);
  g.start(); assert.equal(g.round!.word, 'banana'); assert.equal(g.round!.number, 1);
  assert.notEqual(g.round!.id, oldRound.id);
  assert.equal(g.transcript(oldTranscript), false);
  assert.throws(() => g.guess(oldRound.id, oldRound.epoch, 'banana'));
  assert.equal(g.phase, 'active');
});

test('take checkpoints retain sequence and reversal counters and reset cancels auto-advance', () => {
  const f = recording(), g = f.game;
  g.data.settings.auto = true;
  g.start(); g.end('caught');
  const copy = Game.restore(g.checkpoint(), f.now, () => 0);
  assert.equal(copy.score.wins, 1);
  copy.reverse();
  assert.deepEqual(copy.score, { wins: 0, played: 1, streak: 0, best: 0 });
  Game.restore(copy.checkpoint());
  copy.restartTake(copy.data.recordingTake!.id);
  f.advance(1_000_000); copy.tick();
  assert.equal(copy.phase, 'idle'); assert.equal(copy.nextDeadline(), null);
  copy.start(); assert.equal(copy.round!.word, 'banana');
  assert.equal(copy.round!.number, 1);
});

test('recording is opt-in and hidden targets remain viewer-only', () => {
  const f = fixture(), g = f.game;
  assert.equal(settingsSchema.parse({ ...defaults, recordingMode: undefined }).recordingMode, false);
  assert.throws(() => g.restartTake(crypto.randomUUID()));
  g.start(); assert.equal(g.view('studio').recording, undefined);
  assert.throws(() => g.update({ ...g.data.settings, recordingMode: true }), /Finish the current round/);
  g.end('ended'); g.update({ ...g.data.settings, recordingMode: true });
  g.start();
  for (const role of ['studio', 'overlay'] as const) {
    const view = g.view(role);
    assert.equal(view.round!.target, undefined); assert.equal(view.round!.example, undefined);
    assert.equal(view.round!.forbiddenClues, undefined); assert.equal(view.round!.ink, undefined);
    assert.ok(!JSON.stringify(view).includes('ghost'));
    assert.ok(!JSON.stringify(view).includes('banana'));
  }
  assert.equal(g.view('viewer').round!.target, 'banana');
  assert.equal(g.view('viewer').recording, undefined); assert.equal(g.view('overlay').recording, undefined);
  g.end('caught'); const lifetime = g.data.history.length;
  g.update({ ...g.data.settings, recordingMode: false });
  assert.equal(g.score.played, lifetime); assert.equal(g.data.recordingTake, undefined);
});


test('recording checkpoints written before the chat watermark still restore', () => {
  const f=recording(); f.game.start();
  const checkpoint=f.game.checkpoint();
  delete (checkpoint.data.recordingTake as {startedAt?:number}).startedAt;
  const restored=Game.restore(checkpoint,f.now);
  assert.equal(restored.data.recordingTake!.startedAt,0);
  assert.equal(restored.round!.word,'banana');
  assert.equal(restored.data.recordingTake!.roundsStarted,1);
  const legacy=fixture().game.checkpoint();
  delete (legacy.data.settings as {recordingMode?:boolean}).recordingMode;
  assert.equal(Game.restore(legacy).data.settings.recordingMode,false);
});
