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

test('observed Baity bought transcription and short hey Baity wake support full and split commands', () => {
  for (const wake of ['Baity bought', 'Hey Baity bought', 'Hey Baity bot', 'Hey Baity', 'Baitybought']) {
    const voice = session();
    const result = voice.receive(final(`${wake}, the bait is marshmallow`), 100);
    assert.equal(result.consumed, true, wake);
    assert.equal(result.prepared?.word, 'marshmallow', wake);
    assert.equal(result.submit, undefined, wake);
    assert.equal(voice.receive(final('Lock in'), 200).submit?.word, 'marshmallow', wake);

    assert.equal(voice.receive(final(wake), 300).consumed, true, wake);
    assert.equal(voice.receive(final('The bait is ghost'), 400).prepared?.word, 'ghost', wake);
    assert.equal(voice.receive(final('Lock in'), 500).submit?.word, 'ghost', wake);
    assert.equal(voice.receive(final('Lock in'), 501).submit, undefined, wake);
  }
});

test('bought alias keeps ordinary speech scoring and does not relax confidence or expiry', () => {
  for (const text of [
    'Baity bought a banana', 'Hey Baity bought a ghost costume', 'I bought bait',
    'I heard Baity bought the bait is ghost', 'You will never bait me',
  ]) assert.equal(session().receive(final(text), 100).consumed, false, text);
  const voice = session();
  assert.deepEqual(voice.receive(final('Hey Baity bought the bait is ghost', {
    words: [{ text: 'bought', start: 0, end: 1, confidence: .3 }],
  }), 100), { consumed: true, uncertain: true });
  assert.equal(voice.receive(final('Lock in'), 200).submit, undefined);
  voice.receive(final('Hey Baity bought'), 300);
  assert.equal(voice.receive(final('The bait is ghost'), 300 + VOICE_GUESS_TTL_MS).consumed, false);
});

test('literal bait remains normal scoring speech outside exact command grammar', () => {
  const voice = session();
  for (const text of [
    'You will never bait me', 'the bait is banana',
    'I told Baity bot the bait is banana', 'Baity bot is helpful',
    'Baity bot I saw a ghost', 'I am locking the door',
  ]) assert.equal(voice.receive(final(text), 100).consumed, false, text);
  assert.equal(voice.receive(final('Baity bot, the bait is bait.'), 101).prepared?.word, 'bait');
  assert.equal(voice.receive(final('You will never bait me.'), 102).consumed, false);
});

test('explicit calling-the-bait intent opens a bounded guess without the wake phrase', () => {
  for (const prefix of ['I am calling the bait', "I'm calling the bait", 'I call the bait', 'Call the bait']) {
    const voice = session();
    assert.equal(voice.receive(final(prefix, { isComplete: false }), 100).consumed, false);
    assert.equal(voice.snapshot(101).awaitingWord, false, 'Partials do not arm commands.');
    assert.equal(voice.receive(final(prefix), 200).consumed, true, prefix);
    assert.equal(voice.snapshot(201).awaitingWord, true, prefix);
    assert.equal(voice.receive(final('The bait is banana'), 300).prepared?.word, 'banana', prefix);
    assert.equal(voice.receive(final('Lock in'), 400).submit?.word, 'banana', prefix);
    const full = voice.receive(final(`${prefix}, the bait is ghost`), 500);
    assert.equal(full.prepared?.word, 'ghost', prefix);
    assert.equal(full.submit, undefined, prefix);
  }
  const expired = session();
  expired.receive(final('I am calling the bait'), 100);
  assert.equal(expired.receive(final('The bait is ghost'), 100 + VOICE_GUESS_TTL_MS).consumed, false);
  assert.equal(new VoiceGuessSession().receive(final('I am calling the bait'), 100).consumed, false);
  for (const text of ['Yesterday I was calling the bait', 'You are calling the bait', 'I am calling my friend', 'You will never bait me']) {
    assert.equal(session().receive(final(text), 100).consumed, false, text);
  }
});

test('finite conversational lead-ins and trailing I think preserve separate lock-in', () => {
  for (const lead of ['Okay', 'Ok', 'Hey', 'Alright']) {
    const voice = session();
    const result = voice.receive(final(`${lead}, Baity bot, the bait is marshmallow, I think.`), 100);
    assert.equal(result.consumed, true, lead);
    assert.equal(result.prepared?.word, 'marshmallow', lead);
    assert.equal(result.submit, undefined);
    assert.equal(voice.receive(final('Locked in'), 200).submit?.word, 'marshmallow');
  }
  const voice = session();
  assert.equal(voice.receive(final('Yesterday I told Baity bot the bait is ghost'), 100).consumed, false);
  assert.equal(voice.receive(final('Hey Baby bot the bait is ghost'), 100).consumed, false);
});

