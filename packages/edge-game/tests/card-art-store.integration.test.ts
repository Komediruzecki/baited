import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { EDGE_CARD_ART_LIMITS } from '../../app/shared/card-art.js';
import { nodeBuiltinGuard } from '../scripts/build.mjs';
import { denyOutbound } from '../scripts/local-options.mjs';
import { png } from './png-fixture.js';

// A Durable Object around RoomArt alone, on real SQLite storage. Each test uses its own object.
let mf: Miniflare;
before(async () => {
  const result = await build({ stdin: { contents: `
    import { DurableObject } from 'cloudflare:workers';
    import { RoomArt, EdgeArtError } from '../src/card-art.js';
    export class Probe extends DurableObject {
      constructor(ctx, env) { super(ctx, env); this.art = new RoomArt(ctx.storage.sql); }
      async fetch(request) {
        const url = new URL(request.url), q = (name) => url.searchParams.get(name), owner = q('owner') ?? '123';
        try {
          switch (url.pathname) {
            case '/add': return Response.json(await this.art.add(owner, new Uint8Array(await request.arrayBuffer()),
              { purpose: q('purpose') ?? 'card', source: q('source') ?? 'upload', ...(q('sourceId') ? { sourceId: q('sourceId') } : {}) }, Date.now()), { status: 201 });
            case '/list': return Response.json(this.art.list(owner));
            case '/read': return new Response(this.art.read(owner, q('id')));
            case '/remove': this.art.remove(owner, q('id'), new Set(JSON.parse(q('refs') ?? '[]'))); return Response.json({ ok: true });
            case '/attach': return Response.json(this.art.canAttach(owner, q('id')));
            case '/sign': return Response.json(this.art.path('edge-123', q('round'), q('id')));
            case '/verify': return Response.json(this.art.verify(q('room') ?? 'edge-123', q('round'), q('id'), q('token')));
            case '/purge': return Response.json(this.ctx.storage.transactionSync(() => this.art.purge('reported', Date.now())));
            case '/allow': this.art.allow('cleared', Date.now()); return Response.json(this.art.status());
            case '/status': return Response.json(this.art.status());
          }
          return new Response('Not found.', { status: 404 });
        } catch (error) {
          if (error instanceof EdgeArtError) return Response.json({ code: error.code }, { status: error.status });
          throw error;
        }
      }
    }
    export default { fetch(request, env) {
      return env.PROBE.get(env.PROBE.idFromName(new URL(request.url).searchParams.get('probe') ?? 'probe')).fetch(request);
    } };
  `, loader: 'js', sourcefile: 'card-art-probe.js', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers'], plugins: [nodeBuiltinGuard()] });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'card-art-probe', host: '127.0.0.1', port: 0, inspectorPort: 0, inspectorHost: '127.0.0.1',
    cf: false, telemetry: { enabled: false }, modules: true, script: result.outputFiles[0]!.text, compatibilityDate: '2026-09-07',
    durableObjects: { PROBE: { className: 'Probe', useSQLite: true } }, outboundService: denyOutbound }));
  await mf.ready;
});
after(async () => { await mf?.dispose(); });

const call = (probe: string, path: string, params: Record<string, string> = {}, body?: Uint8Array) =>
  mf.dispatchFetch(`https://probe.test${path}?${new URLSearchParams({ probe, ...params })}`, body ? { method: 'POST', body } : {}) as unknown as Promise<Response>;
const add = async (probe: string, bytes: Uint8Array, params: Record<string, string> = {}) => {
  const response = await call(probe, '/add', params, bytes);
  return { status: response.status, body: await response.json() as { id: string; code?: string } };
};

test('store: 200 images per channel, then a full library', { timeout: 60_000 }, async () => {
  const image = png(2, 2);
  for (let i = 0; i < EDGE_CARD_ART_LIMITS.assets; i++) assert.equal((await add('count', image)).status, 201, `image ${i + 1}`);
  assert.deepEqual(await add('count', image), { status: 507, body: { code: 'art_quota' } });
  assert.equal((await add('count', image, { owner: '456' })).status, 201, 'The cap is per channel.');
  const list = await (await call('count', '/list')).json() as { art: unknown[]; bytes: number };
  assert.deepEqual([list.art.length, list.bytes], [200, 200 * image.length]);
});

