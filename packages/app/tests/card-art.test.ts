import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { CardArtStore, CardArtCapabilities, CardArtError } from '../server/card-art.js';
import { CARD_ART_MODEL, screenArt } from '../server/card-art-policy.js';
import { LocalArtProcessor, ArtProcessingError, type CardArtProcessor } from '../server/card-art-scanner.js';
import { fixture } from './fixtures.js';

const safe = [
  { className: 'Drawing', probability: 0.9 }, { className: 'Hentai', probability: 0.01 },
  { className: 'Neutral', probability: 0.07 }, { className: 'Porn', probability: 0.01 }, { className: 'Sexy', probability: 0.01 },
];
const options = { purpose: 'card' as const, source: 'draw' as const };
const png = () => sharp({ create: { width: 12, height: 10, channels: 4, background: '#9146ff80' } }).png().toBuffer();
const approved = (image: Uint8Array, predictions: unknown = [safe, safe]): CardArtProcessor => ({
  async process() { return { png: image, width: 12, height: 10, model: CARD_ART_MODEL, predictions }; },
});

test('sexual screen fails closed on uncertainty, invalid scores, missing categories and either alpha surface', () => {
  assert.equal(screenArt([safe, safe]), 'accepted');
  const blocked = safe.map((p) => ({ ...p, probability: p.className === 'Porn' ? 0.8 : 0.05 }));
  assert.equal(screenArt([safe, blocked]), 'blocked');
  const uncertain = safe.map((p) => ({ ...p, probability: p.className === 'Drawing' ? 0.8 : p.className === 'Hentai' ? 0.11 : p.probability }));
  assert.equal(screenArt([uncertain, safe]), 'uncertain');
  assert.equal(screenArt([safe]), 'unavailable');
  assert.equal(screenArt([safe, safe.slice(1)]), 'unavailable');
  assert.equal(screenArt([safe, safe.map((p) => ({ ...p, probability: NaN }))]), 'unavailable');
  assert.equal(screenArt([safe, safe.map((p) => ({ ...p, className: 'Neutral' }))]), 'unavailable');
});

test('source and final approvals are owned, immutable, persisted and protected while referenced', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-store-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const source = await store.upload('alice', bytes, 'image/png', { purpose: 'source', source: 'upload' });
  assert.equal(store.canAttach('alice', source.id), false);
  await assert.rejects(store.upload('bob', bytes, 'image/png', { ...options, sourceId: source.id }), (e: unknown) => e instanceof CardArtError && e.code === 'art_missing');
  const art = await store.upload('alice', bytes, 'image/png', { ...options, sourceId: source.id });
  assert.equal(store.canAttach('alice', art.id), true);
  assert.equal(store.canAttach('bob', art.id), false);
  assert.deepEqual(await store.read('alice', art.id), bytes);
  await assert.rejects(store.read('bob', art.id));
  await assert.rejects(store.remove('alice', source.id, () => new Set()), /still used/);
  await assert.rejects(store.remove('alice', art.id, () => new Set([art.id])), /still used/);
  const reload = new CardArtStore(dir, approved(bytes)); await reload.load();
  assert.equal(reload.canAttach('alice', art.id), true);
  assert.deepEqual(await reload.read('alice', art.id), bytes);
  await reload.close();
  const metadata = JSON.parse(await readFile(join(dir, 'card-art/index.json'), 'utf8'));
  assert.equal(metadata.records[1].sourceId, source.id);
  assert.equal(metadata.records[1].sourceSha256, metadata.records[0].sha256);
  const replaced = await store.upload('alice', bytes, 'image/png', options);
  assert.notEqual(replaced.id, art.id);
  await store.remove('alice', art.id, () => new Set());
  await store.remove('alice', source.id, () => new Set());
  assert.equal(store.list('alice').art.length, 1);
  await store.deleteOwner('alice');
  assert.equal(store.list('alice').art.length, 0);
  assert.equal(await readFile(join(dir, 'card-art/index.json'), 'utf8'), '{"version":1,"records":[]}');
});

test('blocked, uncertain and unavailable scans never persist image bytes or approve a record', async (t) => {
  const bytes = await png();
  for (const predictions of [[], [safe, safe.map((p) => ({ ...p, probability: p.className === 'Porn' ? 0.8 : 0.05 }))]]) {
    const dir = await mkdtemp(join(tmpdir(), 'bait-art-block-'));
    const store = new CardArtStore(dir, approved(bytes, predictions)); await store.load();
    t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
    await assert.rejects(store.upload('alice', bytes, 'image/png', options), CardArtError);
    assert.deepEqual(await readdir(join(dir, 'card-art')), []);
    assert.equal(store.list('alice').art.length, 0);
  }
});

