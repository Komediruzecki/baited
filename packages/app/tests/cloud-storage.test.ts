import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudStorage, CloudStorageError, CLOUD_JSON_LIMIT, CLOUD_STORAGE_ORIGIN } from '../server/cloud-storage.js';
import { Store } from '../server/store.js';
import { CardLibraryStore } from '../server/card-library.js';
import { CardArtStore } from '../server/card-art.js';
import { CARD_ART_MODEL } from '../server/card-art-policy.js';
import type { CardArtProcessor } from '../server/card-art-scanner.js';
import { CARD_ART_LIMITS } from '../shared/card-art.js';
import { loadConfig } from '../server/config.js';
import { createBait } from '../server/app.js';
import { fixture } from './fixtures.js';

const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const safe = [
  { className: 'Drawing', probability: 0.9 }, { className: 'Hentai', probability: 0.01 },
  { className: 'Neutral', probability: 0.07 }, { className: 'Porn', probability: 0.01 }, { className: 'Sexy', probability: 0.01 },
];
const processor: CardArtProcessor = {
  async process() { return { png: image, width: 12, height: 10, model: CARD_ART_MODEL, predictions: [safe, safe] }; },
};
const upload = { purpose: 'card' as const, source: 'draw' as const };
const pack = (artId?: string) => ({
  name: 'Kitchen questions', status: 'published',
  cards: ['cinnamon', 'coconut', 'spatula', 'broccoli', 'kettle', 'radish'].map((target, index) => ({
    target, difficulty: 'medium', blockedClues: ['kitchen', 'food'], acceptedSpellings: [],
    ...(index === 0 && artId ? { artId } : {}),
  })),
});
const key = 'ab'.repeat(32);
const artKey = 'art/11111111-1111-4111-8111-111111111111.png';

function bridge() {
  const objects = new Map<string, { bytes: Uint8Array; etag: string; deleted?: boolean }>();
  const requests: { key: string; method: string; headers: Headers }[] = [];
  let serial = 0;
  const controls = {
    before: undefined as undefined | ((key: string, method: string) => Response | undefined),
    after: undefined as undefined | ((key: string, method: string) => void),
  };
  const fetcher: typeof fetch = async (url, init) => {
    assert.ok(String(url).startsWith(`${CLOUD_STORAGE_ORIGIN}/`));
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const objectKey = new URL(String(url)).pathname.slice(1), method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    requests.push({ key: objectKey, method, headers });
    const intercepted = controls.before?.(objectKey, method);
    if (intercepted) return intercepted;
    const previous = objects.get(objectKey);
    if (method === 'GET') return !previous || previous.deleted
      ? new Response(null, { status: 404, headers: previous ? { etag: previous.etag } : {} })
      : new Response(Buffer.from(previous.bytes), { headers: { etag: previous.etag } });
    if (previous ? headers.get('if-match') !== previous.etag : headers.get('if-none-match') !== '*')
      return new Response(null, { status: 412 });
    const etag = `"fixture-${++serial}"`;
    if (method === 'DELETE') objects.set(objectKey, { bytes: new Uint8Array(), etag, deleted: true });
    else if (method === 'PUT') objects.set(objectKey, { bytes: new Uint8Array(await new Response(init?.body).arrayBuffer()), etag });
    else throw new Error('Unexpected fixture method.');
    controls.after?.(objectKey, method);
    return new Response(null, { headers: { etag } });
  };
  return { objects, requests, controls, fetcher, storage: () => new CloudStorage(fetcher) };
}

test('cloud mode is explicit and invalid storage settings fail closed', () => {
  assert.equal(loadConfig({}).storageBackend, 'local');
  assert.equal(loadConfig({ STORAGE_BACKEND: 'cloudflare', TOKEN_ENCRYPTION_KEY: key }).storageBackend, 'cloudflare');
  assert.throws(() => loadConfig({ STORAGE_BACKEND: 'cloudflare' }), /TOKEN_ENCRYPTION_KEY/);
  assert.throws(() => loadConfig({ STORAGE_BACKEND: 'some-disk' }));
  assert.throws(() => new CloudStorage(fetch, 10_001));
});

