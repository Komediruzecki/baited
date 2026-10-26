import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { SoundEventGate, type SoundSnapshot } from '../client/sound-lab/events';
import { createSoundController, type SoundPlayback } from '../client/sound-lab/controller';
import { SOUND_CUES, recipeForCue, type SoundCue } from '../client/sound-lab/recipes';
import { createRng } from '../client/sound-lab/keys/rng';
import { voiceLength } from '../client/sound-lab/keys/recipe';
import { CEILING, softClipCurve } from '../client/sound-lab/keys/engine';
import { generateTexture } from '../client/sound-lab/keys/textures';

function snapshot(phase: SoundSnapshot['phase'] = 'idle', roundId: string | null = null, outcome?: 'caught' | 'escaped' | 'overturned' | 'review'): SoundSnapshot {
  return {
    id: 'room-a', phase,
    round: roundId ? {
      id: roundId, number: 1, duration: 60, remaining: 30, endsAt: 1000,
      settleUntil: null, epoch: 1, difficulty: 'easy', guessEnabled: false,
      guessUsed: false, wrongGuessBonus: 0,
    } : null,
    result: outcome ? { id: 'result-a', number: 1, word: 'banana', outcome, elapsed: 30, participants: 2, at: 1000 } : null,
  };
}

test('restored results, duplicate snapshots and reconnects never replay a celebration', () => {
  const gate = new SoundEventGate();
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'caught')), []);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'caught')), []);
  assert.deepEqual(gate.receive(snapshot('idle')), []);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'caught')), []);
  assert.deepEqual(gate.receive({ ...snapshot('cooldown', 'one', 'caught'), id: 'room-b' }), []);
});

test('committed results sound once and an overturned result gets a separate correction', () => {
  const gate = new SoundEventGate();
  gate.receive(snapshot());
  assert.deepEqual(gate.receive(snapshot('active', 'one')), ['deal']);
  assert.deepEqual(gate.receive(snapshot('settling', 'one')), []);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'caught')), ['catch']);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'caught')), []);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'overturned')), ['correction']);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'overturned')), []);
});

test('a Moonshine review stays silent and same-id confirmation celebrates exactly once', () => {
  const gate = new SoundEventGate();
  gate.receive(snapshot('active', 'one'));
  const pending = snapshot('cooldown', 'one', 'review');
  assert.deepEqual(gate.receive(pending), []);
  assert.deepEqual(gate.receive(pending), []);
  const confirmed = snapshot('cooldown', 'one', 'caught');
  assert.equal(confirmed.result!.id, pending.result!.id);
  assert.deepEqual(gate.receive(confirmed), ['catch']);
  assert.deepEqual(gate.receive(confirmed), []);
});

test('a rejected pending catch never celebrates, including after restoring its review', () => {
  const gate = new SoundEventGate();
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'review')), []);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'overturned')), ['correction']);
  assert.deepEqual(gate.receive(snapshot('cooldown', 'one', 'overturned')), []);
  const restored = new SoundEventGate();
  assert.deepEqual(restored.receive(snapshot('cooldown', 'one', 'review')), []);
  assert.deepEqual(restored.receive(snapshot('cooldown', 'one', 'caught')), ['catch']);
  assert.deepEqual(restored.receive(snapshot('cooldown', 'one', 'caught')), []);
});

test('countdown does not flood sound on frame updates, resume or after the buzzer', () => {
  const gate = new SoundEventGate();
  gate.receive(snapshot('active', 'one'));
  assert.equal(gate.tick(6), false);
  assert.equal(gate.tick(4.8), true);
  assert.equal(gate.tick(4.1), false);
  gate.receive(snapshot('paused', 'one'));
  assert.equal(gate.tick(3), false);
  gate.receive(snapshot('active', 'one'));
  assert.equal(gate.tick(4.5), false);
  assert.equal(gate.tick(2.8), true);
  assert.equal(gate.tick(0), false);
  gate.receive(snapshot('settling', 'one'));
  assert.equal(gate.tick(1), false);
  gate.receive(snapshot('active', 'two'));
  assert.equal(gate.tick(4.8), true);
});