test('dimension failures explain resizing separately from unreadable images and never persist bytes', async (t) => {
  const bytes = await png();
  for (const code of ['image_dimensions', 'invalid_image'] as const) {
    const dir = await mkdtemp(join(tmpdir(), 'bait-art-input-'));
    const store = new CardArtStore(dir, { async process() { throw new ArtProcessingError(code); } });
    await store.load();
    t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
    await assert.rejects(store.upload('alice', bytes, 'image/png', options), (error: unknown) => {
      assert.ok(error instanceof CardArtError);
      assert.equal(error.status, 422);
      assert.equal(error.code, code);
      assert.match(error.message, code === 'image_dimensions' ? /32 megapixels.*8192/ : /could not be read/);
      return true;
    });
    assert.deepEqual(await readdir(join(dir, 'card-art')), []);
  }
});

test('failed persistence does not report saved artwork or leave a normalized orphan', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-disk-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  await mkdir(join(dir, 'card-art/index.json'));
  await assert.rejects(store.upload('alice', bytes, 'image/png', options), (e: unknown) => e instanceof CardArtError && e.code === 'art_storage');
  assert.equal(store.list('alice').art.length, 0);
  assert.equal((await readdir(join(dir, 'card-art'))).some((file) => file.endsWith('.png') || file.endsWith('.png.tmp')), false);
});

test('an account deletion cancels an in-flight scan even if the owner signs in again', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-delete-')), bytes = await png();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const store = new CardArtStore(dir, { async process() { await gate; return { png: bytes, width: 12, height: 10, model: CARD_ART_MODEL, predictions: [safe, safe] }; } });
  await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const scan = store.upload('alice', bytes, 'image/png', options);
  await store.deleteOwner('alice'); store.activateOwner('alice'); release();
  await assert.rejects(scan, CardArtError);
  assert.equal(store.list('alice').art.length, 0);
});

test('failed file deletion retains the private record so ordinary and account deletion can retry', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-unlink-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  for (const account of [false, true]) {
    const owner = account ? 'bob' : 'alice', art = await store.upload(owner, bytes, 'image/png', options);
    const path = join(dir, 'card-art', `${art.id}.png`);
    await rename(path, `${path}.hold`); await mkdir(path);
    const remove = () => account ? store.deleteOwner(owner) : store.remove(owner, art.id, () => new Set());
    await assert.rejects(remove(), (e: unknown) => e instanceof CardArtError && e.code === 'art_storage');
    assert.equal(store.list(owner).art.length, 1, 'failed unlink keeps the record reachable for retry');
    await rm(path, { recursive: true }); await rename(`${path}.hold`, path);
    await remove();
    assert.equal(store.list(owner).art.length, 0);
    await assert.rejects(readFile(path));
  }
});

test('a failed index update after unlink cannot approve missing bytes, including after restart', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-index-delete-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const art = await store.upload('alice', bytes, 'image/png', options);
  const index = join(dir, 'card-art/index.json');
  await rename(index, `${index}.hold`); await mkdir(index);
  await assert.rejects(store.remove('alice', art.id, () => new Set()), CardArtError);
  assert.equal(store.canAttach('alice', art.id), false);
  await assert.rejects(store.withReferences('alice', [art.id], async () => {}), CardArtError);
  await rm(index, { recursive: true }); await rename(`${index}.hold`, index);
  const reload = new CardArtStore(dir, approved(bytes)); await reload.load();
  assert.equal(reload.canAttach('alice', art.id), false);
  await reload.close();
  await store.remove('alice', art.id, () => new Set());
  assert.equal(store.list('alice').art.length, 0);
});

test('pack reference changes and image deletion serialize to prevent a newly saved dangling reference', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-race-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  const art = await store.upload('alice', bytes, 'image/png', options), references = new Set<string>();
  let release!: () => void;
  const save = store.withReferences('alice', [art.id], async () => {
    await new Promise<void>((resolve) => { release = resolve; }); references.add(art.id);
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const remove = store.remove('alice', art.id, () => references);
  release(); await save;
  await assert.rejects(remove, /still used/);
  assert.equal(store.canAttach('alice', art.id), true);
});

test('a queued text-only pack save cannot recreate a deleted account library after signing in again', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-art-pack-delete-')), bytes = await png();
  const store = new CardArtStore(dir, approved(bytes)); await store.load();
  t.after(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });
  let release!: () => void, saved = false;
  const blocker = store.withReferences('other', [], async () => new Promise<void>((resolve) => { release = resolve; }));
  await new Promise<void>((resolve) => setImmediate(resolve));
  const lateSave = store.withReferences('alice', [], async () => { saved = true; });
  const rejection = assert.rejects(lateSave, CardArtError);
  const deleting = store.deleteOwner('alice'); store.activateOwner('alice');
  release(); await blocker; await rejection; await deleting;
  assert.equal(saved, false);
});

