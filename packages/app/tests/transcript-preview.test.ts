import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canPreviewTranscript, TranscriptPreviewBuffer, TRANSCRIPT_PREVIEW_LIMIT, TRANSCRIPT_PREVIEW_TEXT_LIMIT } from '../client/transcript-preview';
import { TranscriptPreview } from '../client/TranscriptPreview';
import type { MoonshineLine } from '../client/moonshine';

const line = (id: string, text: string, isComplete = true) => ({ id, text, isComplete } as MoonshineLine);

test('authenticated Twitch Studio offers the transcript independently of hostname', () => {
  assert.equal(canPreviewTranscript('twitch', true), true);
  assert.equal(canPreviewTranscript('twitch', false), false);
});

test('the local demo can still show its own opt-in microphone text', () => {
  assert.equal(canPreviewTranscript('demo', false), true);
  assert.equal(canPreviewTranscript('demo', true), true);
});

test('transcript controls explain local retention and escape recognized text', () => {
  const hidden = renderToStaticMarkup(React.createElement(TranscriptPreview, {
    enabled: false, lines: [], listening: false, onToggle() {}, onClear() {},
  }));
  assert.match(hidden, /Show transcript/);
  assert.match(hidden, /aria-expanded="false"/);
  assert.doesNotMatch(hidden, /Final transcribed phrases/);
  const visible = renderToStaticMarkup(React.createElement(TranscriptPreview, {
    enabled: true, lines: [{ id: 'one', text: '<script>speech</script>', receivedAt: 1000, truncated: false }],
    listening: true, onToggle() {}, onClear() {},
  }));
  assert.match(visible, /Hide transcript/);
  assert.match(visible, /kept only in this tab/);
  assert.match(visible, /&lt;script&gt;speech&lt;\/script&gt;/);
  assert.doesNotMatch(visible, /<script>/);
});

test('transcript preview ignores speech until opted in and hiding erases its buffer', () => {
  const preview = new TranscriptPreviewBuffer();
  assert.equal(preview.receive(line('1', 'not collected'), 'round:1'), null);
  assert.deepEqual(preview.setEnabled(true), []);
  assert.equal(preview.receive(line('2', 'actual words'), 'round:1')?.[0].text, 'actual words');
  assert.deepEqual(preview.setEnabled(false), []);
  assert.equal(preview.receive(line('3', 'not collected either'), 'round:1'), null);
  assert.deepEqual(preview.setEnabled(true), []);
  assert.equal(preview.receive(line('4', 'new opt-in'), 'round:1')?.length, 1);
});

test('preview preserves final text, ignores partials/empty speech and isolates stream IDs', () => {
  const preview = new TranscriptPreviewBuffer(); preview.setEnabled(true);
  assert.equal(preview.receive(line('1', 'a guess', false), 'round:1'), null);
  assert.equal(preview.receive(line('1', '   '), 'round:1'), null);
  assert.equal(preview.receive(line('1', '  Actual words.  '), 'round:1', 100)?.[0].text, '  Actual words.  ');
  const repeated = preview.receive(line('1', 'Corrected final.'), 'round:1', 120)!;
  assert.equal(repeated.length, 1); assert.equal(repeated[0].receivedAt, 120);
  assert.equal(preview.receive(line('1', 'Next segment.'), 'round:2')?.length, 2);
  assert.deepEqual(preview.clear(), []);
  assert.equal(preview.receive(line('2', 'Still opted in.'), 'round:2')?.length, 1);
});

test('preview caps retained phrases and text without retaining the full source line', () => {
  const preview = new TranscriptPreviewBuffer(); preview.setEnabled(true);
  let lines: ReturnType<TranscriptPreviewBuffer['receive']> = null;
  for (let i = 0; i < TRANSCRIPT_PREVIEW_LIMIT + 5; i++)
    lines = preview.receive(line(String(i), `phrase ${i}`), 'round:1');
  assert.equal(lines?.length, TRANSCRIPT_PREVIEW_LIMIT);
  assert.equal(lines?.[0].text, 'phrase 5');
  const long = preview.receive(line('long', 'x'.repeat(TRANSCRIPT_PREVIEW_TEXT_LIMIT + 1)), 'round:1')!.at(-1)!;
  assert.equal(long.text.length, TRANSCRIPT_PREVIEW_TEXT_LIMIT);
  assert.equal(long.truncated, true);
  assert.deepEqual(Object.keys(long).sort(), ['id', 'receivedAt', 'text', 'truncated']);
});
