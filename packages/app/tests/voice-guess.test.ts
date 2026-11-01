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
  assert.equal(voice.receive(final('The bait is ghost'), 400).consumed, false, 'Ordinary conversation ends the bare-guess window.');
  assert.equal(voice.receive(final('Baity bot, the bait is ghost'), 401).prepared?.word, 'ghost');
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

test('a bare-word continuation needs explicit intent, confidence and a live deadline', () => {
  const wakeOnly = session();
  wakeOnly.receive(final('Baity bot'), 100);
  assert.equal(wakeOnly.receive(final('Ghost'), 200).consumed, false);
  const voice = session();
  voice.receive(final('Baity bot the bait is'), 100);
  const uncertain = voice.receive(final('Ghost', { words: [{ text: 'ghost', start: 0, end: 1, confidence: .3 }] }), 200);
  assert.equal(uncertain.consumed, true);
  assert.equal(uncertain.uncertain, true);
  assert.equal(uncertain.prepared, undefined);
  assert.equal(voice.snapshot(201).awaitingWord, true, 'An uncertain guess keeps the existing retry window.');
  assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
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


test('recorded calling-intent finals protect the next bare guess across phrase boundaries', () => {
  for (const sequence of [
    ['Hey, baby, bro.', "I'm calling the bake.", 'Banana,'],
    ['Hail, Betty, but.', "I'm calling the bait.", 'Banana.'],
    ['Hey, baity,', "I'm calling the bait.", 'Banana,'],
    ["Hey, baby, I'm calling the bait.", 'Bait.'],
  ]) {
    const voice = session();
    sequence.slice(0, -1).forEach((text, n) => voice.receive(final(text), 100 + n * 1000));
    const result = voice.receive(final(sequence.at(-1)!), 4100);
    assert.equal(result.consumed, true, sequence.join(' / '));
    assert.equal(result.prepared?.word, sequence.at(-1)!.toLowerCase().replace(/[,\.]/g, ''));
    assert.equal(result.submit, undefined);
    assert.equal(voice.receive(final('Lock in.'), 5100).submit?.word, result.prepared?.word);
  }
});

test('calling-intent bare guesses preserve punctuation, replay, expiry and eligibility boundaries', () => {
  const voice = session();
  const call = final("I'm calling the bait.");
  voice.receive(call, 100);
  voice.receive(final('.'), 200);
  assert.equal(voice.snapshot(201).awaitingWord, true);
  assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
  const word = final('Banana.');
  assert.equal(voice.receive(word, 300).prepared?.word, 'banana');
  assert.deepEqual(voice.receive(word, 400), { consumed: true });
  assert.deepEqual(voice.receive(call, 500), { consumed: true });
  assert.equal(voice.snapshot(501).draft?.word, 'banana');
  const lock = final('Locked in.');
  assert.equal(voice.receive(lock, 600).submit?.word, 'banana');
  assert.deepEqual(voice.receive(lock, 700), { consumed: true });
  assert.equal(voice.receive(final('Banana.'), 800).consumed, false);
  voice.receive(final("I'm calling the bait"), 900);
  assert.equal(voice.receive(final('Banana'), 900 + VOICE_GUESS_TTL_MS).consumed, false);
  voice.receive(final("I'm calling the bait"), 20_000);
  voice.setContext({ ...context, takeId: 'take-2' });
  assert.equal(voice.receive(final('Banana'), 20_100).consumed, false);
});

test('punctuation does not cancel an unfinished explicit guess or extend its deadline', () => {
  const voice = session();
  voice.receive(final('Baity bot the bait is'), 100);
  voice.receive(final('.'), 200);
  assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('Ghost'), 300).prepared?.word, 'ghost');
});

test('uncertain calling intent keeps a bounded retry window without submitting a guess', () => {
  const voice = session();
  const weak = { words: [{ text: 'calling', start: 0, end: 1, confidence: .3 }] };
  assert.deepEqual(voice.receive(final("I'm calling the bait", weak), 100), { consumed: true, uncertain: true });
  assert.equal(voice.snapshot(101).awaitingWord, true);
  assert.deepEqual(voice.receive(final('Banana', weak), 200), { consumed: true, uncertain: true });
  assert.equal(voice.snapshot(201).draft, null);
  assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('Lock in'), 300).submit, undefined);
  assert.equal(voice.receive(final('Banana'), 400).prepared?.word, 'banana');
  assert.equal(voice.receive(final('Lock in'), 500).submit?.word, 'banana');
});