test('a final split after the bait is consumes the next single-word final, not the command as a catch', () => {
  const voice = session();
  const prefix = final('Okay, Baity bot, the bait is');
  assert.equal(voice.receive(prefix, 100).consumed, true);
  assert.equal(voice.snapshot(101).awaitingWord, true);
  assert.deepEqual(voice.receive(prefix, 200), { consumed: true });
  assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
  const word = final('Marshmallow.');
  const prepared = voice.receive(word, 300);
  assert.equal(prepared.prepared?.word, 'marshmallow');
  assert.equal(prepared.submit, undefined);
  assert.deepEqual(voice.receive(word, 400), { consumed: true });
  assert.equal(voice.snapshot(401).draft?.expiresAt, 300 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('lock in'), 500).submit?.word, 'marshmallow');
});

test('finite earlier command splits preserve the guess and the original continuation deadline', () => {
  for (const [prefix, continuation] of [
    ['Baity bot the bait', 'is marshmallow'],
    ['Baity bot the', 'bait is marshmallow'],
  ]) {
    const voice = session();
    assert.equal(voice.receive(final(prefix), 100).consumed, true);
    const draft = voice.receive(final(continuation), 200);
    assert.equal(draft.prepared?.word, 'marshmallow');
    assert.equal(draft.submit, undefined);
    assert.equal(voice.receive(final('lock in'), 300).submit?.word, 'marshmallow');
  }
  const voice = session();
  assert.equal(voice.receive(final('Baity bot the'), 100).consumed, true);
  assert.equal(voice.receive(final('bait'), 200).consumed, true);
  assert.equal(voice.receive(final('is'), 300).consumed, true);
  assert.equal(voice.snapshot(301).expiresAt, 100 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('marshmallow'), 100 + VOICE_GUESS_TTL_MS).consumed, false);
});

test('ordinary or malformed earlier-prefix continuation cannot retain an old guessing state', () => {
  for (const prefix of ['Baity bot the', 'Baity bot the bait']) {
    const voice = session();
    voice.receive(final(prefix), 100);
    assert.equal(voice.receive(final('You will never bait me'), 200).consumed, false);
    assert.equal(voice.snapshot(201).awaitingWord, false);
    assert.equal(voice.receive(final('is ghost'), 300).consumed, false);
  }
  const voice = session();
  voice.receive(final('Baity bot the bait'), 100);
  assert.deepEqual(voice.receive(final('is two words'), 200), { consumed: true, uncertain: true });
  assert.equal(voice.snapshot(201).awaitingWord, false);
  assert.equal(voice.receive(final('ghost'), 300).consumed, false);
});

test('a bare-word continuation needs the explicit unfinished guess, confidence and a live deadline', () => {
  const wakeOnly = session();
  wakeOnly.receive(final('Baity bot'), 100);
  assert.equal(wakeOnly.receive(final('Ghost'), 200).consumed, false);
  const voice = session();
  voice.receive(final('Baity bot the bait is'), 100);
  const uncertain = voice.receive(final('Ghost', { words: [{ text: 'ghost', start: 0, end: 1, confidence: .3 }] }), 200);
  assert.equal(uncertain.consumed, true);
  assert.equal(uncertain.uncertain, true);
  assert.equal(uncertain.prepared, undefined);
  assert.equal(voice.snapshot(201).awaitingWord, false);
  voice.receive(final('Baity bot the bait is'), 300);
  assert.equal(voice.receive(final('Ghost'), 300 + VOICE_GUESS_TTL_MS).consumed, false);
  voice.receive(final('Baity bot the bait is'), 20_000);
  voice.setContext({ ...context, epoch: 3 });
  assert.equal(voice.receive(final('Ghost'), 20_001).consumed, false);
});

test('ordinary speech interrupts a bare-word continuation and still reaches scoring', () => {
  const voice = session();
  voice.receive(final('Baity bot the bait is'), 100);
  assert.equal(voice.receive(final('You will never bait me'), 200).consumed, false);
  assert.equal(voice.snapshot(201).awaitingWord, false);
  assert.equal(voice.receive(final('Ghost'), 300).consumed, false);
});

test('unmistakable malformed commands request a retry without becoming a catch or retaining an old draft', () => {
  for (const text of [
    'Baity bot the bait is two words',
    'Baity bot the bait is banana and I saw a ghost',
    'Hey Baity bot I am calling the bait but I cannot remember it',
  ]) {
    const voice = session();
    voice.receive(final('Baity bot the bait is banana'), 100);
    const malformed = final(text);
    assert.deepEqual(voice.receive(malformed, 200), { consumed: true, uncertain: true }, text);
    assert.equal(voice.snapshot(201).draft, null);
    assert.equal(voice.receive(final('Lock in'), 300).submit, undefined);
    assert.deepEqual(voice.receive(malformed, 400), { consumed: true });
  }
});

test('an addressed unrecognized request clears an older draft without suppressing ordinary scoring', () => {
  const voice = session();
  voice.receive(final('Baity bot the bait is banana'), 100);
  assert.equal(voice.receive(final('Baity bot the word is marshmallow'), 200).consumed, false);
  assert.equal(voice.snapshot(201).draft, null);
  assert.equal(voice.receive(final('lock in'), 300).submit, undefined);
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
