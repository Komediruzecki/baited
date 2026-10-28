import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import type { CardLibraryView } from '../shared/card-library.js';
import type { Studio, GameView } from '../shared/types.js';

test('card library routes enforce owner session, origin, CSRF, versions and private projections', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-library-http-'));
  const config = loadConfig({ PORT: '0', DATA_DIR: dir });
  const b = await createBait(config);
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  t.after(async () => { await b.close(); await rm(dir, { recursive: true, force: true }); });
  type Auth = { cookie: string; csrf: string };
  const call = (path: string, body?: unknown, auth?: Auth, origin = config.origin, extra: Record<string, string> = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(auth ? { Cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (): Promise<Auth> => {
    const response = await call('/api/demo/start', {});
    return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: (await response.json()).csrf };
  };
  const a = await login(), other = await login();
  const input = {
    name: 'Kitchen drawer', status: 'published',
    cards: ['cinnamon', 'coconut', 'spatula', 'broccoli', 'kettle', 'radish'].map((target) => ({ target, difficulty: 'medium', blockedClues: ['kitchen', 'food'] })),
  };
  assert.equal((await call('/api/studio/cards')).status, 401);
  assert.equal((await call('/api/studio/cards', undefined, undefined, config.origin, { Authorization: 'Bearer viewer-token' })).status, 401);
  assert.equal((await call('/api/studio/cards/pack', input)).status, 401);
  assert.equal((await call('/api/studio/cards/pack', input, { ...a, csrf: 'wrong' })).status, 403);
  assert.equal((await call('/api/studio/cards/pack', input, a, 'https://unrelated.example')).status, 403);
  const invalid = await call('/api/studio/cards/pack', { ...input, name: '' }, a);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).issues[0].path, 'name');
  const savedResponse = await call('/api/studio/cards/pack', input, a);
  assert.equal(savedResponse.status, 200);
  let library = (await savedResponse.json()) as CardLibraryView;
  const pack = library.packs[0];
  assert.equal(library.savedPackId, pack.id);
  assert.equal('savedPackId' in await (await call('/api/studio/cards', undefined, a)).json(), false);
  assert.equal(pack.cards.length, 6);
  assert.equal((await (await call('/api/studio/cards', undefined, other)).json()).packs.length, 0);
  assert.equal((await call('/api/studio/cards/select', { mode: 'custom', packId: pack.id, expectedRevision: 0 }, other)).status, 409);
  assert.equal((await call('/api/studio/cards/archive', { id: pack.id, expectedRevision: pack.revision }, other)).status, 404);
  const update = { ...input, id: pack.id, expectedRevision: pack.revision, cards: pack.cards.map(({ revision: _revision, ...card }) => card) };
  assert.equal((await call('/api/studio/cards/pack', update, other)).status, 404);
  assert.equal((await call('/api/studio/cards/pack', { ...update, ownerChannelId: 'someone-else' }, a)).status, 400);
  assert.equal((await call('/api/studio/cards/select', { mode: 'custom', packId: pack.id, expectedRevision: 0 }, a)).status, 409);
  const selected = await call('/api/studio/cards/select', { mode: 'custom', packId: pack.id, expectedRevision: library.revision }, a);
  assert.equal(selected.status, 200);
  library = await selected.json();
  assert.equal(library.selected.eligibleCount, 6);
  const studio = await (await call('/api/studio/action', { action: 'start' }, a)).json() as Studio;
  assert.equal(studio.room.phase, 'active');
  assert.equal(studio.deck!.name, 'Kitchen drawer');
  assert.equal(studio.room.round!.target, undefined);
  assert.equal(JSON.stringify(studio).includes('cinnamon'), false);
  const viewerPath = new URL(studio.viewerUrl).pathname.replace('/play/', '/api/rooms/') + '/viewer';
  const viewer = await (await call(viewerPath)).json() as GameView;
  assert.ok(input.cards.some((card) => card.target === viewer.round!.target));
  assert.deepEqual(viewer.round!.forbiddenClues, ['kitchen', 'food']);
  const overlay = new URL(studio.overlayUrl);
  const overlayPath = overlay.pathname.replace('/overlay/', '/api/rooms/') + '/overlay' + overlay.search;
  const publicOverlay = await (await call(overlayPath)).json();
  assert.equal(publicOverlay.round.target, undefined);
  assert.equal('deck' in publicOverlay, false);
  assert.equal('packs' in publicOverlay, false);
  const archived = await call('/api/studio/cards/archive', { id: pack.id, expectedRevision: pack.revision }, a);
  assert.equal(archived.status, 200);
  const archivedView = await archived.json() as CardLibraryView;
  assert.equal(archivedView.selection.mode, 'builtin');
  const stillLive = await (await call(viewerPath)).json() as GameView;
  assert.equal(stillLive.round!.target, viewer.round!.target);
  assert.deepEqual(stillLive.round!.forbiddenClues, viewer.round!.forbiddenClues);
  const restoreInput = { ...update, status: 'draft', expectedRevision: archivedView.packs[0].revision };
  assert.equal((await call('/api/studio/cards/pack', restoreInput, other)).status, 404);
  const restored = await call('/api/studio/cards/pack', restoreInput, a);
  assert.equal(restored.status, 200);
  assert.equal((await restored.json() as CardLibraryView).packs[0].status, 'draft');
  assert.equal((await call('/api/studio/cards/pack', restoreInput, a)).status, 409);
  const creates = await Promise.all(['One tab', 'Another tab'].map(async (name) => {
    const response = await call('/api/studio/cards/pack', { ...input, name }, a);
    assert.equal(response.status, 200);
    const result = await response.json() as CardLibraryView;
    assert.equal(result.packs.find((item) => item.id === result.savedPackId)?.name, name);
    return result.savedPackId;
  }));
  assert.notEqual(creates[0], creates[1]);
  assert.equal((await call('/api/account/delete', {}, a)).status, 200);
  assert.equal((await call('/api/studio/cards', undefined, a)).status, 401);
});