test('bare-guess protection ends on ordinary conversation and does not recognize vague near matches', () => {
  const voice = session();
  voice.receive(final("I'm calling the bait"), 100);
  assert.equal(voice.receive(final('You will never bait me'), 200).consumed, false);
  assert.equal(voice.receive(final('Banana'), 300).consumed, false);
  for (const text of ['Hey baby I see a ghost', 'Hail Betty but there is a ghost',
    "I'm calling the bakery", 'I was calling the bake', 'Someone is calling the bait']) {
    assert.equal(session().receive(final(text), 100).consumed, false, text);
  }
});


test('recorded ah bait but alias consumes explicit calling intent before a separate bare word', () => {
  const voice = session();
  const invocation = final("Ah, bait, but I'm calling the bait.");
  assert.equal(voice.receive(invocation, 100).consumed, true,
    'The invocation itself must not become catch evidence when bait is the target.');
  assert.equal(voice.snapshot(101).awaitingWord, true);
  const word = final('Banana.');
  const prepared = voice.receive(word, 1100);
  assert.equal(prepared.consumed, true);
  assert.equal(prepared.prepared?.word, 'banana');
  assert.equal(prepared.submit, undefined);
  assert.deepEqual(voice.receive(word, 1200), { consumed: true });
  const lock = final('Lock in.');
  assert.equal(voice.receive(lock, 2100).submit?.word, 'banana');
  assert.deepEqual(voice.receive(lock, 2200), { consumed: true });
});

test('recorded ah bait but alias stays anchored and requires immediate calling intent', () => {
  for (const text of [
    'Ah bait but I saw a ghost',
    "Yesterday ah bait but I'm calling the bait",
    "Ah bait but yesterday I'm calling the bait",
    "Ah bait but I'm calling the bakery",
  ]) assert.equal(session().receive(final(text), 100).consumed, false, text);
});


test('finite hesitations between intent and target score normally without drafting or renewing the window', () => {
  for (const filler of ['Uh.', 'Um.', 'Ah.', 'Er.', 'Hmm.', 'Okay.', 'Ok.', 'So.', 'Well.']) {
    const voice = session();
    voice.receive(final("I'm calling the bait"), 100);
    assert.equal(voice.receive(final(filler), 200).consumed, false, filler);
    assert.equal(voice.snapshot(201).draft, null, filler);
    assert.equal(voice.snapshot(201).acceptsBareGuess, true, filler);
    assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS, filler);
    assert.equal(voice.receive(final('Banana'), 300).prepared?.word, 'banana', filler);
    assert.equal(voice.receive(final('Lock in'), 400).submit?.word, 'banana', filler);
  }
});

test('one finite hesitation before a single target is accepted only after explicit intent', () => {
  for (const text of ['Um, banana.', 'Uh banana', 'Okay, banana']) {
    const voice = session();
    assert.equal(voice.receive(final(text), 100).consumed, false);
    voice.receive(final('Hey Baity'), 200);
    assert.equal(voice.receive(final(text), 300).consumed, false, 'Wake-only is not permission to dictate a word.');
    voice.receive(final("I'm calling the bait"), 400);
    assert.equal(voice.receive(final(text), 500).prepared?.word, 'banana', text);
  }
  const voice = session();
  voice.receive(final("I'm calling the bait"), 100);
  assert.equal(voice.receive(final('Um I saw a banana'), 200).consumed, false);
  assert.equal(voice.snapshot(201).acceptsBareGuess, false);
});

test('calling intent with now or right now arms a guess instead of drafting the adverb', () => {
  for (const intent of ["I'm calling the bait now", "I'm calling the bait right now", 'I call the bait right now']) {
    const voice = session();
    assert.equal(voice.receive(final(intent), 100).consumed, true);
    assert.equal(voice.snapshot(101).draft, null);
    assert.equal(voice.snapshot(101).acceptsBareGuess, true);
    assert.equal(voice.receive(final('Banana'), 200).prepared?.word, 'banana');
  }
  assert.equal(session().receive(final("I'm calling the bait banana"), 100).prepared?.word, 'banana',
    'A valid target in the same final remains supported.');
});

