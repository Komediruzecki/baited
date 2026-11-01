import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { VoiceGuessSession, VOICE_GUESS_TTL_MS, type VoiceGuessSnapshot } from '../client/voice-guess';
import type { VoiceGuessControl as Control } from '../client/VoiceGuessControl';

// Use the app's TSX/CSS module pipeline for the actual component. This server
// has no listening socket and loads no project config, microphone or model.
let server: ViteDevServer;
let VoiceGuessControl: typeof Control;
before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
    server: { middlewareMode: true, watch: null }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { optimizeDeps: { noDiscovery: true, include: [] } } });
  ({ VoiceGuessControl } = await server.ssrLoadModule('/client/VoiceGuessControl.tsx'));
});
after(async () => { await server?.close(); });

let id = 0;
const line = (text: string, confidence = 1) => ({ id: String(++id), text, isComplete: true,
  words: [{ text, start: 0, end: 1, confidence }] });
const session = () => {
  const voice = new VoiceGuessSession();
  voice.setContext({ roundId: 'round', epoch: 1, leaseId: 'lease', takeId: 'take' });
  return voice;
};
const render = (pending: VoiceGuessSnapshot) => renderToStaticMarkup(React.createElement(VoiceGuessControl, {
  enabled: true, ready: true, pending, seconds: 12, busy: false, message: '', announcement: '',
  onToggle() {}, onLock() {}, onCancel() {},
}));

test('wake-only state asks for intent rather than promising that a bare target is safe', () => {
  const voice = session(); voice.receive(line('Hey Baity'), 100);
  const html = render(voice.snapshot(101));
  assert.match(html, /role="status">Say <q>I’m calling the bait<\/q> before your word/);
  assert.doesNotMatch(html, /role="status">Listening for your guess/);
  assert.match(html, /<button[^>]*>Cancel guess<\/button>/);
});

test('armed and uncertain-retry states show the listening indicator and a visible cancel control', () => {
  const voice = session(); voice.receive(line("I'm calling the bait"), 100);
  for (const pending of [voice.snapshot(101), (() => {
    voice.receive(line('Banana', .2), 200); return voice.snapshot(201);
  })()]) {
    const html = render(pending);
    assert.match(html, /role="status">Listening for your guess/);
    assert.match(html, /<button[^>]*>Cancel guess<\/button>/);
    assert.doesNotMatch(html, /<strong>banana<\/strong>/);
  }
});

test('draft correction restarts explicit intent; expiry removes the listening state and cancel action', () => {
  const voice = session(); voice.receive(line("I'm calling the bait"), 100);
  voice.receive(line('Banana'), 200);
  const html = render(voice.snapshot(201));
  assert.match(html, /To change it, say <q>I’m calling the bait<\/q> again/);
  assert.match(html, /<strong>banana<\/strong>/);
  const expired = render(voice.snapshot(200 + VOICE_GUESS_TTL_MS));
  assert.doesNotMatch(expired, /role="status">Listening for your guess|>Cancel guess<\/button>/);
});
