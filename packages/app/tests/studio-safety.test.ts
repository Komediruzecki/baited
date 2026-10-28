import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import type { Session } from '../server/security.js';
import type { GameView, Studio } from '../shared/types.js';
import { fixture } from './fixtures.js';

const diagnosticsOrigin = 'https://dev-play-baited.maff.app';

test('speech diagnostics require an explicit flag and the exact development origin', () => {
  assert.equal(loadConfig({}).speechDiagnostics, false);
  assert.equal(loadConfig({ PUBLIC_URL: diagnosticsOrigin }).speechDiagnostics, false);
  assert.equal(loadConfig({
    PUBLIC_URL: diagnosticsOrigin, ENABLE_SPEECH_DIAGNOSTICS: 'false',
  }).speechDiagnostics, false);
  assert.equal(loadConfig({
    NODE_ENV: 'production', PUBLIC_URL: diagnosticsOrigin, ENABLE_SPEECH_DIAGNOSTICS: 'true',
  }).speechDiagnostics, true);
  for (const value of ['', '1', 'TRUE', 'yes', ' true ', 'false ']) {
    assert.throws(() => loadConfig({ PUBLIC_URL: diagnosticsOrigin, ENABLE_SPEECH_DIAGNOSTICS: value }));
  }
  for (const origin of [
    undefined, 'https://play-baited.maff.app', 'https://baited.maff.app',
    'https://dev.baited.maff.app', 'http://localhost:3000', 'http://dev-play-baited.maff.app',
    `${diagnosticsOrigin}:443`, `${diagnosticsOrigin}/`, `${diagnosticsOrigin}.evil.example`,
    'https://DEV-PLAY-BAITED.maff.app',
  ]) {
    assert.throws(() => loadConfig({ PUBLIC_URL: origin, ENABLE_SPEECH_DIAGNOSTICS: 'true' }),
      /ENABLE_SPEECH_DIAGNOSTICS/);
  }
});

