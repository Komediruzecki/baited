import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { serveApprovedArt, MAX_APPROVED_ART_BYTES, type ApprovedArt, type ApprovedArtBucket, type ApprovedArtObject } from '../src/art.js';
import type { AuthIdentity } from '../src/auth.js';

// Synthetic 1px PNG. No creator uploads, private source art or scan files are read.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
const nowMs = 1_800_000_000_000;
const sha256 = createHash('sha256').update(png).digest('hex');
const grant: ApprovedArt = {
  artId: 'fixture-card', channelId: '123', objectKey: `approved/123/${sha256}.png`,
  sha256, byteLength: png.byteLength, policyVersion: 'fixture-policy-v1', approved: true, ownerSubject: 'fixture:owner',
};

function identity(changes: Partial<AuthIdentity> = {}): AuthIdentity {
  return { authKind: 'local-fixture', channelId: '123', subject: 'fixture:viewer', role: 'viewer',
    stableIdentity: true, canControl: false, expiresAt: nowMs + 60_000, generation: 1, ...changes };
}

function object(changes: Partial<ApprovedArtObject> = {}, bytes = png): ApprovedArtObject {
  return { size: png.byteLength, httpMetadata: { contentType: 'image/png' },
    customMetadata: { approval: 'approved', sha256, channelId: '123', ownerSubject: grant.ownerSubject, policyVersion: grant.policyVersion },
    body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } }), ...changes };
}

function bucket(value: () => ApprovedArtObject | null = () => object()): ApprovedArtBucket & { keys: string[] } {
  const keys: string[] = [];
  return { keys, async get(key) { keys.push(key); return value(); } };
}

function request(method = 'GET'): Request {
  return new Request('https://edge.example/v1/rooms/123/art/fixture-card', { method });
}

async function hidden(response: Response): Promise<void> {
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found.');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.has('etag'), false);
}

test('approved PNG read authorizes before get and rechecks after read; response keeps metadata private', async () => {
  const events: string[] = [];
  const store = bucket(() => { events.push('get'); return object(); });
  const response = await serveApprovedArt(request(), identity(), grant.artId, store, async () => {
    events.push('authorize'); return grant;
  }, { nowMs });
  assert.equal(response.status, 200);
  assert.deepEqual(events, ['authorize', 'get', 'authorize']);
  assert.deepEqual(store.keys, [grant.objectKey]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), png);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('vary'), 'Origin, Authorization');
  const headers = JSON.stringify([...response.headers]);
  for (const privateValue of [grant.objectKey, grant.ownerSubject, grant.policyVersion, grant.sha256]) assert.equal(headers.includes(privateValue), false);
  assert.equal(response.headers.has('etag'), false);
});

test('missing binding, denied current round, expiry, anonymous identity and overlay cannot read R2', async () => {
  const store = bucket();
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, undefined, async () => grant, { nowMs }));
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, store, async () => null, { nowMs }));
  for (const claims of [{ expiresAt: nowMs }, { stableIdentity: false }, { role: 'overlay' as const }]) {
    await hidden(await serveApprovedArt(request(), identity(claims), grant.artId, store, async () => grant, { nowMs }));
  }
  for (const method of ['PUT', 'POST', 'DELETE', 'OPTIONS']) {
    await hidden(await serveApprovedArt(request(method), identity(), grant.artId, store, async () => grant, { nowMs }));
  }
  assert.deepEqual(store.keys, []);
});

test('unknown IDs and unapproved/cross-channel/incomplete records cannot look up an object', async () => {
  const store = bucket();
  for (const artId of ['../private', '', 'source/file.png', 'a'.repeat(97), 'other-card']) {
    await hidden(await serveApprovedArt(request(), identity(), artId, store, async () => grant, { nowMs }));
  }
  for (const changes of [
    { approved: false }, { channelId: '456' }, { objectKey: 'source/private-upload.png' },
    { sha256: 'bad-digest' }, { byteLength: MAX_APPROVED_ART_BYTES + 1 }, { byteLength: -1 },
    { byteLength: 0 }, { policyVersion: '' }, { ownerSubject: '' },
  ]) await hidden(await serveApprovedArt(request(), identity(), grant.artId, store, async () => ({ ...grant, ...changes }) as ApprovedArt, { nowMs }));
  assert.deepEqual(store.keys, []);
});