test('rooms, encrypted vault, custom packs, deck selection and artwork reload from a fresh cloud instance', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'bait-cloud-')), dir = join(parent, 'must-stay-absent');
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fake = bridge(), cloud = fake.storage();
  const store = new Store(dir, key, cloud), art = new CardArtStore(dir, processor, cloud);
  const library = new CardLibraryStore(dir, undefined, (owner, id) => art.canAttach(owner, id), cloud);
  await store.load(); await art.load(); await library.load();
  const saved = await art.upload('alice', image, 'image/png', upload);
  const packId = await library.savePack('alice', pack(saved.id));
  await library.select('alice', { mode: 'custom', packId }, 1, 'medium');
  store.snapshot.rooms = [fixture().game.data];
  await store.setCredentials('alice', { access_token: 'fixture-only', refresh_token: 'fixture-refresh', expiresAt: 1,
    userId: 'alice', login: 'alice', name: 'Alice', scope: [] });
  assert.equal(Buffer.from(fake.objects.get('state/bait.json')!.bytes).includes('fixture-only'), false);
  const restarted = fake.storage(), recovered = new Store(dir, key, restarted), recoveredArt = new CardArtStore(dir, processor, restarted);
  const recoveredLibrary = new CardLibraryStore(dir, undefined, (owner, id) => recoveredArt.canAttach(owner, id), restarted);
  await recovered.load(); await recoveredArt.load(); await recoveredLibrary.load();
  assert.deepEqual(recovered.snapshot, store.snapshot);
  assert.equal(recovered.credentials('alice')?.access_token, 'fixture-only');
  assert.deepEqual(recoveredLibrary.view('alice', 'medium'), library.view('alice', 'medium'));
  assert.equal(recoveredLibrary.resolve('alice', 'medium')[0].artId, saved.id);
  assert.equal(recoveredArt.canAttach('alice', saved.id), true);
  assert.deepEqual(await recoveredArt.read('alice', saved.id), image);
  await recoveredArt.remove('alice', saved.id, () => new Set());
  assert.equal(fake.objects.get(`art/${saved.id}.png`)?.bytes.byteLength, 0);
  const afterDeletion = new CardArtStore(dir, processor, fake.storage()); await afterDeletion.load();
  assert.equal(afterDeletion.list('alice').art.length, 0);
  await assert.rejects(access(dir), /ENOENT/);
});

test('denied library and artwork writes never acknowledge new records or retry automatically', async () => {
  const fake = bridge(), cloud = fake.storage();
  const library = new CardLibraryStore('unused-cloud-path', undefined, undefined, cloud);
  const art = new CardArtStore('unused-cloud-path', processor, cloud);
  await library.load(); await art.load();
  fake.controls.before = (_key, method) => method === 'PUT' ? new Response(null, { status: 403 }) : undefined;
  await assert.rejects(library.savePack('alice', pack()), /could not be saved/);
  assert.equal(library.view('alice', 'medium').revision, 0);
  await assert.rejects(art.upload('alice', image, 'image/png', upload), /could not be saved/);
  assert.equal(art.list('alice').art.length, 0);
  const puts = fake.requests.filter((request) => request.method === 'PUT').length;
  await assert.rejects(library.savePack('alice', pack()), /could not be saved/);
  assert.equal(fake.requests.filter((request) => request.method === 'PUT').length, puts);
  assert.equal(fake.objects.size, 0);
});

test('overlapping stale snapshots conflict and cannot overwrite the winning saved library', async () => {
  const fake = bridge(), first = new CardLibraryStore('unused', undefined, undefined, fake.storage());
  const second = new CardLibraryStore('unused', undefined, undefined, fake.storage());
  await first.load(); await second.load();
  await first.savePack('alice', pack());
  await assert.rejects(second.savePack('bob', pack()), /could not be saved/);
  assert.equal(second.view('bob', 'medium').packs.length, 0);
  const puts = fake.requests.filter((request) => request.method === 'PUT').length;
  await assert.rejects(second.savePack('bob', pack()), /could not be saved/);
  assert.equal(fake.requests.filter((request) => request.method === 'PUT').length, puts);
  const restarted = new CardLibraryStore('unused', undefined, undefined, fake.storage()); await restarted.load();
  assert.equal(restarted.view('alice', 'medium').packs.length, 1);
  assert.equal(restarted.view('bob', 'medium').packs.length, 0);
});