test('wake-only is distinct from explicit intent and repeated wakes preserve intent, draft and deadline', () => {
  const voice = session();
  voice.receive(final('Hey Baity'), 100);
  assert.equal(voice.snapshot(101).awaitingWord, true);
  assert.equal(voice.snapshot(101).acceptsBareGuess, false);
  assert.equal(voice.receive(final('Banana'), 200).consumed, false);
  voice.receive(final("I'm calling the bait"), 300);
  for (const [n, text] of ['Hey Baity', '.', 'The', 'Hey Baity', 'The bait'].entries()) {
    voice.receive(final(text), 400 + n * 100);
    assert.equal(voice.snapshot(401 + n * 100).acceptsBareGuess, true, text);
    assert.equal(voice.snapshot(401 + n * 100).expiresAt, 300 + VOICE_GUESS_TTL_MS, text);
  }
  const result = voice.receive(final('Bait'), 1000);
  assert.equal(result.prepared?.word, 'bait');
  assert.equal(voice.snapshot(1001).acceptsBareGuess, false);
  voice.receive(final('Hey Baity'), 1100);
  assert.equal(voice.snapshot(1101).draft?.word, 'bait');
  assert.equal(voice.snapshot(1101).expiresAt, 1000 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('Lock in'), 1200).submit?.word, 'bait');
});

test('ordinary speech, cancel, expiry and context changes clear bare-guess permission', () => {
  for (const ending of ['ordinary', 'cancel', 'expiry', 'context']) {
    const voice = session();
    voice.receive(final("I'm calling the bait"), 100);
    if (ending === 'ordinary') assert.equal(voice.receive(final('I see a ghost'), 200).consumed, false);
    if (ending === 'cancel') voice.receive(final('cancel'), 200);
    if (ending === 'expiry') voice.expire(100 + VOICE_GUESS_TTL_MS);
    if (ending === 'context') voice.setContext(null);
    assert.equal(voice.snapshot(201).acceptsBareGuess, false, ending);
    assert.equal(voice.receive(final('Banana'), 300).consumed, false, ending);
  }
});


test('up to three filler-only finals preserve the original intent deadline, while longer speech clears it', () => {
  for (const filler of ['Okay, so.', 'Uh, okay.', 'Um, okay, so.']) {
    const voice = session();
    voice.receive(final("I'm calling the bait"), 100);
    assert.equal(voice.receive(final(filler), 200).consumed, false, filler);
    assert.equal(voice.snapshot(201).draft, null);
    assert.equal(voice.snapshot(201).acceptsBareGuess, true, filler);
    assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
    assert.equal(voice.receive(final('Banana'), 300).prepared?.word, 'banana');
    assert.equal(voice.receive(final('Lock in'), 400).submit?.word, 'banana');
  }
  const voice = session();
  voice.receive(final("I'm calling the bait"), 100);
  assert.equal(voice.receive(final('Um okay so well'), 200).consumed, false);
  assert.equal(voice.snapshot(201).acceptsBareGuess, false);
  assert.equal(voice.receive(final('Banana'), 300).consumed, false);
});

test('up to two leading fillers are stripped only before one armed guess, not a narrative', () => {
  for (const text of ['Uh, okay, banana.', 'Okay, so, banana.']) {
    const voice = session();
    assert.equal(voice.receive(final(text), 100).consumed, false);
    voice.receive(final('Hey Baity'), 200);
    assert.equal(voice.receive(final(text), 300).consumed, false);
    voice.receive(final("I'm calling the bait"), 400);
    assert.equal(voice.receive(final(text), 500).prepared?.word, 'banana', text);
    assert.equal(voice.receive(final('Lock in'), 600).submit?.word, 'banana');
  }
  for (const text of ['Um okay so banana', 'Okay so I saw a banana', 'Okay so banana is yellow']) {
    const voice = session(); voice.receive(final("I'm calling the bait"), 100);
    assert.equal(voice.receive(final(text), 200).consumed, false, text);
    assert.equal(voice.snapshot(201).acceptsBareGuess, false);
  }
});

