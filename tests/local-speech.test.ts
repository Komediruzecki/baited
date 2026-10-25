import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { localTranscript, LocalSpeechBridge } from '../server/local-speech.js';
import { fixture } from './fixtures.js';
import { SPEECH_SETTLE_MS } from '../server/game.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { LocalFinalSequence } from '../client/local-final-sequence.js';
import type { MoonshineLine } from '../client/moonshine.js';

const binding = { roundId: 'round', epoch: 1, firstAudioAt: 100000, audioSeconds: 3, lastSequence: 0 };
const final = (word = 'banana', confidence = .91) => ({ type: 'final', sequence: 1,
  line: { id: 'opaque-123', text: `I said ${word}`, isComplete: true, startTime: 1, duration: 1,
    words: [{ text: word, start: 1.2, end: 1.8, confidence }] },
});
test('silent completed lines consume no wire sequence and do not break the following real final', () => {
  const sequence = new LocalFinalSequence();
  const line: MoonshineLine = { ...final().line, isUpdated: true, isNew: true,
    hasTextChanged: true, haveSpeakersChanged: false, lastTranscriptionLatencyMs: 0, speakerSpans: [] };
  assert.equal(sequence.next({ ...line, text: '', words: [] }), null);
  assert.equal(sequence.next({ ...line, text: '   ' }), null);
  assert.equal(sequence.next({ ...line, words: [] }), null);
  assert.equal(sequence.next({ ...line, duration: 0 }), null);
  assert.equal(sequence.next({ ...line, duration: Number.NaN }), null);
  const first = sequence.next(line);
  assert.equal(first?.sequence, 1);
  assert.ok(localTranscript(first, binding, 103000), 'next valid line passes the unchanged server guards');
  assert.equal(sequence.next({ ...line, text: '', words: [] }), null);
  assert.equal(sequence.next(line)?.sequence, 2);
  sequence.reset(); assert.equal(sequence.next(line)?.sequence, 1);
});
test('local finalized words preserve supplied SDK metadata and convert the capture clock', () => {
  const transcript = localTranscript(final(), binding, 103000);
  assert.ok(transcript); assert.equal(transcript.confidence, .91);
  assert.deepEqual(transcript.words, [{ text: 'banana', confidence: .91, capturedAt: 101200, endedAt: 101800 }]);
  assert.equal(transcript.epoch, 1); assert.equal(transcript.roundId, 'round');
});
test('local transcript rejects replay, missing evidence, nonfinal text and implausible timing', () => {
  assert.equal(localTranscript(final(), { ...binding, lastSequence: 1 }, 103000), null);
  assert.equal(localTranscript({ ...final(), sequence: 3 }, binding, 103000), null);
  assert.equal(localTranscript({ ...final(), line: { ...final().line, isComplete: false } }, binding, 103000), null);
  assert.equal(localTranscript({ ...final(), line: { ...final().line, words: [] } }, binding, 103000), null);
  assert.equal(localTranscript(final(), { ...binding, audioSeconds: .5 }, 103000), null);
  assert.equal(localTranscript(final(), { ...binding, audioSeconds: 10 }, 110000), null);
  assert.equal(localTranscript(final(), binding, 100000), null);
  assert.equal(localTranscript(final('banana', Number.NaN), binding, 103000), null);
  const reversed = final(); reversed.line.words[0].end = 1;
  assert.equal(localTranscript(reversed, binding, 103000), null);
});
test('Moonshine placeholder confidence produces a pending catch, never an automatic win', () => {
  const f = fixture(); f.game.begin(); f.advance(3000);
  const transcript = localTranscript(final(f.game.round!.word, 1), {
    ...binding, roundId: f.game.round!.id, epoch: f.game.round!.epoch,
  }, f.now())!;
  assert.equal(f.game.transcript(transcript, 'confirm'), true);
  assert.equal(f.game.result?.outcome, 'review');
  assert.equal(f.game.score.wins, 0);
});
test('a demo using real local speech gets the same pre-buzzer settlement as Twitch', () => {
  const f = fixture(); f.game.begin(); f.game.mic = 'listening';
  const round = f.game.round!;
  f.advance(round.duration + 100); f.game.tick();
  assert.equal(f.game.phase, 'settling');
  assert.equal(f.game.round!.settleUntil, round.endsAt + SPEECH_SETTLE_MS);
  assert.equal(f.game.transcript(f.transcript(round.word, { words: [{
    text: round.word, confidence: .95, capturedAt: round.endsAt - 200, endedAt: round.endsAt - 50,
  }] })), true);
});
test('an early target in a fresh completed sentence is not lost to per-word age', () => {
  const f = fixture(); f.game.begin(); f.advance(11000);
  const payload = final(f.game.round!.word);
  payload.line.duration = 9;
  const transcript = localTranscript(payload, { ...binding, roundId: f.game.round!.id,
    epoch: f.game.round!.epoch, audioSeconds: 10 }, f.now());
  assert.ok(transcript); assert.equal(f.game.transcript(transcript), true);
});
test('fresh segment metadata cannot make future or inverted capture evidence valid', () => {
  const f = fixture(); f.game.begin(); f.advance(1000);
  for (const endedAt of [f.now() + 2000, Number.NaN, f.now() - 100]) {
    assert.equal(f.game.transcript(f.transcript(undefined, { endedAt })), false);
  }
});
class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = WebSocket.CLOSED; this.emit('close'); }
}
test('local speech accepts only a paced audio clock and pauses on a capture gap', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(); f.game.begin();
  const client = new Socket(), bridge = new LocalSpeechBridge(client as unknown as WebSocket, f.game, () => true, () => {});
  client.emit('message', Buffer.from(JSON.stringify({ type: 'audio', samples: 2048 })), false);
  assert.equal(f.game.phase, 'active');
  t.mock.timers.tick(3000);
  bridge.sync();
  assert.equal(f.game.phase, 'paused');
  assert.equal(client.readyState, WebSocket.CLOSED);
});
test('local speech never accepts audio bytes and invalidates expired sessions or epochs', () => {
  for (const failure of ['binary', 'session', 'epoch'] as const) {
    const f = fixture(); f.game.begin(); let valid = true;
    const client = new Socket(), bridge = new LocalSpeechBridge(client as unknown as WebSocket, f.game, () => valid, () => {});
    if (failure === 'binary') client.emit('message', Buffer.alloc(2048), true);
    if (failure === 'session') { valid = false; bridge.sync(); }
    if (failure === 'epoch') { f.game.pause(); f.game.resume(); bridge.sync(); }
    assert.equal(client.readyState, WebSocket.CLOSED, failure);
    assert.equal(f.game.score.wins, 0);
  }
});