test('a committed index with a lost response keeps its image recoverable and blocks further mutation', async () => {
  const fake = bridge(), art = new CardArtStore('unused', processor, fake.storage()); await art.load();
  fake.controls.after = (key, method) => { if (key === 'state/card-art/index.json' && method === 'PUT') throw new Error('lost response'); };
  await assert.rejects(art.upload('alice', image, 'image/png', upload), /could not be saved/);
  assert.equal(art.list('alice').art.length, 0);
  const count = fake.requests.length;
  await assert.rejects(art.upload('alice', image, 'image/png', upload), /could not be saved/);
  assert.equal(fake.requests.length, count, 'a failed index cannot create additional orphan images');
  fake.controls.after = undefined;
  const restarted = new CardArtStore('unused', processor, fake.storage()); await restarted.load();
  assert.equal(restarted.list('alice').art.length, 1);
  assert.deepEqual(await restarted.read('alice', restarted.list('alice').art[0].id), image);
});

test('failed index persistence after image deletion retains an unavailable record across restart', async () => {
  const fake = bridge(), art = new CardArtStore('unused', processor, fake.storage()); await art.load();
  const saved = await art.upload('alice', image, 'image/png', upload);
  fake.controls.before = (key, method) => key === 'state/card-art/index.json' && method === 'PUT' ? new Response(null, { status: 503 }) : undefined;
  await assert.rejects(art.remove('alice', saved.id, () => new Set()), /could not be removed/);
  assert.equal(art.canAttach('alice', saved.id), false);
  fake.controls.before = undefined;
  const restarted = new CardArtStore('unused', processor, fake.storage()); await restarted.load();
  assert.equal(restarted.list('alice').art.length, 1);
  assert.equal(restarted.canAttach('alice', saved.id), false);
  await restarted.remove('alice', saved.id, () => new Set());
  assert.equal(restarted.list('alice').art.length, 0);
});

test('a lost image deletion response makes it unavailable immediately and recovers deletion on restart', async () => {
  const fake = bridge(), art = new CardArtStore('unused', processor, fake.storage()); await art.load();
  const saved = await art.upload('alice', image, 'image/png', upload);
  fake.controls.after = (_key, method) => { if (method === 'DELETE') throw new Error('lost response'); };
  await assert.rejects(art.remove('alice', saved.id, () => new Set()), /could not be removed/);
  assert.equal(art.canAttach('alice', saved.id), false);
  await assert.rejects(art.read('alice', saved.id));
  fake.controls.after = undefined;
  const restarted = new CardArtStore('unused', processor, fake.storage()); await restarted.load();
  assert.equal(restarted.canAttach('alice', saved.id), false);
  await restarted.deleteOwner('alice');
  assert.equal(restarted.list('alice').art.length, 0);
});

test('immutable image CAS, conditional deletion and tombstone ETags prevent stale replacement', async () => {
  const fake = bridge(), current = fake.storage(), stale = fake.storage();
  await current.write(artKey, image);
  await stale.read(artKey);
  await current.delete(artKey);
  await assert.rejects(stale.write(artKey, image), (error: unknown) => error instanceof CloudStorageError && error.reason === 'conflict');
  const restarted = fake.storage();
  assert.equal(await restarted.read(artKey), undefined);
  await restarted.write(artKey, image);
  assert.deepEqual(await restarted.read(artKey), image);
  assert.ok(fake.requests.some((request) => request.method === 'DELETE' && request.headers.has('if-match')));
});

