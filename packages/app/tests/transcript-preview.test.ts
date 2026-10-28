import test from 'node:test';
import assert from 'node:assert/strict';
import { canPreviewTranscript, TranscriptPreviewBuffer, TRANSCRIPT_PREVIEW_LIMIT, TRANSCRIPT_PREVIEW_TEXT_LIMIT } from '../client/transcript-preview';
import type { MoonshineLine } from '../client/moonshine';

const line = (id: string, text: string, isComplete = true) => ({ id, text, isComplete } as MoonshineLine);

test('local speech diagnostics remain available separately from target reveal', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1'])
    assert.equal(canPreviewTranscript(host, 'twitch'), true);
  for (const host of ['bait.maff.app', 'localhost.example.com', '192.168.1.10'])
    assert.equal(canPreviewTranscript(host, 'twitch'), false);
  assert.equal(canPreviewTranscript('preview.example.com', 'demo'), true);
});

test('hosted speech diagnostics require the exact dev host and server capability', () => {
  assert.equal(canPreviewTranscript('dev-play-baited.maff.app', 'twitch', true), true);
  assert.equal(canPreviewTranscript('dev-play-baited.maff.app', 'twitch'), false);
  assert.equal(canPreviewTranscript('dev-play-baited.maff.app', 'twitch', false), false);
  for (const host of ['play-baited.maff.app', 'dev.baited.maff.app', 'dev-play-baited.maff.app.example.com', '192.168.1.10'])
    assert.equal(canPreviewTranscript(host, 'twitch', true), false);
  assert.equal(canPreviewTranscript('localhost', 'twitch', false), true);
});

test('revoking diagnostic permission erases phrases and requires a fresh opt-in', () => {
  const preview = new TranscriptPreviewBuffer();
  preview.setEnabled(true);
  assert.equal(preview.receive(line('1', 'before revoke'), 'round:1')?.length, 1);
  if (!canPreviewTranscript('dev-play-baited.maff.app', 'twitch', false))
    assert.deepEqual(preview.setEnabled(false), []);
  assert.equal(preview.receive(line('2', 'after revoke'), 'round:1'), null);
  assert.equal(canPreviewTranscript('dev-play-baited.maff.app', 'twitch', true), true);
  assert.equal(preview.receive(line('3', 'permission alone does not opt in'), 'round:1'), null);
  assert.deepEqual(preview.setEnabled(true), []);
  assert.equal(preview.receive(line('4', 'after fresh opt-in'), 'round:1')?.length, 1);
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