test('round capabilities bind room, round and artwork; all projections omit private IDs', () => {
  const caps = new CardArtCapabilities('12'.repeat(32));
  const f = fixture(), id = '12345678-1234-4123-8123-123456789012';
  f.game.artFor = (round, art) => caps.path(f.game.data.id, round, art);
  f.game.deckFor = () => [{ target: 'hedgehog', difficulty: 'medium', blockedClues: ['spines', 'quills'], acceptedSpellings: [], artId: id }];
  for (const outcome of ['review', 'caught', 'escaped', 'skipped', 'ended', 'overturned'] as const) {
    f.advance(20_000); f.game.begin();
    for (const phase of ['active', 'paused', 'settling'] as const) {
      f.game.phase = phase;
      const viewer = f.game.view('viewer');
      assert.ok(viewer.round?.artUrl);
      assert.equal('artId' in viewer.round!, false);
      assert.equal(f.game.view('studio').round?.artUrl, undefined);
      assert.equal(f.game.view('overlay').round?.artUrl, undefined);
    }
    f.game.phase = 'active';
    if (outcome === 'review' || outcome === 'overturned') {
      f.game.transcript(f.transcript(), 'confirm');
      if (outcome === 'overturned') f.game.decideCatch(f.game.round!.id, 'reject');
    } else f.game.end(outcome);
    for (const role of ['viewer', 'studio', 'overlay'] as const) {
      const view = f.game.view(role);
      assert.equal(!!view.result?.artUrl, ['caught', 'escaped'].includes(outcome), `${role}/${outcome}`);
      assert.equal('artId' in view.result!, false);
      assert.equal(view.round?.artUrl, undefined);
      assert.ok(view.history.every((result) => !('artId' in result) && !('artUrl' in result)));
    }
    if (outcome === 'review') f.game.decideCatch(f.game.round!.id, 'reject');
  }
  const round = f.game.round!.id, path = caps.path('room', round, id), token = path.split('/').at(-1)!.slice(0, -4);
  assert.equal(caps.verify('room', round, id, token), true);
  assert.equal(caps.verify('other', round, id, token), false);
});

test('real CPU worker rejects malformed/animated input and normalizes an approved fixture without metadata', { timeout: 60_000 }, async (t) => {
  const worker = new LocalArtProcessor(); t.after(() => worker.close());
  const rejectsAs = (code: string) => (error: unknown) => error instanceof ArtProcessingError && error.code === code;
  await assert.rejects(worker.process(Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/png'), rejectsAs('invalid_image'));
  // A valid IHDR can advertise a huge raster in a tiny file. Reject from its
  // header, before attempting to decode the deliberately mismatched pixel data.
  const oversizedHeader = async (width: number, height: number) => {
    const image = Buffer.from(await png());
    image.writeUInt32BE(width, 16); image.writeUInt32BE(height, 20);
    image.writeUInt32BE(crc32(image.subarray(12, 29)), 29);
    return image;
  };
  await assert.rejects(worker.process(await oversizedHeader(8193, 1), 'image/png'), rejectsAs('image_dimensions'));
  await assert.rejects(worker.process(await oversizedHeader(6000, 6000), 'image/png'), rejectsAs('image_dimensions'));
  const bytes = await readFile(new URL('../public/cards/proofs/hedgehog.png', import.meta.url));
  const result = await worker.process(bytes, 'image/png');
  assert.equal(screenArt(result.predictions), 'accepted');
  const metadata = await sharp(result.png).metadata();
  assert.equal(metadata.format, 'png'); assert.ok(metadata.width! <= 512 && metadata.height! <= 512);
  assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  // A declared APNG frame-control chunk is refused rather than silently taking its first frame.
  const animated = Buffer.concat([bytes.subarray(0, 33), Buffer.from([0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]), bytes.subarray(33)]);
  await assert.rejects(worker.process(animated, 'image/png'), rejectsAs('invalid_image'));
});

test('real worker fits large phone JPEGs without cropping and respects EXIF orientation', { timeout: 60_000 }, async (t) => {
  const worker = new LocalArtProcessor(); t.after(() => worker.close());
  const artwork = await readFile(new URL('../public/cards/proofs/hedgehog.png', import.meta.url));
  for (const photo of [
    { width: 2880, height: 3840, orientation: 1 },
    { width: 3264, height: 2448, orientation: 6 },
  ]) {
    const bytes = await sharp(artwork).resize(photo.width, photo.height, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).withMetadata({ orientation: photo.orientation }).toBuffer();
    assert.ok(bytes.length < 5 * 1024 * 1024, 'compressed bytes fit the existing upload limit');
    const result = await worker.process(bytes, 'image/jpeg');
    assert.equal(screenArt(result.predictions), 'accepted', 'the original photo still passes both background scans');
    assert.equal(result.width, 384); assert.equal(result.height, 512, 'the whole portrait keeps its 3:4 ratio');
    const metadata = await sharp(result.png).metadata();
    assert.equal(metadata.width, 384); assert.equal(metadata.height, 512);
    assert.equal(metadata.orientation, undefined); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
  }
});
