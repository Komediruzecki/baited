import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchVoiceGuess, VoiceGuessSession, VOICE_GUESS_TTL_MS } from '../client/voice-guess';
import type { MoonshineLine } from '../client/moonshine';

const context = { roundId: 'round', epoch: 1, leaseId: 'lease', takeId: 'take' };
let nextId = 0;
const final = (text: string): MoonshineLine => ({
  id: `fast-${++nextId}`, text, isComplete: true, startTime: 0, duration: 1,
  words: text.split(/\s+/).map(text => ({ text, start: 0, end: 1, confidence: 1 })),
  isUpdated: true, isNew: true, hasTextChanged: true, haveSpeakersChanged: false,
  lastTranscriptionLatencyMs: 0, speakerSpans: [],
});
const session = () => { const voice = new VoiceGuessSession(); voice.setContext(context); return voice; };

test('fast explicit call, guess and lock submit once in one completed final', () => {
  for (const lead of ['', 'Okay, ', 'So, ', 'Um, ', 'Okay, so, ']) {
    const voice = session();
    const line = final(`${lead}I am calling the bait, fish, lock in.`);
    const result = voice.receive(line, 100);
    assert.equal(result.consumed, true, lead);
    assert.equal(result.prepared?.word, 'fish', lead);
    assert.equal(result.submit?.word, 'fish', lead);
    assert.equal(voice.snapshot(101).draft, null);
    assert.deepEqual(voice.receive(line, 102), { consumed: true });
  }
});

test('completed intent with finite lead-ins is consumed before a BAIT catch', () => {
  for (const text of ['I am calling the bait', 'Okay I am calling the bait',
    'So I am calling the bait', 'Um I am calling the bait', 'Okay so I am calling the bait']) {
    const voice = session();
    assert.equal(voice.receive(final(text), 100).consumed, true, text);
    assert.equal(voice.snapshot(101).acceptsBareGuess, true, text);
  }
});

test('Baity bot and bought may split at every final boundary without exposing BAIT', () => {
  for (const wake of ['Baity bot', 'Baity bought']) {
    const tokens = `${wake} I am calling the bait fish lock in`.split(' ');
    for (let mask = 0; mask < 2 ** (tokens.length - 1); mask++) {
      const parts = [tokens[0]];
      for (let i = 1; i < tokens.length; i++) {
        if (mask & (1 << (i - 1))) parts.push(tokens[i]);
        else parts[parts.length - 1] += ` ${tokens[i]}`;
      }
      const voice = session();
      const results = parts.map((text, index) => voice.receive(final(text), 100 + index));
      assert.ok(results.every(result => result.consumed), parts.join(' / '));
      assert.deepEqual(results.flatMap(result => result.submit ? [result.submit.word] : []), ['fish'], parts.join(' / '));
    }
  }
});

test('wake suffix is finite and cannot renew expiry, arm a bare word or swallow ordinary speech', () => {
  for (const suffix of ['bot', 'bought']) {
    const voice = session();
    voice.receive(final('Baity'), 100);
    assert.equal(voice.receive(final(suffix), 200).consumed, true);
    assert.equal(voice.snapshot(201).expiresAt, 100 + VOICE_GUESS_TTL_MS);
    assert.equal(voice.snapshot(201).acceptsBareGuess, false);
    assert.equal(voice.receive(final('bait'), 202).consumed, false);
    for (const ending of ['ordinary', 'cancel', 'context', 'expiry']) {
      const interrupted = session(); interrupted.receive(final('Baity'), 100);
      if (ending === 'ordinary') assert.equal(interrupted.receive(final('you will never bait me'), 101).consumed, false);
      if (ending === 'cancel') interrupted.receive(final('cancel'), 101);
      if (ending === 'context') interrupted.setContext({ ...context, epoch: 2 });
      assert.equal(interrupted.receive(final(`${suffix} I am calling the bait fish lock in`),
        ending === 'expiry' ? 100 + VOICE_GUESS_TTL_MS : 102).consumed, false, ending);
    }
    const ordinary = session(); ordinary.receive(final('Baity'), 100);
    assert.equal(ordinary.receive(final(`${suffix} will never bait me`), 101).consumed, false);
  }
});

test('calling intent and lock can cross final boundaries without scoring their bait token', () => {
  for (const parts of [
    ['I am calling the', 'bait', 'fish lock in'],
    ['Okay I am calling', 'the', 'bait fish', 'lock', 'in'],
    ['I am', 'calling the', 'bait', 'fish', 'lock in'],
    ['I am calling the bait fish lock', 'in'],
    ['I am calling the bait fish', 'I am', 'locking in'],
    ['I am calling the bait fish I am', 'locking in'],
  ]) {
    const voice = session();
    const results = parts.map((text, index) => voice.receive(final(text), 100 + index));
    assert.ok(results.every(result => result.consumed), parts.join(' / '));
    assert.equal(results.filter(result => result.submit).length, 1, parts.join(' / '));
    assert.equal(results.at(-1)?.submit?.word, 'fish', parts.join(' / '));
  }
});

test('reported, negated, hypothetical and ordinary bait speech never opens a fast command', () => {
  for (const text of [
    'He said I am calling the bait fish lock in',
    "Don't say I am calling the bait fish lock in",
    'If I am calling the bait fish lock in',
    'I am not calling the bait',
    'You will never bait me',
    'Okay so you will never bait me',
  ]) assert.equal(session().receive(final(text), 100).consumed, false, text);
});

