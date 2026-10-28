import assert from 'node:assert/strict';
import test from 'node:test';
import { PronunciationTake } from '../client/card-pronunciation-model';
import type { MoonshineLine } from '../client/moonshine';

const line = (text: string, complete = true): MoonshineLine => ({
  id: '1', text, isComplete: complete, startTime: 0, duration: 1,
  isUpdated: false, isNew: true, hasTextChanged: true, haveSpeakersChanged: false,
  lastTranscriptionLatencyMs: 25, speakerSpans: [],
  words: [{ text, start: 0, end: 1, confidence: 1 }],
});

test('interim target corrected out of the final transcript is not a successful rehearsal', () => {
  const take = new PronunciationTake();
  assert.equal(take.hears(line('a donut', false), 'donut', []), false);
  assert.equal(take.hears(line('a doormat'), 'donut', []), false);
  assert.equal(take.hears(line('I ate a doughnut'), 'donut', []), true);
});
test('rehearsal ignores untimed, empty and invalid speech evidence like live recognition', () => {
  const take = new PronunciationTake();
  for (const incomplete of [
    { ...line('trombone'), words: [] }, { ...line('trombone'), duration: 0 },
    { ...line('trombone'), startTime: -1 }, { ...line('trombone'), duration: NaN }, line(''),
  ]) assert.equal(take.hears(incomplete, 'trombone', []), false);
  assert.equal(take.hears(line('trombones'), 'trombone', []), false);
  assert.equal(take.hears(line('trombone'), 'trombone', []), true);
});