test('Moonshine works without provider keys but requires the owning studio lease on the real websocket', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const dir = await mkdtemp(join(tmpdir(), 'bait-local-speech-'));
  const config = loadConfig({ DATA_DIR: dir, PORT: '0' }), bait = await createBait(config);
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  const abort = new AbortController(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  t.after(async () => { abort.abort(); await reader?.cancel().catch(() => {}); await bait.close(); await rm(dir, { recursive: true, force: true }); });
  const first = await fetch(base + '/api/demo/start', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: '{}' });
  const cookie = first.headers.get('set-cookie')!.split(';')[0], { csrf } = await first.json();
  const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
  const session = bait.sessions.get(cookie)!, game = bait.rooms.get(session.roomId)!;
  const studio = await (await fetch(base + '/api/studio', { headers: { Cookie: cookie } })).json();
  assert.equal(studio.speechReady, true); assert.equal(studio.speechProvider, 'moonshine');
  const sse = await fetch(base + '/api/studio/events', { headers: { Cookie: cookie }, signal: abort.signal });
  reader = sse.body!.getReader(); await reader.read();
  const leaseId = 'c8d46f08-480e-454d-bdd7-e0428f350179';
  assert.equal((await post('/api/studio/microphone', { armed: true, leaseId })).status, 200);
  assert.equal((await post('/api/studio/action', { action: 'start' })).status, 200);
  const url = new URL(base.replace('http:', 'ws:') + '/api/speech');
  url.search = new URLSearchParams({ round: game.round!.id, epoch: String(game.round!.epoch), csrf, leaseId }).toString();
  const denied = async (wrong: URL, origin = config.origin) => new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(wrong, { headers: { Origin: origin, Cookie: cookie } });
    socket.once('unexpected-response', (_req, response) => { response.resume(); socket.terminate(); resolve(response.statusCode!); });
    socket.on('error', () => {}); socket.once('open', () => { socket.terminate(); reject(new Error('Unauthorized socket opened')); });
  });
  const wrongLease = new URL(url); wrongLease.searchParams.set('leaseId', 'other-lease');
  assert.equal(await denied(wrongLease), 403);
  assert.equal(await denied(url, 'https://elsewhere.example'), 403);
  const socket = new WebSocket(url, { headers: { Origin: config.origin, Cookie: cookie } });
  await new Promise<void>((resolve, reject) => { socket.once('message', () => resolve()); socket.once('error', reject); });
  const target = game.round!.word;
  t.mock.timers.tick(128);
  socket.send(JSON.stringify({ type: 'audio', samples: 2048 }));
  socket.send(JSON.stringify({ type: 'final', sequence: 1, line: {
    id: 'real-websocket-line', text: target, isComplete: true, startTime: 0, duration: .128,
    words: [{ text: target, start: .02, end: .08, confidence: .98 }],
  } }));
  await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Local result timed out')), 2000);
    socket.once('close', () => { clearTimeout(timeout); resolve(); }); });
  assert.equal(game.result?.outcome, 'review'); assert.equal(game.score.wins, 0);
  const decision = { roundId: game.round!.id, decision: 'confirm' };
  assert.equal((await fetch(base + '/api/studio/catch', { method: 'POST',
    headers: { Origin: config.origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(decision) })).status, 403, 'CSRF is required');
  assert.equal((await fetch(base + '/api/studio/catch', { method: 'POST',
    headers: { Origin: config.origin, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(decision) })).status, 401, 'studio session is required');
  assert.equal((await post('/api/studio/catch', decision)).status, 200);
  assert.equal(game.result?.outcome, 'caught'); assert.equal(game.score.wins, 1);
  assert.notEqual((await post('/api/studio/catch', decision)).status, 200, 'duplicate decisions rejected');
  assert.equal(game.score.wins, 1);
  assert.equal(await denied(url), 403, 'completed round cannot be replayed');
});