test('split intent expires and ordinary speech, cancellation and context changes discard it', () => {
  for (const ending of ['expiry', 'ordinary', 'cancel', 'context']) {
    const voice = session();
    assert.equal(voice.receive(final('I am calling the'), 100).consumed, true);
    if (ending === 'expiry') voice.expire(100 + VOICE_GUESS_TTL_MS);
    if (ending === 'ordinary') assert.equal(voice.receive(final('You will never bait me'), 101).consumed, false);
    if (ending === 'cancel') voice.receive(final('cancel'), 101);
    if (ending === 'context') voice.setContext({ ...context, epoch: 2 });
    assert.equal(voice.receive(final('bait'), ending === 'expiry' ? 100 + VOICE_GUESS_TTL_MS + 1 : 102).consumed, false, ending);
  }
});

test('split prefixes cannot extend their deadline or survive negation', () => {
  const voice = session();
  voice.receive(final('I am'), 100);
  assert.equal(voice.receive(final('not calling the bait'), 101).consumed, false);
  assert.equal(voice.snapshot(102).awaitingWord, false);
  voice.receive(final('I am'), 200);
  voice.receive(final('calling the'), 300);
  voice.receive(final('bait'), 400);
  assert.equal(voice.snapshot(401).expiresAt, 200 + VOICE_GUESS_TTL_MS);
  assert.equal(voice.receive(final('fish lock in'), 200 + VOICE_GUESS_TTL_MS).consumed, false);
});

test('combined lock still needs eligible context, finality and reliable word metadata', () => {
  const command = final('I am calling the bait fish lock in');
  const disabled = new VoiceGuessSession();
  assert.equal(disabled.receive(command, 100).consumed, false);
  const voice = session();
  assert.equal(voice.receive({ ...command, isComplete: false }, 100).consumed, false);
  const uncertain = voice.receive({ ...command, words: command.words.map(word => ({ ...word, confidence: .2 })) }, 101);
  assert.equal(uncertain.consumed, true);
  assert.equal(uncertain.uncertain, true);
  assert.equal(uncertain.submit, undefined);
  assert.equal(uncertain.prepared, undefined);
  assert.equal(voice.snapshot(102).expiresAt, 101 + VOICE_GUESS_TTL_MS);
});

test('a combined final submits once and skips the intermediate public draft', async () => {
  const voice = session(), calls: string[] = [];
  let releaseSubmit!: () => void;
  let busy = false;
  const submitDone = new Promise<void>(resolve => { releaseSubmit = resolve; });
  const dispatch = (line: MoonshineLine) => dispatchVoiceGuess(voice.receive(line, 100), {
    busy,
    share: async draft => { calls.push(`share:${draft.word}`); },
    submit: async draft => { busy = true; calls.push(`submit:${draft.word}`); await submitDone; busy = false; },
  });
  const command = final('I am calling the bait fish lock in');
  assert.equal(dispatch(command), true);
  assert.deepEqual(calls, ['submit:fish'], 'Immediate lock-in cannot queue optional bot work ahead of scoring.');
  assert.equal(dispatch(command), false);
  assert.equal(dispatch(final(command.text)), false);
  assert.deepEqual(calls, ['submit:fish']);
  voice.setContext({ ...context, epoch: 2 });
  releaseSubmit(); await submitDone;
  assert.equal(voice.snapshot(101).draft, null, 'A completed old request cannot restore a stale draft.');
  voice.setContext(null);
  dispatch(final(command.text));
  assert.deepEqual(calls, ['submit:fish'], 'Ineligible commands cannot create requests.');
});

test('a reviewed guess still requests its public draft and a rejected post never retries scoring', async () => {
  const voice = session(), calls: string[] = [];
  let rejectShare!: (error: Error) => void;
  const bot = new Promise<void>((_resolve, reject) => { rejectShare = reject; });
  let shared!: Promise<void>;
  const command = final('I am calling the bait fish');
  const actions = {
    busy: false,
    share: () => shared = bot.catch(() => { calls.push('share unavailable'); }),
    submit: async () => { calls.push('submit'); },
  };
  dispatchVoiceGuess(voice.receive(command, 100), actions);
  assert.deepEqual(calls, []);
  rejectShare(new Error('Draft unavailable after the scoring request won the race'));
  await shared;
  dispatchVoiceGuess(voice.receive(final('lock in'), 101), actions);
  dispatchVoiceGuess(voice.receive(command, 101), actions);
  assert.deepEqual(calls, ['share unavailable', 'submit'], 'A failed optional post never retries the guess or replays its final.');
});

test('busy dispatch preserves split recognition and clearing at request completion discards ignored drafts', () => {
  const voice = session(), calls: string[] = [];
  const actions = { busy: true,
    share: async () => { calls.push('share'); }, submit: async () => { calls.push('submit'); } };
  for (const text of ['Baity', 'bot I am calling the', 'bait fish lock', 'in']) {
    const result = voice.receive(final(text), 100);
    assert.equal(result.consumed, true, text);
    assert.equal(dispatchVoiceGuess(result, actions), false);
  }
  const ignored = voice.receive(final('I am calling the bait ghost'), 101);
  assert.equal(dispatchVoiceGuess(ignored, actions), false);
  assert.equal(voice.snapshot(102).draft?.word, 'ghost');
  voice.clear(); // Matching Studio's same-context request-finally cleanup.
  actions.busy = false;
  dispatchVoiceGuess(voice.receive(final('lock in'), 103), actions);
  assert.deepEqual(calls, [], 'A draft spoken while busy cannot become a delayed second guess.');
});
