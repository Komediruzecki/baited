import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Game, defaults, settingsSchema } from '../server/game.js';

function fixture(roll = 0, streak = 3, enabled = true) {
  let now = 100_000, draws = 0;
  const chooseChaos = (size: number) => { assert.equal(size, 4); draws++; return roll; };
  const game = new Game({ id: 'chaos-test', owner: 'owner', channel: 'channel', mode: 'demo',
    overlayKey: 'synthetic-overlay-key', settings: { ...defaults, callBait: true, baityChaos: enabled },
    history: [], priorWins: streak, priorPlayed: streak, priorBest: streak, leaders: {},
  }, () => now, () => 0, randomUUID, chooseChaos);
  game.streak = streak;
  return { game, clock: () => now, add: (ms: number) => { now += ms; }, draws: () => draws, chooseChaos };
}
function guess(game: Game, word = game.round!.word) {
  return game.guess(game.round!.id, game.round!.epoch, word);
}

test('chaos is opt-in and only a correct guess with a three-plus streak rolls once', () => {
  assert.equal(defaults.baityChaos, false);
  assert.equal(settingsSchema.parse({ ...defaults, baityChaos: undefined }).baityChaos, false);
  for (const [enabled, streak] of [[false, 3], [true, 2]] as const) {
    const f = fixture(0, streak, enabled); f.game.begin();
    assert.deepEqual(guess(f.game), { correct: true, bonus: 0 });
    assert.equal(f.game.result?.reason, 'guess');
    assert.equal(f.draws(), 0);
    assert.equal(f.game.data.chaosSession?.used, false);
  }
  const wrong = fixture(); wrong.game.begin();
  assert.deepEqual(guess(wrong.game, 'nottherealword'), { correct: false, bonus: 15 });
  assert.equal(wrong.draws(), 0);
  assert.equal(wrong.game.data.chaosSession?.used, false);
  for (const draw of [1, 2, 3]) {
    const miss = fixture(draw); miss.game.begin();
    assert.deepEqual(guess(miss.game), { correct: true, bonus: 0 });
    assert.equal(miss.game.result?.reason, 'guess');
    assert.equal(miss.draws(), 1);
    assert.equal(miss.game.data.chaosSession?.used, false);
  }
});

test('an intervention is truthful, increments chat once, reveals only the result and offers no MVP', () => {
  const f = fixture(); f.game.begin(); const round = f.game.round!;
  f.game.chat('hint', 'viewer', 'Viewer', 'A very formal outfit?', f.clock());
  assert.equal(f.game.view('studio').round!.target, undefined);
  assert.equal(f.game.view('overlay').round!.target, undefined);
  assert.equal(f.game.view('viewer').chaosSession, undefined);
  assert.equal(f.game.view('overlay').chaosSession, undefined);
  assert.equal(f.game.view('studio').chaosSession?.used, false);
  assert.equal(f.game.view('viewer').round!.baityChaos, true);
  assert.deepEqual(guess(f.game), { correct: true, bonus: 0, intervened: true });
  assert.equal(f.game.result?.outcome, 'caught');
  assert.equal(f.game.result?.reason, 'baity-chaos');
  assert.equal(f.game.result?.confirmAt, undefined);
  assert.deepEqual(f.game.score, { wins: 4, played: 4, streak: 4, best: 4 });
  assert.equal(f.game.view('overlay').result?.word, round.word);
  assert.equal(f.game.awardBoard, null);
  assert.throws(() => f.game.award(round.id, 'hint'), /latest community win/);
  assert.equal(f.game.data.chaosSession?.used, true);
  assert.throws(() => guess(f.game), /current live word/);
  assert.equal(f.draws(), 1);
  assert.equal(f.game.data.history.length, 1);
});

test('allowance survives checkpoint, browser-equivalent reconnect, toggles and reversing the win', () => {
  const f = fixture(); f.game.begin(); guess(f.game);
  const restored = Game.restore(f.game.checkpoint(), f.clock, () => 0, randomUUID, f.chooseChaos);
  assert.deepEqual(restored.data.chaosSession, f.game.data.chaosSession);
  assert.equal(restored.view('studio').chaosSession?.used, true);
  restored.update({ ...restored.data.settings, baityChaos: false });
  restored.update({ ...restored.data.settings, baityChaos: true });
  restored.reverse();
  assert.equal(restored.result?.outcome, 'overturned');
  assert.equal(restored.result?.reason, 'baity-chaos');
  assert.equal(restored.data.chaosSession?.used, true);
  assert.deepEqual(restored.score, { wins: 3, played: 4, streak: 3, best: 3 });
  assert.equal(restored.awardBoard, null);
  f.add(10_000); restored.begin();
  assert.deepEqual(guess(restored), { correct: true, bonus: 0 });
  assert.equal(restored.result?.reason, 'guess');
  assert.equal(f.draws(), 1, 'An already used allowance cannot draw again.');
  Game.restore(restored.checkpoint());
});