function harness(reserveOutput: () => Promise<(() => void) | null> = async () => () => {}) {
  const played: SoundCue[] = [];
  const volumes: number[] = [];
  let created = 0, stopped = 0, disposed = 0;
  const playback: SoundPlayback = {
    resume: async () => {}, suspend() {},
    play: cue => { played.push(cue); return true; },
    stop: () => { stopped++; },
    setVolume: value => { volumes.push(value); },
    dispose: () => { disposed++; },
  };
  const sound = createSoundController({ roomId: 'room-a', createPlayback: () => { created++; return playback; }, reserveOutput });
  return { sound, played, volumes, count: () => ({ created, stopped, disposed }) };
}

test('sound creates no context until enabled, stays muted on reload, and never replays muted events', async () => {
  const { sound, played, count } = harness();
  sound.receive(snapshot());
  sound.receive(snapshot('active', 'one'));
  sound.tick(3);
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  assert.equal(sound.preview('catch'), false);
  assert.equal(count().created, 0);
  assert.equal(await sound.enable(), true);
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  await wait(180);
  assert.deepEqual(played, []);
  assert.equal(sound.preview('catch'), true);
  sound.disable();
  assert.equal(sound.preview('escape'), false);
  assert.deepEqual(played, ['catch']);
  sound.dispose();
  assert.equal(count().disposed, 1);
});

test('cancelling an in-flight enable releases ownership and cannot turn audio back on', async () => {
  let finish: ((release: () => void) => void) | undefined;
  let released = 0;
  const { sound, played } = harness(() => new Promise(resolve => { finish = resolve; }));
  const enabling = sound.enable();
  sound.disable();
  finish!(() => { released++; });
  assert.equal(await enabling, false);
  assert.equal(sound.enabled, false);
  assert.equal(released, 1);
  assert.equal(sound.preview('catch'), false);
  assert.deepEqual(played, []);
  sound.dispose();
});

test('the audio controller waits for confirmation rather than playing a provisional catch', async () => {
  const { sound, played } = harness();
  await sound.enable();
  sound.receive(snapshot('active', 'one'));
  sound.receive(snapshot('cooldown', 'one', 'review'));
  await wait(180);
  assert.deepEqual(played, []);
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  assert.deepEqual(played, [], 'confirmation still waits for capture cleanup');
  await wait(180);
  assert.deepEqual(played, ['catch']);
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  await wait(180);
  assert.deepEqual(played, ['catch']);
  sound.dispose();
});

test('a second output is rejected, volume is bounded, and mic rounds cancel queued booms', async () => {
  const denied = harness(async () => null);
  assert.equal(await denied.sound.enable(), false);
  assert.match(denied.sound.error!, /another BAIT tab/);
  denied.sound.dispose();
  const { sound, played, volumes } = harness();
  await sound.enable();
  sound.setVolume(3);
  sound.setVolume(Number.NaN);
  assert.equal(sound.volume, 1);
  assert.equal(volumes.at(-1), 1);
  sound.receive(snapshot('active', 'one'));
  assert.equal(sound.preview('rare-catch'), false);
  sound.receive(snapshot('cooldown', 'one', 'caught'));
  sound.receive(snapshot('active', 'two'));
  await wait(180);
  assert.deepEqual(played, ['deal']);
  sound.dispose();
});

test('six procedural recipes are deterministic, finite and short; the output ceiling is bounded', () => {
  for (const cue of SOUND_CUES) {
    const recipe = recipeForCue(cue, createRng(123));
    assert.deepEqual(recipe, recipeForCue(cue, createRng(123)));
    assert.ok(voiceLength(recipe) > 0 && voiceLength(recipe) < 4, cue);
    const visit = (value: unknown): void => {
      if (typeof value === 'number') assert.ok(Number.isFinite(value), cue);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(recipe);
  }
  const curve = softClipCurve();
  assert.ok([...curve].every(value => Number.isFinite(value) && Math.abs(value) <= CEILING + 1e-7));
  for (const texture of ['rustle', 'tick', 'tinkle'] as const) {
    const channels = generateTexture(texture, 0, 8000);
    assert.ok(channels.length > 0);
    for (const channel of channels) {
      assert.ok(channel.some(value => value !== 0), texture);
      assert.ok(channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1), texture);
    }
  }
});
