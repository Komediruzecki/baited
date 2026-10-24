import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, settingsSchema, Game } from '../server/game.js';
import { fixture } from './fixtures.js';

test('matches complete normalized words across capitalization and punctuation', () => {
  assert.ok(matches('A BANANA! Really?', 'banana'));
  assert.ok(matches('The banana-split.', 'banana'));
  assert.ok(matches('ＰＥＮＧＵＩＮ!', 'penguin'));
  for (const s of ['bananas', 'bananagram', 'prebanana', 'banana2', "banana's"])
    assert.equal(matches(s, 'banana'), false, s);
});
test('only the viewer projection contains the live target', () => {
  const { game } = fixture();
  game.begin();
  const word = game.round!.word;
  assert.equal(game.view('viewer').round?.target, word);
  for (const role of ['studio', 'overlay'] as const) {
    const raw = JSON.stringify(game.view(role));
    assert.ok(!raw.includes(word));
    assert.ok(!raw.includes('overlay-secret'));
    assert.equal(game.view(role).round?.target, undefined);
  }
});
test('start, pause and resume preserve time and change the speech epoch', () => {
  const f = fixture();
  f.game.begin();
  f.advance(12345);
  f.game.pause();
  assert.equal(f.game.round!.remaining, 107655);
  const epoch = f.game.round!.epoch;
  f.advance(900000);
  f.game.tick();
  assert.equal(f.game.phase, 'paused');
  f.game.resume();
  assert.equal(f.game.round!.epoch, epoch + 1);
  f.advance(107654);
  f.game.tick();
  assert.equal(f.game.phase, 'active');
  f.advance(1);
  f.game.tick();
  assert.equal(f.game.result?.outcome, 'escaped');
});
test('cannot start on top of an active round or during cooldown', () => {
  const f = fixture();
  f.game.begin();
  assert.throws(() => f.game.begin());
  f.game.end('skipped');
  assert.throws(() => f.game.begin());
  f.advance(10000);
  f.game.tick();
  f.game.begin();
  assert.equal(f.game.round!.number, 2);
});
test('a final confident transcript wins once and reveals the result', () => {
  const f = fixture();
  f.game.begin();
  const t = f.transcript();
  assert.equal(f.game.transcript(t), true);
  assert.equal(f.game.transcript(t), false);
  assert.equal(f.game.score.wins, 1);
  assert.equal(f.game.score.streak, 1);
  assert.equal(f.game.view('studio').result!.word, t.text);
  assert.equal(f.game.phase, 'cooldown');
});
test('rejects stale, interim, wrong-round, future and uncertain transcripts', () => {
  const patches = [
    { final: false },
    { epoch: 99 },
    { roundId: 'old-round' },
    { confidence: 0.79 },
    { capturedAt: 99999 },
    { capturedAt: 102000 },
  ];
  for (const patch of patches) {
    const f = fixture();
    f.game.begin();
    assert.equal(f.game.transcript(f.transcript(undefined, patch)), false, JSON.stringify(patch));
    assert.equal(f.game.phase, 'active');
  }
  const f = fixture();
  f.game.begin();
  const old = f.transcript();
  f.advance(6000);
  assert.equal(f.game.transcript(old), false);
});
test('transcripts from before pause cannot win after resume', () => {
  const f = fixture();
  f.game.begin();
  const old = f.transcript();
  f.game.pause();
  f.advance(1000);
  f.game.resume();
  assert.equal(f.game.transcript(old), false);
  assert.equal(f.game.transcript(f.transcript()), true);
});
test('a word after the deadline cannot create a victory', () => {
  const f = fixture();
  f.game.begin();
  f.advance(120000);
  assert.equal(f.game.transcript(f.transcript()), false);
  assert.equal(f.game.result?.outcome, 'escaped');
  assert.equal(f.game.score.wins, 0);
});
test('automatic rounds wait for cooldown and choose a fresh word', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, auto: true });
  f.game.begin();
  const word = f.game.round!.word;
  f.game.end('skipped');
  f.advance(9999);
  f.game.tick();
  assert.equal(f.game.phase, 'cooldown');
  f.advance(1);
  f.game.tick();
  assert.equal(f.game.phase, 'active');
  assert.notEqual(f.game.round!.word, word);
  assert.equal(f.game.round!.number, 2);
});
test('reversing a detection restores scores and requires a new secret', () => {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript());
  f.game.reverse();
  assert.equal(f.game.score.wins, 0);
  assert.equal(f.game.score.streak, 0);
  assert.equal(f.game.score.best, 0);
  assert.equal(f.game.result?.outcome, 'overturned');
  assert.throws(() => f.game.resume());
  assert.throws(() => f.game.reverse());
  f.advance(10000);
  f.game.begin();
  assert.notEqual(f.game.round!.word, f.game.data.history[0].word);
});
test('reversal preserves a genuine previous streak and best', () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    f.game.begin();
    f.game.transcript(f.transcript());
    f.advance(10000);
    f.game.tick();
  }
  f.game.begin();
  f.game.transcript(f.transcript());
  f.game.reverse();
  assert.equal(f.game.score.wins, 2);
  assert.equal(f.game.score.streak, 2);
  assert.equal(f.game.score.best, 2);
});
test('viewer commands deduplicate votes, exclude owner and spoilers, limit spam', () => {
  const f = fixture();
  f.game.begin();
  const send = (id: string, u: string, text = 'hello') => f.game.chat(id, u, u, text, f.now());
  assert.equal(send('1', 'owner'), false);
  assert.equal(send('2', 'a', f.game.round!.word), false);
  assert.equal(send('3', 'a', '!skip'), true);
  assert.equal(send('3', 'b', '!skip'), false);
  assert.equal(send('4', 'a', '!skip'), false);
  f.advance(3000);
  assert.equal(send('5', 'a', '!skip'), true);
  assert.equal(f.game.view('viewer').voters, 1);
  assert.equal(send('6', 'b', '!skip'), true);
  assert.equal(send('7', 'c', '!skip'), true);
  assert.equal(f.game.result?.outcome, 'skipped');
  assert.equal(f.game.view('studio').participants, 3);
});
test('replayed and stale chat cannot affect a current round', () => {
  const f = fixture();
  f.game.begin();
  f.advance(20000);
  assert.equal(f.game.chat('old', 'a', 'A', 'hello', 100000), false);
  assert.equal(f.game.chat('future', 'a', 'A', 'hello', f.now() + 3000), false);
  f.game.pause();
  assert.equal(f.game.chat('paused', 'a', 'A', 'hello', f.now()), false);
});
test('100 simultaneous chatters count once each and receive fair round participation', async () => {
  const f = fixture();
  f.game.begin();
  await Promise.all(
    Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() =>
        f.game.chat(`m${i}`, `u${i}`, `User${i}`, 'subtle hint', f.now()),
      ),
    ),
  );
  assert.equal(f.game.view('studio').participants, 100);
  f.game.transcript(f.transcript());
  assert.equal(Object.keys(f.game.data.leaders).length, 100);
  assert.ok(Object.values(f.game.data.leaders).every((l) => l.rounds === 1));
  assert.equal(f.game.score.wins, 1);
});
test('invalid settings are rejected without changing live settings', () => {
  const f = fixture();
  assert.throws(() => f.game.update({ ...f.game.data.settings, duration: 1 }));
  assert.throws(() => settingsSchema.parse({ ...f.game.data.settings, target: 'cheat' }));
  assert.equal(f.game.data.settings.duration, 120);
});
test('restart retains scores but never resumes a stale active round', () => {
  const f = fixture();
  f.game.begin();
  f.game.transcript(f.transcript());
  const restored = new Game(JSON.parse(JSON.stringify(f.game.data)));
  assert.equal(restored.score.wins, 1);
  assert.equal(restored.phase, 'idle');
  assert.equal(restored.round, null);
  assert.equal(restored.streak, 0);
});
test('history stays bounded while aggregate scores survive', () => {
  const f = fixture();
  for (let i = 0; i < 110; i++) {
    f.game.begin();
    f.game.transcript(f.transcript());
    f.advance(10000);
    f.game.tick();
  }
  assert.equal(f.game.data.history.length, 100);
  assert.equal(f.game.score.played, 110);
  assert.equal(f.game.score.wins, 110);
});