test('deleting a missing image creates a tombstone that fences out a delayed create-only upload', async () => {
  const fake = bridge(), recovery = fake.storage(), stale = fake.storage();
  assert.equal(await stale.read(artKey), undefined);
  await recovery.delete(artKey);
  const removal = fake.requests.find((request) => request.method === 'DELETE');
  assert.equal(removal?.headers.get('if-none-match'), '*');
  assert.equal(removal?.headers.has('if-match'), false);
  assert.equal(fake.objects.get(artKey)?.deleted, true);
  assert.equal(fake.objects.get(artKey)?.bytes.byteLength, 0);
  await assert.rejects(stale.write(artKey, image), (error: unknown) => error instanceof CloudStorageError && error.reason === 'conflict');
  assert.equal(fake.objects.get(artKey)?.deleted, true);
  assert.equal(await recovery.read(artKey), undefined);
  await recovery.delete(artKey);
  assert.ok(fake.requests.filter((request) => request.method === 'DELETE')[1].headers.has('if-match'));
});

test('missing-image deletion requires a durable tombstone ETag and snapshot deletion is forbidden', async () => {
  const missing = new CloudStorage(async () => new Response(null, { status: 404 }));
  await assert.rejects(missing.delete(artKey), /ETag/);
  assert.equal(missing.healthy, false);
  const fake = bridge(), snapshots = fake.storage();
  await assert.rejects(snapshots.delete('state/bait.json'), /cannot be deleted/);
  assert.equal(fake.requests.some((request) => request.method === 'DELETE'), false);
});

test('output limits reject oversized snapshots and images before any network request', async () => {
  const fake = bridge();
  for (const [objectKey, size] of [['state/bait.json', CLOUD_JSON_LIMIT], [artKey, CARD_ART_LIMITS.outputBytes]] as const) {
    const cloud = fake.storage();
    await assert.rejects(cloud.write(objectKey, new Uint8Array(size + 1)), /size limit/);
    assert.equal(cloud.healthy, false);
    await assert.rejects(cloud.write(objectKey, Buffer.from('{}')), /Restart/);
  }
  assert.equal(fake.requests.length, 0);
  await assert.rejects(fake.storage().read('state/../private'), /Invalid storage/);
  assert.equal(fake.requests.length, 0);
});

test('oversized GETs are bounded with and without content-length and missing ETags fail closed', async () => {
  for (const contentLength of [false, true]) {
    const cloud = new CloudStorage(async () => new Response(new Uint8Array(CARD_ART_LIMITS.outputBytes + 1), {
      headers: { etag: '"v1"', ...(contentLength ? { 'content-length': String(CARD_ART_LIMITS.outputBytes + 1) } : {}) },
    }));
    await assert.rejects(cloud.read(artKey), /size limit/);
  }
  await assert.rejects(new CloudStorage(async () => Response.json({})).read('state/bait.json'), /ETag/);
});

test('timeouts, missing write ETags and redirects fail closed without blind retries', async () => {
  for (const mode of ['timeout', 'etag', 'redirect'] as const) {
    let mutations = 0;
    const cloud = new CloudStorage(async (_url, init) => {
      if (init?.method === 'GET') return new Response(null, { status: 404 });
      mutations++;
      if (mode === 'timeout') return new Promise<Response>(() => {});
      return new Response(null, { status: mode === 'redirect' ? 307 : 200 });
    }, 10);
    await assert.rejects(cloud.write('state/bait.json', Buffer.from('{}')), CloudStorageError);
    await assert.rejects(cloud.write('state/bait.json', Buffer.from('{}')), (error: unknown) => error instanceof CloudStorageError && error.reason === 'restart');
    await assert.rejects(cloud.write(artKey, image), (error: unknown) => error instanceof CloudStorageError && error.reason === 'restart');
    assert.equal(mutations, 1);
    assert.equal(cloud.healthy, false);
  }
});

test('response body stalls share the same bounded request deadline', async () => {
  const cloud = new CloudStorage(async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(image); },
  }), { headers: { etag: '"v1"' } }), 10);
  await assert.rejects(cloud.read(artKey), /timed out/);
});

test('a denied vault write cannot expose unacknowledged credentials', async () => {
  const fake = bridge(), store = new Store('unused', key, fake.storage()); await store.load();
  fake.controls.before = (_key, method) => method === 'PUT' ? new Response(null, { status: 403 }) : undefined;
  await assert.rejects(store.setCredentials('alice', {
    access_token: 'fixture-only', refresh_token: 'fixture-refresh', expiresAt: 1, userId: 'alice', login: 'alice', name: 'Alice', scope: [],
  }));
  assert.throws(() => store.credentials('alice'), /Restart/);
  const restarted = new Store('unused', key, fake.storage()); await restarted.load();
  assert.equal(restarted.credentials('alice'), undefined);
});