async function server(t: TestContext, env: NodeJS.ProcessEnv = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'bait-studio-safety-'));
  const bait = await createBait(loadConfig({ PORT: '0', DATA_DIR: dir, ...env }));
  await new Promise<void>((resolve) => bait.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(bait.server.address() as AddressInfo).port}`;
  t.after(async () => {
    await bait.close();
    await rm(dir, { recursive: true, force: true });
  });
  const game = fixture().game;
  game.data.owner = 'owner-test';
  game.data.mode = 'twitch';
  game.connection.status = 'connected';
  game.mic = 'listening';
  game.begin();
  bait.rooms.set(game.data.id, game);
  const addSession = (id: string, userId: string, roomId = game.data.id, mode: Session['mode'] = 'twitch') => {
    bait.sessions.entries.set(id, {
      id, userId, roomId, mode, name: userId, csrf: 'synthetic-csrf', expiresAt: Date.now() + 60_000,
    });
    return `bait_session=${id}`;
  };
  const ownerCookie = addSession('owner-session', game.data.owner);
  const get = (path: string, cookie?: string) => fetch(base + path, {
    headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.timeout(5000),
  });
  const event = async (path: string, cookie?: string) => {
    const response = await get(path, cookie);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader();
    try {
      const first = new TextDecoder().decode((await reader.read()).value);
      const data = first.split('\n').find((line) => line.startsWith('data: '));
      assert.ok(data, 'the initial SSE event contains a state snapshot');
      return JSON.parse(data.slice(6)) as GameView | Studio;
    } finally {
      await reader.cancel();
    }
  };
  return { bait, game, get, event, addSession, ownerCookie };
}

test('standalone viewer JSON and SSE reject the signed-in Twitch owner without exposing the card', async (t) => {
  const { bait, game, get, event, addSession, ownerCookie } = await server(t);
  const viewer = `/api/rooms/${game.data.id}/viewer`;
  const events = `/api/rooms/${game.data.id}/events/viewer`;
  const word = game.round!.word;
  for (const path of [viewer, events]) {
    const response = await get(path, ownerCookie);
    assert.equal(response.status, 403);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const raw = await response.text();
    const error = JSON.parse(raw);
    assert.equal(error.code, 'broadcaster-view');
    assert.match(error.error, /Open Studio/);
    assert.equal(raw.includes(word), false);
    for (const privateField of ['target', 'forbiddenClues', 'artUrl', 'overlayKey', 'csrf'])
      assert.equal(Object.hasOwn(error, privateField), false);
  }

  // Room ownership follows the Twitch identity, not the session's selected room.
  const ownerElsewhere = addSession('owner-elsewhere', game.data.owner, 'another-room');
  assert.equal((await get(viewer, ownerElsewhere)).status, 403);
  assert.equal((await get(events, ownerElsewhere)).status, 403);

  // Anonymous viewing remains intentional. The owner check prevents accidental
  // peeking in a signed-in browser; it cannot identify an incognito viewer.
  const otherCookie = addSession('other-session', 'another-viewer');
  for (const cookie of [undefined, otherCookie]) {
    const snapshot = await (await get(viewer, cookie)).json() as GameView;
    assert.equal(snapshot.round?.target, word);
    assert.equal((await event(events, cookie) as GameView).round?.target, word);
  }

  const overlay = `/api/rooms/${game.data.id}/overlay?key=${game.data.overlayKey}`;
  const overlayEvents = `/api/rooms/${game.data.id}/events/overlay?key=${game.data.overlayKey}`;
  const overlaySnapshot = await (await get(overlay, ownerCookie)).json() as GameView;
  assert.equal(overlaySnapshot.round?.target, undefined);
  assert.equal(overlaySnapshot.round?.forbiddenClues, undefined);
  assert.equal(overlaySnapshot.round?.artUrl, undefined);
  assert.equal((await event(overlayEvents, ownerCookie) as GameView).round?.target, undefined);
  assert.equal((await get(`/api/rooms/${game.data.id}/overlay?key=wrong`, ownerCookie)).status, 404);

  const demo = fixture().game;
  demo.data.id = 'demo-room';
  demo.data.owner = 'demo-owner';
  demo.begin();
  bait.rooms.set(demo.data.id, demo);
  const demoCookie = addSession('demo-session', demo.data.owner, demo.data.id, 'demo');
  const demoViewer = `/api/rooms/${demo.data.id}/viewer`;
  assert.equal((await (await get(demoViewer, demoCookie)).json() as GameView).round?.target, demo.round!.word);
  assert.equal((await event(`/api/rooms/${demo.data.id}/events/viewer`, demoCookie) as GameView).round?.target, demo.round!.word);
});

test('speech diagnostics capability appears only in authenticated Studio snapshots and events', async (t) => {
  const { game, get, event, ownerCookie } = await server(t, {
    PUBLIC_URL: diagnosticsOrigin, ENABLE_SPEECH_DIAGNOSTICS: 'true',
  });
  assert.equal((await get('/api/studio')).status, 401);
  assert.equal((await get('/api/studio/events')).status, 401);
  const studio = await (await get('/api/studio', ownerCookie)).json() as Studio;
  assert.equal(studio.transcriptPreview, true);
  assert.equal((await event('/api/studio/events', ownerCookie) as Studio).transcriptPreview, true);
  for (const path of [
    '/api/session', `/api/rooms/${game.data.id}/viewer`,
    `/api/rooms/${game.data.id}/overlay?key=${game.data.overlayKey}`,
  ]) {
    const raw = await (await get(path)).text();
    assert.equal(raw.includes('transcriptPreview'), false, path);
  }
  const publicEvent = await event(`/api/rooms/${game.data.id}/events/viewer`);
  assert.equal(Object.hasOwn(publicEvent, 'transcriptPreview'), false);
  assert.equal(Object.hasOwn(studio.room, 'transcriptPreview'), false);
});

test('Studio speech diagnostics stay disabled by default', async (t) => {
  const { get, ownerCookie } = await server(t);
  const studio = await (await get('/api/studio', ownerCookie)).json() as Studio;
  assert.equal(studio.transcriptPreview, false);
});
