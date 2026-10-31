import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceGuessSession, VOICE_GUESS_TTL_MS, type VoiceGuessContext } from '../client/voice-guess';
import type { MoonshineLine } from '../client/moonshine';

const context: VoiceGuessContext = { roundId: 'round-1', epoch: 2, leaseId: 'capture-1', takeId: 'take-1' };
let id = 0;
const final = (text: string, overrides: Partial<MoonshineLine> = {}): MoonshineLine => ({
  id: String(++id), text, isComplete: true, startTime: 0, duration: 1,
  words: text.split(/\s+/).map(text => ({ text, start: 0, end: 1, confidence: .95 })),
  isUpdated: true, isNew: true, hasTextChanged: true, haveSpeakersChanged: false,
  lastTranscriptionLatencyMs: 0, speakerSpans: [], ...overrides,
});
const session = () => { const voice = new VoiceGuessSession(); voice.setContext(context); return voice; };

test('full addressed command prepares one word and only a separate confirmation submits it', () => {
  const voice = session();
  const prepared = voice.receive(final('Baity bot: I am calling the bait, the bait is Banana.'), 100);
  assert.equal(prepared.consumed, true); assert.equal(prepared.submit, undefined);
  assert.equal(prepared.prepared?.word, 'banana');
  assert.equal(voice.snapshot(101).draft?.word, 'banana');
  const confirmed = voice.receive(final('Locked in!'), 200);
  assert.deepEqual(confirmed.submit, { word: 'banana', context, expiresAt: 100 + VOICE_GUESS_TTL_MS });
  assert.equal(voice.snapshot(201).draft, null);
  assert.equal(voice.receive(final('Lock in'), 202).submit, undefined);
});

test('split wake, call and word finals are bounded; ordinary speech keeps scoring', () => {
  const voice = session();
  assert.equal(voice.receive(final('Baity bot.'), 100).consumed, true);
  assert.equal(voice.receive(final('I am calling the bait.'), 200).consumed, true);
  assert.equal(voice.receive(final('I can see a ghost'), 300).consumed, false);
  assert.equal(voice.receive(final('The bait is ghost'), 400).prepared?.word, 'ghost');
  assert.equal(voice.receive(final('locking'), 500).submit?.word, 'ghost');
});

test('the exact Bait bot alias works without fuzzy matching ordinary speech', () => {
  const voice = session();
  assert.equal(voice.receive(final('Bait bot, the bait is banana'), 100).prepared?.word, 'banana');
  assert.equal(voice.receive(final('Baby bot, the bait is banana'), 101).consumed, false);
  assert.equal(voice.receive(final('The bait bot is helpful'), 102).consumed, false);
});

test('literal bait remains normal scoring speech outside exact command grammar', () => {
  const voice = session();
  for (const text of [
    'You will never bait me', 'I am calling the bait, the bait is banana', 'the bait is banana',
    'I told Baity bot the bait is banana', 'Baity bot the bait is banana and I saw a ghost',
    'Baity bot the bait is two words', 'Baity bot the bait is banana I think',
    'I am locking the door',
  ]) assert.equal(voice.receive(final(text), 100).consumed, false, text);
  assert.equal(voice.receive(final('Baity bot, the bait is bait.'), 101).prepared?.word, 'bait');
  assert.equal(voice.receive(final('You will never bait me.'), 102).consumed, false);
});

test('command and lock in one final creates a draft, never an immediate submission or catch', () => {
  const voice = session();
  for (const ending of ['lock in', 'locked in', 'locking in', 'I am locking in']) {
    const result = voice.receive(final(`Baity bot, the bait is bait, ${ending}`), 100);
    assert.equal(result.consumed, true); assert.equal(result.submit, undefined);
    assert.equal(result.prepared?.word, 'bait'); assert.equal(result.confirmSeparately, true);
  }
});

test('final replays cannot repost, refresh the deadline or spend a second guess', () => {
  const voice = session();
  const utterance = final('Baity bot, the bait is banana');
  voice.receive(utterance, 100);
  assert.deepEqual(voice.receive(utterance, 200), { consumed: true });
  assert.equal(voice.snapshot(201).draft?.expiresAt, 100 + VOICE_GUESS_TTL_MS);
  const locked = final('Lock in');
  assert.equal(voice.receive(locked, 300).submit?.word, 'banana');
  assert.deepEqual(voice.receive(locked, 400), { consumed: true });
});

test('stale drafts and wakes expire without auto submission', () => {
  const voice = session();
  voice.receive(final('Baity bot the bait is banana'), 100);
  assert.equal(voice.receive(final('Lock in'), 100 + VOICE_GUESS_TTL_MS).submit, undefined);
  assert.equal(voice.snapshot(100 + VOICE_GUESS_TTL_MS).draft, null);
  voice.receive(final('Baity bot'), 20_000);
  assert.equal(voice.receive(final('The bait is ghost'), 20_000 + VOICE_GUESS_TTL_MS).consumed, false);
});

test('round, epoch, capture, take or eligibility changes invalidate the pending action', () => {
  for (const next of [
    { ...context, roundId: 'round-2' }, { ...context, epoch: 3 },
    { ...context, leaseId: 'capture-2' }, { ...context, takeId: 'take-2' }, null,
  ]) {
    const voice = session(); voice.receive(final('Baity bot the bait is banana'), 100);
    voice.setContext(next);
    assert.equal(voice.receive(final('Lock in'), 200).submit, undefined);
    assert.equal(voice.snapshot(201).draft, null);
  }
});

test('disabled commands, partials and uncertain finals cannot submit guesses', () => {
  const voice = new VoiceGuessSession();
  assert.equal(voice.receive(final('Baity bot the bait is banana'), 100).consumed, false);
  voice.setContext(context);
  assert.equal(voice.receive(final('Baity bot the bait is banana', { isComplete: false }), 101).consumed, false);
  for (const confidence of [.3, Number.NaN]) {
    const result = voice.receive(final('Baity bot the bait is banana', { words: [{ text: 'banana', start: 0, end: 1, confidence }] }), 102);
    assert.equal(result.uncertain, true); assert.equal(result.prepared, undefined);
    assert.equal(voice.snapshot(103).draft, null);
  }
  voice.receive(final('Baity bot the bait is banana'), 104);
  const uncertainLock = voice.receive(final('Lock in', { words: [{ text: 'lock', start: 0, end: 1, confidence: .2 }] }), 105);
  assert.equal(uncertainLock.uncertain, true); assert.equal(uncertainLock.submit, undefined);
});

test('cancel clears the draft; a new exact command replaces it', () => {
  const voice = session();
  voice.receive(final('Baity bot the bait is banana'), 100);
  assert.equal(voice.receive(final('the bait is ghost'), 200).prepared?.word, 'ghost');
  assert.equal(voice.receive(final('Baity bot cancel'), 300).consumed, true);
  assert.equal(voice.snapshot(301).draft, null);
  assert.equal(voice.receive(final('locked in'), 302).submit, undefined);
});
