import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CardArtStore } from '../server/card-art.js';
import { CloudStorage } from '../server/cloud-storage.js';
import { CARD_ART_MODEL } from '../server/card-art-policy.js';
import type { CardArtProcessor } from '../server/card-art-scanner.js';

const indexKey = 'state/card-art/index.json', pendingKey = 'state/card-art/pending.json';
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
const safe = [
  { className: 'Drawing', probability: 0.9 }, { className: 'Hentai', probability: 0.01 },
  { className: 'Neutral', probability: 0.07 }, { className: 'Porn', probability: 0.01 }, { className: 'Sexy', probability: 0.01 },
];
const processor: CardArtProcessor = {
  async process() { return { png: image, width: 12, height: 10, model: CARD_ART_MODEL, predictions: [safe, safe] }; },
};
const options = { purpose: 'card' as const, source: 'draw' as const };
type ObjectValue = { bytes: Buffer; etag: string; deleted: boolean };
type Call = { key: string; method: string; bytes: Buffer; headers: Headers };

function fixture() {
  const objects = new Map<string, ObjectValue>(), calls: Call[] = [];
  const controls: {
    before?: (call: Call) => Response | undefined;
    after?: (call: Call) => void;
  } = {};
  const put = (key: string, bytes: Buffer, deleted = false) => {
    const value = { bytes, deleted, etag: `"${createHash('sha256').update(bytes).digest('hex')}"` };
    objects.set(key, value);
    return value;
  };
  const fetcher: typeof fetch = async (url, init) => {
    const key = new URL(String(url)).pathname.slice(1), method = init?.method ?? 'GET';
    const bytes = Buffer.from(await new Response(init?.body).arrayBuffer());
    const headers = new Headers(init?.headers);
    const call = { key, method, bytes, headers }; calls.push(call);
    const intercepted = controls.before?.(call);
    if (intercepted) return intercepted;
    const old = objects.get(key);
    if (method === 'GET') return old && !old.deleted
      ? new Response(new Uint8Array(old.bytes), { headers: { etag: old.etag } })
      : new Response(null, { status: 404, headers: old ? { etag: old.etag } : {} });
    if (old ? headers.get('if-match') !== old.etag : headers.get('if-none-match') !== '*')
      return new Response(null, { status: 412 });
    const result = put(key, method === 'DELETE' ? Buffer.alloc(0) : bytes, method === 'DELETE');
    controls.after?.(call);
    return new Response(null, { headers: { etag: result.etag } });
  };
  const store = () => new CardArtStore('unused-cloud-recovery', processor, new CloudStorage(fetcher));
  const privateImages = () => [...objects].filter(([key, value]) => key.startsWith('art/') && !value.deleted);
  const pending = () => JSON.parse(objects.get(pendingKey)!.bytes.toString());
  return { objects, calls, controls, put, store, privateImages, pending, fetcher };
}

test('cloud uploads record a durable intent before bytes and clear it before acknowledging', async () => {
  const f = fixture(), art = f.store(); await art.load();
  const saved = await art.upload('alice', image, 'image/png', options);
  assert.deepEqual(f.calls.filter((call) => call.method === 'PUT').map((call) => call.key),
    [pendingKey, `art/${saved.id}.png`, indexKey, pendingKey]);
  assert.deepEqual(f.pending(), { version: 1, upload: null });
  assert.deepEqual(await art.read('alice', saved.id), image);
});

test('an uncommitted index leaves an owned intent and restart removes its orphan before account deletion', async () => {
  const f = fixture(), art = f.store(); await art.load();
  f.controls.before = ({ key, method }) => key === indexKey && method === 'PUT' ? new Response(null, { status: 503 }) : undefined;
  await assert.rejects(art.upload('alice', image, 'image/png', options), /could not be saved/);
  assert.equal(f.privateImages().length, 1);
  assert.equal(f.pending().upload.owner, 'alice');
  await assert.rejects(art.deleteOwner('alice'), /could not be removed/);
  f.controls.before = undefined;
  const restarted = f.store(); await restarted.load();
  assert.equal(restarted.list('alice').art.length, 0);
  assert.equal(f.privateImages().length, 0);
  assert.deepEqual(f.pending(), { version: 1, upload: null });
  await restarted.deleteOwner('alice');
  assert.equal(f.privateImages().length, 0);
});