test('finite clipped and explicit call aliases arm a guess without matching narratives', () => {
  for (const intent of ['Calling the bait', "I'll call the bait", 'I’ll call the bait',
    'Im calling the bait', 'I will call the bait', 'Hey Baity calling the bait',
    "Ah bait but I'll call the bait"]) {
    const voice = session();
    assert.equal(voice.receive(final(intent, { isComplete: false }), 100).consumed, false);
    assert.equal(voice.receive(final(intent), 200).consumed, true, intent);
    assert.equal(voice.snapshot(201).acceptsBareGuess, true, intent);
    assert.equal(voice.receive(final('Bait'), 300).prepared?.word, 'bait', intent);
    assert.equal(voice.receive(final('Lock in'), 400).submit?.word, 'bait', intent);
    const expired = session(); expired.receive(final(intent), 100);
    assert.equal(expired.receive(final('Banana'), 100 + VOICE_GUESS_TTL_MS).consumed, false);
    assert.equal(new VoiceGuessSession().receive(final(intent), 100).consumed, false);
  }
  for (const text of ['I was calling the bait', 'Someone is calling the bait', 'I might call the bait',
    "Yesterday I'll call the bait", 'Calling my friend', 'Im calling the bakery',
    'Hey baby calling a friend', 'Ah bait but I might call the bait']) {
    assert.equal(session().receive(final(text), 100).consumed, false, text);
  }
});

test('it is or its contraction can introduce one word only after explicit intent', () => {
  for (const text of ["It's banana", 'It’s banana', 'It is banana', "It's banana lock in"]) {
    const voice = session();
    assert.equal(voice.receive(final(text), 100).consumed, false);
    voice.receive(final('Hey Baity'), 200);
    assert.equal(voice.receive(final(text), 300).consumed, false, 'Wake alone does not arm a guess.');
    voice.receive(final("I'm calling the bait"), 400);
    const result = voice.receive(final(text), 500);
    assert.equal(result.prepared?.word, 'banana', text);
    assert.equal(result.submit, undefined);
    assert.equal(voice.receive(final('Lock in'), 600).submit?.word, 'banana');
  }
  for (const text of ["It's a banana", 'It is banana bread', 'It was banana', "It's banana and ghost"]) {
    const voice = session(); voice.receive(final("I'm calling the bait"), 100);
    assert.equal(voice.receive(final(text), 200).consumed, false, text);
    assert.equal(voice.snapshot(201).acceptsBareGuess, false);
  }
});

test('scheduled expiry clamps an early callback and does not announce wake-only expiration or clear newer state', () => {
  const voice = session();
  voice.receive(final("I'm calling the bait"), 100);
  const deadline = voice.snapshot(101).expiresAt;
  assert.equal(voice.expireScheduled(deadline, deadline - 1), true);
  assert.equal(voice.snapshot(deadline - 1).awaitingWord, false);
  assert.equal(voice.receive(final('Banana'), deadline).consumed, false);
  voice.receive(final('Hey Baity'), 20_000);
  assert.equal(voice.expireScheduled(20_000 + VOICE_GUESS_TTL_MS, 20_001), false,
    'Wake-only expiry is silent.');
  assert.equal(voice.snapshot(20_001).awaitingWord, false);
  voice.receive(final("I'm calling the bait"), 40_000);
  const oldDeadline = voice.snapshot(40_001).expiresAt;
  voice.receive(final('Banana'), 40_100);
  assert.equal(voice.expireScheduled(oldDeadline, oldDeadline), false,
    'A stale timer cannot clear a later draft.');
  const draftDeadline = voice.snapshot(oldDeadline).expiresAt;
  assert.equal(voice.snapshot(oldDeadline).draft?.word, 'banana');
  assert.equal(voice.expireScheduled(draftDeadline, draftDeadline - 1), true);
  assert.equal(voice.snapshot(draftDeadline - 1).draft, null);
  assert.equal(voice.receive(final('Lock in'), draftDeadline).submit, undefined);
  assert.equal(voice.expireScheduled(0, draftDeadline), false);
});