test('oversized vault snapshots poison storage and cannot expose the rejected credentials', async () => {
  const fake = bridge(), cloud = fake.storage(), store = new Store('unused', key, cloud); await store.load();
  store.snapshot.vault.padding = 'x'.repeat(CLOUD_JSON_LIMIT);
  await assert.rejects(store.setCredentials('alice', {
    access_token: 'fixture-only', refresh_token: 'fixture-refresh', expiresAt: 1, userId: 'alice', login: 'alice', name: 'Alice', scope: [],
  }), /size limit/);
  assert.equal(cloud.healthy, false);
  assert.throws(() => store.credentials('alice'), /Restart/);
  delete store.snapshot.vault.padding;
  await assert.rejects(store.save(), /Restart/);
  assert.equal(fake.requests.filter((request) => request.method === 'PUT').length, 0);
});

test('failed write preflight reads poison storage before an HTTP mutation is attempted', async () => {
  const fake = bridge(), cloud = fake.storage();
  fake.controls.before = () => new Response(null, { status: 403 });
  await assert.rejects(cloud.write('state/bait.json', Buffer.from('{}')));
  assert.equal(cloud.healthy, false);
  assert.equal(fake.requests.filter((request) => request.method === 'PUT').length, 0);
});

function edgeHeaders(path: string) {
  const ip = '198.51.100.1', time = String(Math.floor(Date.now() / 1000));
  const derived = createHmac('sha256', Buffer.from(key, 'hex')).update('baited:edge-ip:v1').digest();
  const signature = createHmac('sha256', derived).update(`${time}\n${ip}\nGET\n${path}`).digest('hex');
  return { 'x-baited-edge-ip': ip, 'x-baited-edge-time': time, 'x-baited-edge-signature': signature };
}

test('failed cloud writes make health fail and shutdown still releases the server', async () => {
  const fake = bridge();
  const app = await createBait(loadConfig({ STORAGE_BACKEND: 'cloudflare', TOKEN_ENCRYPTION_KEY: key, ENABLE_DEMO: 'false', PORT: '0' }), false,
    { storageFetch: fake.fetcher, artProcessor: processor });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/health`;
  assert.equal((await fetch(url, { headers: edgeHeaders('/api/health') })).status, 200);
  fake.controls.before = (_key, method) => method === 'PUT' ? new Response(null, { status: 403 }) : undefined;
  await assert.rejects(app.cardLibrary.savePack('alice', pack()));
  assert.equal((await fetch(url, { headers: edgeHeaders('/api/health') })).status, 503);
  await assert.rejects(app.close());
  assert.equal(app.server.listening, false);
});

test('app cloud configuration wires all stores to the private binding without local fallback', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'bait-cloud-app-')), dir = join(parent, 'must-stay-absent');
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fake = bridge();
  const app = await createBait(loadConfig({ STORAGE_BACKEND: 'cloudflare', TOKEN_ENCRYPTION_KEY: key, DATA_DIR: dir, ENABLE_DEMO: 'false', PORT: '0' }), false,
    { storageFetch: fake.fetcher, artProcessor: processor });
  await app.cardLibrary.savePack('alice', pack());
  await app.cardArt.upload('alice', image, 'image/png', upload);
  await app.close();
  assert.ok(fake.objects.has('state/bait.json'));
  assert.ok(fake.objects.has('state/card-library.json'));
  assert.ok(fake.objects.has('state/card-art/index.json'));
  await assert.rejects(access(dir), /ENOENT/);
  await assert.rejects(createBait(loadConfig({ STORAGE_BACKEND: 'cloudflare', TOKEN_ENCRYPTION_KEY: key, DATA_DIR: dir }), false,
    { storageFetch: async () => new Response(null, { status: 403 }), artProcessor: processor }), CloudStorageError);
  await assert.rejects(access(dir), /ENOENT/);
});