test('a committed index with a lost response keeps exactly its indexed image on restart', async () => {
  const f = fixture(), art = f.store(); await art.load();
  f.controls.after = ({ key, method }) => { if (key === indexKey && method === 'PUT') throw new Error('fixture response lost'); };
  await assert.rejects(art.upload('alice', image, 'image/png', options), /could not be saved/);
  const id = f.pending().upload.id;
  f.controls.after = undefined;
  const restarted = f.store(); await restarted.load();
  assert.equal(restarted.list('alice').art.length, 1);
  assert.deepEqual(await restarted.read('alice', id), image);
  assert.equal(f.privateImages().length, 1);
  assert.deepEqual(f.pending(), { version: 1, upload: null });
  await restarted.deleteOwner('alice');
  assert.equal(f.privateImages().length, 0);
});

test('ambiguous intent and PNG writes recover without losing earlier artwork or abandoning bytes', async () => {
  for (const stage of ['intent', 'png'] as const) {
    const f = fixture(), art = f.store(); await art.load();
    const earlier = await art.upload('bob', image, 'image/png', options);
    f.controls.after = ({ key, method, bytes }) => {
      if (method === 'PUT' && (stage === 'png' ? key.startsWith('art/') : key === pendingKey && JSON.parse(bytes.toString()).upload))
        throw new Error('fixture response lost');
    };
    await assert.rejects(art.upload('alice', image, 'image/png', options));
    assert.equal(f.pending().upload.owner, 'alice');
    const count = f.calls.length;
    await assert.rejects(art.upload('charlie', image, 'image/png', options));
    assert.equal(f.calls.length, count, 'retry must not replace the unresolved upload intent');
    f.controls.after = undefined;
    const restarted = f.store(); await restarted.load();
    assert.deepEqual(await restarted.read('bob', earlier.id), image);
    assert.equal(restarted.list('alice').art.length, 0);
    assert.equal(f.privateImages().length, 1);
    assert.deepEqual(f.pending(), { version: 1, upload: null });
  }
});

test('a failed PNG preflight read preserves its intent and prevents a retry from replacing it', async () => {
  const f = fixture(), art = f.store(); await art.load();
  f.controls.before = ({ key, method }) => key.startsWith('art/') && method === 'GET'
    ? new Response(null, { status: 503 }) : undefined;
  await assert.rejects(art.upload('alice', image, 'image/png', options));
  const id = f.pending().upload.id, count = f.calls.length;
  await assert.rejects(art.upload('bob', image, 'image/png', options));
  await assert.rejects(art.deleteOwner('alice'));
  assert.equal(f.calls.length, count);
  assert.equal(f.pending().upload.id, id);
  f.controls.before = undefined;
  const restarted = f.store(); await restarted.load();
  assert.equal(f.privateImages().length, 0);
  assert.deepEqual(f.pending(), { version: 1, upload: null });
  await restarted.deleteOwner('alice');
});

test('recovery fences an absent image so a delayed create-only upload cannot recreate an orphan', async () => {
  const f = fixture(), art = f.store(); await art.load();
  let delayed: Call | undefined;
  f.controls.before = (call) => {
    if (call.key.startsWith('art/') && call.method === 'PUT') {
      delayed = call;
      return new Response(null, { status: 503 });
    }
    return undefined;
  };
  await assert.rejects(art.upload('alice', image, 'image/png', options));
  assert.ok(delayed);
  assert.equal(f.privateImages().length, 0);
  f.controls.before = undefined;
  const restarted = f.store(); await restarted.load();
  assert.equal(f.objects.get(delayed.key)?.deleted, true);
  assert.equal(f.objects.get(delayed.key)?.bytes.length, 0);
  const late = await f.fetcher(`http://baited.storage/${delayed.key}`, {
    method: delayed.method, headers: delayed.headers, body: new Uint8Array(delayed.bytes),
  });
  assert.equal(late.status, 412);
  assert.deepEqual(f.pending(), { version: 1, upload: null });
  await restarted.deleteOwner('alice');
  assert.equal(f.privateImages().length, 0);
});