test('store: 40 MB per channel', { timeout: 60_000 }, async () => {
  // Arbitrary IDAT bytes: the store checks framing and size, never pixels.
  const big = () => png(512, 512, { idat: randomBytes(1_048_000 - 57) });
  let stored = 0;
  for (; stored < 41; stored++) {
    const result = await add('bytes', big());
    if (result.status !== 201) { assert.deepEqual(result, { status: 507, body: { code: 'art_quota' } }); break; }
  }
  assert.equal(stored, Math.floor(EDGE_CARD_ART_LIMITS.storedBytes / 1_048_000));
});

test('store: sources, references, reads and owners', async () => {
  const source = await add('refs', png(8, 8), { purpose: 'source' });
  const card = await add('refs', png(8, 8, { rgba: [10, 20, 30, 255] }), { purpose: 'card', source: 'pixel', sourceId: source.body.id });
  assert.equal(card.status, 201);
  assert.deepEqual(await add('refs', png(4, 4), { sourceId: card.body.id }), { status: 409, body: { code: 'art_missing' } }, 'A card is not a source.');
  assert.deepEqual(await add('refs', png(4, 4), { sourceId: source.body.id, owner: '456' }), { status: 409, body: { code: 'art_missing' } }, 'Another channel cannot use it.');
  assert.equal(await (await call('refs', '/attach', { id: card.body.id })).json(), true);
  assert.equal(await (await call('refs', '/attach', { id: source.body.id })).json(), false, 'A source never goes on a card.');
  assert.equal(await (await call('refs', '/attach', { id: card.body.id, owner: '456' })).json(), false);
  const read = await call('refs', '/read', { id: card.body.id });
  assert.deepEqual(new Uint8Array(await read.arrayBuffer()), png(8, 8, { rgba: [10, 20, 30, 255] }));
  assert.equal((await call('refs', '/read', { id: card.body.id, owner: '456' })).status, 404);
  assert.equal((await call('refs', '/remove', { id: source.body.id })).status, 409, 'A pixel edit still points at its source.');
  assert.equal((await call('refs', '/remove', { id: card.body.id, refs: JSON.stringify([card.body.id]) })).status, 409, 'A card still uses it.');
  assert.equal((await call('refs', '/remove', { id: card.body.id })).status, 200);
  assert.equal((await call('refs', '/remove', { id: source.body.id })).status, 200);
  assert.equal((await call('refs', '/remove', { id: source.body.id })).status, 404);
});

test('store: signed round URLs, purge and allow', async () => {
  const card = await add('purge', png(8, 8));
  const round = randomUUID();
  const path = await (await call('purge', '/sign', { round, id: card.body.id })).json() as string;
  const match = /^\/api\/card-art\/round\/edge-123\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{43})\.png$/.exec(path);
  assert.ok(match, path);
  const token = match[3]!;
  const verify = async (params: Record<string, string>) => await (await call('purge', '/verify', { round, id: card.body.id, token, ...params })).json();
  assert.equal(await verify({}), true);
  assert.equal(await verify({ round: randomUUID() }), false, 'Bound to its round.');
  assert.equal(await verify({ room: 'edge-456' }), false, 'Bound to its room.');
  assert.equal(await verify({ token: token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A') }), false);
  assert.deepEqual(await (await call('purge', '/purge')).json(), { images: 1, bytes: png(8, 8).length });
  assert.equal(await verify({}), false, 'A purge retires every signed URL.');
  assert.deepEqual(await (await call('purge', '/status')).json(), { images: 0, bytes: 0, uploads: 'refused' });
  assert.deepEqual(await add('purge', png(8, 8)), { status: 403, body: { code: 'art_refused' } });
  assert.deepEqual(await (await call('purge', '/allow')).json(), { images: 0, bytes: 0, uploads: 'allowed' });
  assert.equal((await add('purge', png(8, 8))).status, 201);
});
