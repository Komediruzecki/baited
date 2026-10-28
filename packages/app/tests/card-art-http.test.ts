import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { CARD_ART_MODEL } from '../server/card-art-policy.js';
import type { CardArtUploadResult } from '../shared/card-art.js';
import type { CardLibraryView } from '../shared/card-library.js';
import type { Studio, GameView } from '../shared/types.js';

test('artwork APIs enforce ownership, source approval, CSRF and per-round capability visibility', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-http-'));
  const extensionOrigin = 'https://example.ext-twitch.tv';
  const config = loadConfig({ PORT: '0', DATA_DIR: dir, EXTENSION_ALLOWED_ORIGINS: extensionOrigin });
  const bytes = await sharp({ create: { width: 10, height: 12, channels: 4, background: '#9146ff80' } }).png().toBuffer();
  const safe = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'].map((className) => ({ className, probability: className === 'Drawing' ? 0.96 : 0.01 }));
  let scanCount = 0;
  const b = await createBait(config, false, { artProcessor: { async process() {
    scanCount++; return { png: bytes, width: 10, height: 12, model: CARD_ART_MODEL, predictions: [safe, safe] };
  } } });
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  t.after(async () => { await b.close(); await rm(dir, { recursive: true, force: true }); });
  type Auth = { cookie: string; csrf: string };
  const call = (path: string, body?: unknown, auth?: Auth, extra: Record<string, string> = {}) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: config.origin, ...(auth ? { Cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const login = async (): Promise<Auth> => {
    const response = await call('/api/demo/start', {});
    return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: (await response.json()).csrf };
  };
  const upload = (auth?: Auth, extra: Record<string, string> = {}) => fetch(base + '/api/studio/card-art', {
    method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'image/png', ...(auth ? { Cookie: auth.cookie, 'x-csrf-token': auth.csrf } : {}), ...extra }, body: Uint8Array.from(bytes),
  });
  const a = await login(), other = await login();
  assert.equal((await upload()).status, 401);
  assert.equal((await upload({ ...a, csrf: 'wrong' })).status, 403);
  assert.equal((await upload(a, { Origin: 'https://elsewhere.example' })).status, 403);
  assert.equal(scanCount, 0);
  const sourceResponse = await upload(a, { 'X-Art-Purpose': 'source', 'X-Art-Source': 'upload' });
  assert.equal(sourceResponse.status, 201);
  const source = (await sourceResponse.json() as CardArtUploadResult).art;
  assert.equal((await upload(other, { 'X-Art-Source-Id': source.id })).status, 409);
  const finalResponse = await upload(a, { 'X-Art-Source': 'pixel', 'X-Art-Source-Id': source.id });
  assert.equal(finalResponse.status, 201);
  const art = (await finalResponse.json() as CardArtUploadResult).art;
  assert.equal(scanCount, 2, 'both original and transformed output are screened');
  assert.equal((await call(art.url)).status, 401);
  assert.equal((await call(art.url, undefined, other)).status, 404);
  assert.equal((await call(art.url, undefined, a)).status, 200);
  assert.equal((await (await call('/api/studio/card-art', undefined, other)).json()).art.length, 0);
  const input = { name: 'Pictures', status: 'published', cards: ['cinnamon', 'coconut', 'spatula', 'broccoli', 'kettle', 'radish'].map((target) => ({ target, difficulty: 'medium', blockedClues: ['kitchen', 'food'], artId: art.id })) };
  assert.equal((await call('/api/studio/cards/pack', input, other)).status, 409);
  assert.equal((await call('/api/studio/cards/pack', { ...input, cards: input.cards.map((card) => ({ ...card, artId: source.id })) }, a)).status, 409);
  const save = await call('/api/studio/cards/pack', input, a);
  assert.equal(save.status, 200);
  const library = await save.json() as CardLibraryView;
  assert.equal((await call('/api/studio/cards/select', { mode: 'custom', packId: library.savedPackId, expectedRevision: library.revision }, a)).status, 200);
  const studio = await (await call('/api/studio/action', { action: 'start' }, a)).json() as Studio;
  assert.equal(studio.room.round?.artUrl, undefined);
  const viewerPath = new URL(studio.viewerUrl).pathname.replace('/play/', '/api/rooms/') + '/viewer';
  const viewer = await (await call(viewerPath)).json() as GameView;
  const url = viewer.round!.artUrl!;
  assert.ok(url.startsWith('/api/card-art/round/'));
  assert.equal('artId' in viewer.round!, false);
  const allowed = await call(url, undefined, undefined, { Origin: extensionOrigin });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('Content-Type'), 'image/png');
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), extensionOrigin);
  assert.equal(allowed.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
  assert.equal(allowed.headers.get('Cache-Control'), 'no-store');
  assert.equal((await call(url, undefined, undefined, { Origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await call(url + '?target=hedgehog')).status, 404);
  const wrong = url.replace(/\/[A-Za-z0-9_-]{43}\.png$/, '/' + 'A'.repeat(43) + '.png');
  assert.equal((await call(wrong)).status, 404);
  const game = b.rooms.get(viewer.id)!;
  game.end('skipped');
  assert.equal((await call(url)).status, 404, 'old viewer capability closes for an unrevealed outcome');
  assert.equal(game.view('overlay').result?.artUrl, undefined);
  const deletion = await fetch(base + '/api/studio/card-art/' + art.id, { method: 'DELETE', headers: { Origin: config.origin, Cookie: a.cookie, 'x-csrf-token': a.csrf } });
  assert.equal(deletion.status, 409, 'a saved pack and round still reference these immutable bytes');
  // A confirmed result can reveal only its own immutable image.
  game.nextAt = null; game.start(); game.end('caught');
  const resultUrl = game.view('overlay').result!.artUrl!;
  assert.ok(resultUrl);
  assert.equal((await call(resultUrl)).status, 200);
  game.reverse();
  assert.equal((await call(resultUrl)).status, 404, 'overturning a catch closes its image capability');
  assert.equal((await call('/api/account/delete', {}, a)).status, 200);
  assert.equal((await call(resultUrl)).status, 404);
});