test('failure to clear a committed upload intent retains the saved image for restart recovery', async () => {
  for (const lostResponse of [false, true]) {
    const f = fixture(), art = f.store(); await art.load();
    const isClear = ({ key, method, bytes }: Call) => key === pendingKey && method === 'PUT' && JSON.parse(bytes.toString()).upload === null;
    if (lostResponse) f.controls.after = (call) => { if (isClear(call)) throw new Error('fixture response lost'); };
    else f.controls.before = (call) => isClear(call) ? new Response(null, { status: 503 }) : undefined;
    await assert.rejects(art.upload('alice', image, 'image/png', options));
    f.controls.after = undefined; f.controls.before = undefined;
    const restarted = f.store(); await restarted.load();
    assert.equal(restarted.list('alice').art.length, 1);
    assert.deepEqual(await restarted.read('alice', restarted.list('alice').art[0].id), image);
    assert.deepEqual(f.pending(), { version: 1, upload: null });
  }
});

test('orphan cleanup failure prevents startup and a fresh retry completes even after a lost deletion response', async () => {
  for (const lostResponse of [false, true]) {
    const f = fixture(), art = f.store(); await art.load();
    f.controls.before = ({ key, method }) => key === indexKey && method === 'PUT' ? new Response(null, { status: 503 }) : undefined;
    await assert.rejects(art.upload('alice', image, 'image/png', options));
    f.controls.before = lostResponse ? undefined : ({ method }) => method === 'DELETE' ? new Response(null, { status: 503 }) : undefined;
    if (lostResponse) f.controls.after = ({ method }) => { if (method === 'DELETE') throw new Error('fixture response lost'); };
    await assert.rejects(f.store().load());
    assert.equal(f.pending().upload.owner, 'alice');
    f.controls.before = undefined; f.controls.after = undefined;
    const restarted = f.store(); await restarted.load();
    assert.equal(f.privateImages().length, 0);
    assert.deepEqual(f.pending(), { version: 1, upload: null });
    await restarted.deleteOwner('alice');
  }
});

test('mismatched or malformed recovery records fail closed without deleting a committed image', async () => {
  const f = fixture(), art = f.store(); await art.load();
  f.controls.after = ({ key, method }) => { if (key === indexKey && method === 'PUT') throw new Error('fixture response lost'); };
  await assert.rejects(art.upload('alice', image, 'image/png', options));
  f.controls.after = undefined;
  const pending = f.pending(); pending.upload.owner = 'bob';
  f.put(pendingKey, Buffer.from(JSON.stringify(pending)));
  await assert.rejects(f.store().load(), /does not match its saved record/);
  assert.equal(f.privateImages().length, 1);
  assert.equal(f.calls.some((call) => call.method === 'DELETE'), false);
  f.put(pendingKey, Buffer.from('{"version":1,"upload":{}}'));
  await assert.rejects(f.store().load());
  assert.equal(f.privateImages().length, 1);
});

test('recovery never deletes orphan bytes that differ from the durable intent', async () => {
  const f = fixture(), art = f.store(); await art.load();
  f.controls.before = ({ key, method }) => key === indexKey && method === 'PUT' ? new Response(null, { status: 503 }) : undefined;
  await assert.rejects(art.upload('alice', image, 'image/png', options));
  f.controls.before = undefined;
  const key = `art/${f.pending().upload.id}.png`, changed = Buffer.from(image);
  changed[changed.length - 1] ^= 1;
  f.put(key, changed);
  await assert.rejects(f.store().load(), /does not match its saved image/);
  assert.equal(f.calls.some((call) => call.method === 'DELETE'), false);
  assert.deepEqual(f.objects.get(key)?.bytes, changed);
  assert.equal(f.pending().upload.owner, 'alice');
});
