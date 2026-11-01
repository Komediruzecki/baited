import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameView } from '../shared/types';
import { VoiceGuessContextGate, voiceGuessActionContext, type VoiceGuessEligibility } from '../client/voice-guess-context';
import { VoiceGuessSession } from '../client/voice-guess';

const active = (): VoiceGuessEligibility => ({
  room: { phase: 'active', round: { id: 'round', epoch: 1, endsAt: 10_000, settleUntil: null,
    guessEnabled: true, guessUsed: false } } as GameView,
  serverNow: 9_500, leaseId: 'lease', enabled: true, microphoneEnabled: true,
  leaseActive: true, offline: false, recovering: false, manualGuess: false,
});
const settling = (input: VoiceGuessEligibility): VoiceGuessEligibility => ({ ...input, serverNow: 10_100,
  room: { ...input.room!, phase: 'settling', round: { ...input.room!.round!, settleUntil: 11_500 } } });

test('settling retains only previously eligible capture context, never action permission', () => {
  const gate = new VoiceGuessContextGate(), live = active(), drain = settling(live);
  assert.equal(gate.update(drain).context, null, 'A late opt-in cannot acquire a drain context.');
  const context = gate.update(live).context;
  assert.ok(context);
  assert.deepEqual(gate.update(drain), { context, canAct: false });
  assert.equal(voiceGuessActionContext(drain), null);
  assert.equal(voiceGuessActionContext({ ...live, serverNow: 10_000 }), null, 'The exact buzzer is already too late to submit.');
  assert.deepEqual(gate.update({ ...drain, serverNow: 11_499 }), { context, canAct: false });
  assert.deepEqual(gate.update({ ...drain, serverNow: 11_500 }), { context: null, canAct: false });
  assert.equal(gate.update(drain).context, null, 'Expiry cannot be reversed by an older view.');
});

test('settling context is invalidated by controls, connection loss and every capture identity change', () => {
  const original = active(), drain = settling(original);
  const changes: Partial<VoiceGuessEligibility>[] = [
    { enabled: false }, { microphoneEnabled: false }, { leaseActive: false }, { leaseId: 'replacement' },
    { offline: true }, { recovering: true }, { manualGuess: true },
    { room: { ...drain.room!, phase: 'paused' } },
    { room: { ...drain.room!, round: { ...drain.room!.round!, guessUsed: true } } },
    { room: { ...drain.room!, round: { ...drain.room!.round!, guessEnabled: false } } },
    { room: { ...drain.room!, round: { ...drain.room!.round!, id: 'next-word' } } },
    { room: { ...drain.room!, round: { ...drain.room!.round!, epoch: 2 } } },
    { room: { ...drain.room!, round: { ...drain.room!.round!, endsAt: 12_000 } } },
    { room: { ...drain.room!, recording: { takeId: 'replacement' } as GameView['recording'] } },
  ];
  for (const change of changes) {
    const gate = new VoiceGuessContextGate(); gate.update(original);
    assert.equal(gate.update({ ...drain, ...change }).context, null, JSON.stringify(change));
    assert.equal(gate.update(drain).context, null, 'An invalidated context cannot rearm in settling.');
  }
});

test('the next active word cannot inherit a calling prefix from the previous drain', () => {
  const gate = new VoiceGuessContextGate(), voice = new VoiceGuessSession(), live = active();
  const final = (id: string, text: string) => ({ id, text, isComplete: true,
    words: text.split(' ').map(text => ({ text, start: 0, end: 1, confidence: 1 })) });
  voice.setContext(gate.update(live).context);
  assert.equal(voice.receive(final('prefix', 'I am calling the'), 9_500).consumed, true);
  voice.setContext(gate.update(settling(live)).context);
  const next = { ...live, room: { ...live.room!, round: { ...live.room!.round!, id: 'next-word', endsAt: 25_000 } }, serverNow: 12_000 };
  voice.setContext(gate.update(next).context);
  assert.equal(voice.receive(final('ordinary', 'bait'), 12_001).consumed, false);
});