test('owner access is explicit and Studio cannot read another creator or self-authorize', async () => {
  const store = bucket();
  const studio = identity({ role: 'studio', subject: grant.ownerSubject, canControl: true });
  const response = await serveApprovedArt(request(), studio, grant.artId, store, async () => grant, { nowMs });
  assert.equal(response.status, 200);
  const firstReads = store.keys.length;
  await hidden(await serveApprovedArt(request(), { ...studio, subject: 'fixture:other' }, grant.artId, store, async () => grant, { nowMs }));
  await hidden(await serveApprovedArt(request(), studio, grant.artId, store, async () => null, { nowMs }));
  assert.equal(store.keys.length, firstReads);
});

test('missing storage objects and mismatched approval metadata all return identical 404s', async () => {
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(() => null), async () => grant, { nowMs }));
  for (const changed of [
    { approval: 'pending' }, { sha256: 'bad' }, { channelId: '456' },
    { ownerSubject: 'fixture:other' }, { policyVersion: 'stale-policy' },
  ]) {
    await hidden(await serveApprovedArt(request(), identity(), grant.artId,
      bucket(() => object({ customMetadata: { ...object().customMetadata, ...changed } })), async () => grant, { nowMs }));
  }
  for (const changed of [{ customMetadata: undefined }, { httpMetadata: undefined }, { httpMetadata: { contentType: 'image/svg+xml' } }, { size: png.byteLength + 1 }]) {
    await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(() => object(changed)), async () => grant, { nowMs }));
  }
});

test('exact approved digest is checked, even when object claims the approved hash', async () => {
  const changed = Uint8Array.from(png);
  changed[changed.length - 1] ^= 1;
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(() => object({}, changed)), async () => grant, { nowMs }));
});

test('PNG signature, IHDR framing and dimension budget are independently bounded', async () => {
  for (const offset of [0, 8, 12, 16]) {
    const changed = Uint8Array.from(png);
    changed[offset] = 255;
    const hash = createHash('sha256').update(changed).digest('hex');
    const alteredGrant = { ...grant, sha256: hash, objectKey: `approved/123/${hash}.png` };
    await hidden(await serveApprovedArt(request(), identity(), grant.artId,
      bucket(() => object({ customMetadata: { ...object().customMetadata!, sha256: hash } }, changed)), async () => alteredGrant, { nowMs }));
  }
});

test('truncated or oversized body cannot bypass the declared object size', async () => {
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(() => object({}, png.slice(0, -1))), async () => grant, { nowMs }));
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(png.byteLength + 1)); },
    cancel() { cancelled = true; },
  });
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(() => object({ body: oversized })), async () => grant, { nowMs }));
  assert.equal(cancelled, true);
});

test('grant revoked or round changed during R2 read cannot return previously authorized bytes', async () => {
  for (const next of [null, { ...grant, policyVersion: 'changed-policy' }, { ...grant, ownerSubject: 'fixture:new-owner' }]) {
    let authorizations = 0;
    await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(), async () => ++authorizations === 1 ? grant : next, { nowMs }));
    assert.equal(authorizations, 2);
  }
});

test('expiry is checked after R2 read and after the final authorization await', async () => {
  const claims = identity();
  await hidden(await serveApprovedArt(request(), claims, grant.artId, bucket(() => {
    claims.expiresAt = nowMs;
    return object();
  }), async () => grant, { nowMs }));
  const second = identity();
  let authorizations = 0;
  await hidden(await serveApprovedArt(request(), second, grant.artId, bucket(), async () => {
    if (++authorizations === 2) second.expiresAt = nowMs;
    return grant;
  }, { nowMs }));
});

test('HEAD verifies authorization and approved bytes but emits no body', async () => {
  const response = await serveApprovedArt(request('HEAD'), identity(), grant.artId, bucket(), async () => grant, { nowMs });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(png.byteLength));
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('storage and policy failures never expose internal object keys or approval details', async () => {
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, {
    async get() { throw new Error(`R2 failed for ${grant.objectKey}`); },
  }, async () => grant, { nowMs }));
  await hidden(await serveApprovedArt(request(), identity(), grant.artId, bucket(), async () => {
    throw new Error(`Owner ${grant.ownerSubject} revoked policy ${grant.policyVersion}`);
  }, { nowMs }));
});