test('rule changes apply next word; session reset is explicit, stale-ID protected and score preserving', () => {
  const f = fixture(0, 3, false); f.game.begin();
  const id = f.game.data.chaosSession!.id;
  f.game.update({ ...f.game.data.settings, baityChaos: true });
  assert.equal(f.game.round!.baityChaos, false);
  assert.throws(() => f.game.restartChaosSession(id), /Finish the current round/);
  f.game.pause();
  assert.throws(() => f.game.restartChaosSession(id), /Finish the current round/);
  f.game.resume();
  assert.deepEqual(guess(f.game), { correct: true, bonus: 0 });
  const before = structuredClone(f.game.score);
  f.game.restartChaosSession(id);
  assert.notEqual(f.game.data.chaosSession!.id, id);
  assert.deepEqual(f.game.score, before);
  assert.throws(() => f.game.restartChaosSession(id), /has changed/);
  f.add(10_000); f.game.begin();
  assert.equal(f.game.round!.baityChaos, true);
  f.game.update({ ...f.game.data.settings, baityChaos: false });
  assert.equal(f.game.round!.baityChaos, true);
});

test('pending catches cannot reset an allowance and ordinary detections do not invoke chaos', () => {
  const f = fixture(); f.game.begin(); const r = f.game.round!;
  f.game.transcript({ id: 'spoken', roundId: r.id, epoch: r.epoch, text: r.word,
    capturedAt: f.clock(), final: true, confidence: .99 }, 'confirm');
  assert.equal(f.game.result?.outcome, 'review');
  assert.throws(() => f.game.restartChaosSession(f.game.data.chaosSession!.id), /Finish the current round/);
  f.game.decideCatch(r.id, 'confirm');
  assert.equal(f.game.result?.reason, undefined);
  assert.equal(f.game.data.chaosSession?.used, false);
  assert.equal(f.draws(), 0);
});

test('recording reset starts a fresh allowance while checkpoints migrate old games safely', () => {
  const f = fixture(); f.game.begin(); guess(f.game);
  const oldSession = f.game.data.chaosSession!.id;
  f.game.update({ ...f.game.data.settings, recordingMode: true });
  assert.equal(f.game.data.chaosSession!.used, false);
  assert.notEqual(f.game.data.chaosSession!.id, oldSession);
  const session = f.game.data.chaosSession!.id;
  f.game.data.chaosSession!.used = true;
  f.game.restartTake(f.game.data.recordingTake!.id);
  assert.equal(f.game.data.chaosSession!.used, false);
  assert.notEqual(f.game.data.chaosSession!.id, session);
  const legacy = structuredClone(f.game.checkpoint()) as any;
  delete legacy.data.chaosSession; delete legacy.data.settings.baityChaos;
  const restored = Game.restore(legacy, f.clock);
  assert.equal(restored.data.settings.baityChaos, false);
  assert.equal(restored.data.chaosSession!.used, false);
  assert.match(restored.data.chaosSession!.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Game.restore(legacy, f.clock).data.chaosSession, restored.data.chaosSession,
    'Repeated legacy restores before any write retain the same initial session.');
  const live = fixture(); live.game.begin();
  const oldLive = structuredClone(live.game.checkpoint()) as any;
  delete oldLive.round.baityChaos; delete oldLive.data.settings.baityChaos;
  const migrated = Game.restore(oldLive, live.clock, () => 0, randomUUID, live.chooseChaos);
  assert.equal(migrated.round!.baityChaos, false);
  assert.deepEqual(guess(migrated), { correct: true, bonus: 0 });
  assert.equal(live.draws(), 0);
});


test('a deliberate chat win advances a mission, but reversal restores progress without refunding chaos', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three' });
  f.game.begin();
  const originalEnd = f.game.mission!.endsAt;
  assert.equal(f.game.mission!.completed, 0);
  assert.deepEqual(guess(f.game), { correct: true, bonus: 0, intervened: true });
  assert.equal(f.game.mission!.completed, 1);
  assert.equal(f.game.mission!.status, 'active');
  assert.equal(f.game.mission!.endsAt, originalEnd);
  const restored = Game.restore(f.game.checkpoint(), f.clock);
  restored.reverse();
  assert.equal(restored.mission!.completed, 0);
  assert.equal(restored.result!.reason, 'baity-chaos');
  assert.equal(restored.data.chaosSession!.used, true);
  assert.equal(restored.awardBoard, null);
});

test('checkpoint validation rejects forged speech review or MVP data on a Baity intervention', () => {
  const f = fixture(); f.game.begin(); guess(f.game);
  for (const patch of [
    { outcome: 'review', confirmAt: f.clock() + 15_000 },
    { award: { name: 'Viewer' } },
    { outcome: 'escaped' },
  ]) {
    const corrupt = structuredClone(f.game.checkpoint()) as any;
    Object.assign(corrupt.result, patch);
    Object.assign(corrupt.data.history[0], patch);
    assert.throws(() => Game.restore(corrupt, f.clock), /deliberate result/);
  }
});
