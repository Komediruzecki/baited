import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageWhisperAssets, whisperAssetLock, WHISPER_ASSET_LIMIT, WHISPER_CHUNK_BYTES } from '../scripts/speech-bench/production-assets.mjs';

const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
async function fixture(bytes: Buffer) {
  const root = await mkdtemp(join(tmpdir(), 'baited-whisper-package-'));
  const source = join(root, 'source'), output = join(root, 'output');
  await mkdir(join(source, 'models'), { recursive: true });
  const lock = { ...whisperAssetLock, files: [{ path: 'models/test.onnx', bytes: bytes.length, sha256: hash(bytes), source: 'https://example.test/pinned' }] };
  await writeFile(join(source, 'models/test.onnx'), bytes);
  await writeFile(join(source, 'manifest.json'), JSON.stringify(lock));
  return { root, source, output, lock, options: { lock, sourceRoot: root } };
}

test('ordinary builds explicitly report unavailable without copying model files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-whisper-off-'));
  try {
    const result = await packageWhisperAssets(undefined, root);
    assert.equal(result.available, false); assert.equal(result.totalBytes, 0);
    assert.deepEqual(await readdir(join(root, 'speech-bench-assets')), ['availability.json']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('large verified assets split below the provider limit and reconstruct exactly', async () => {
  const bytes = Buffer.alloc(WHISPER_ASSET_LIMIT + 17, 23);
  const f = await fixture(bytes);
  try {
    const result = await packageWhisperAssets(f.source, f.output, f.options);
    assert.equal(result.available, true); assert.equal(result.totalBytes, bytes.length);
    const manifest = JSON.parse(await readFile(join(f.output, 'speech-bench-assets/manifest.json'), 'utf8'));
    assert.equal(manifest.transport, 'chunked-static-v1');
    assert.equal(manifest.files[0].sha256, hash(bytes));
    assert.equal(manifest.files[0].chunks.length, 2);
    const parts = [];
    for (const part of manifest.files[0].chunks) {
      assert.ok(part.bytes <= WHISPER_CHUNK_BYTES && part.bytes < WHISPER_ASSET_LIMIT);
      const data = await readFile(join(f.output, 'speech-bench-assets', part.path));
      assert.equal(data.length, part.bytes); assert.equal(hash(data), part.sha256); parts.push(data);
    }
    assert.deepEqual(Buffer.concat(parts), bytes);
    await assert.rejects(readFile(join(f.output, 'speech-bench-assets/models/test.onnx')), /ENOENT/);
    assert.deepEqual(await readFile(join(f.source, 'models/test.onnx')), bytes, 'source remains untouched');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

for (const fault of ['checksum', 'manifest-path', 'manifest-size', 'symlink', 'source-size'] as const) {
  test(`failed ${fault} validation never publishes available=true`, async () => {
    const f = await fixture(Buffer.from('verified bytes'));
    try {
      if (fault === 'checksum') await writeFile(join(f.source, 'models/test.onnx'), 'corrupt! bytes');
      if (fault === 'manifest-path') await writeFile(join(f.source, 'manifest.json'), JSON.stringify({ ...f.lock, files: [{ ...f.lock.files[0], path: '../private' }] }));
      if (fault === 'manifest-size') await writeFile(join(f.source, 'manifest.json'), ' '.repeat(65537));
      if (fault === 'source-size') await writeFile(join(f.source, 'models/test.onnx'), 'too many untrusted bytes');
      if (fault === 'symlink') {
        await rm(join(f.source, 'models/test.onnx'));
        await writeFile(join(f.root, 'outside'), 'verified bytes');
        await symlink(join(f.root, 'outside'), join(f.source, 'models/test.onnx'));
      }
      await assert.rejects(packageWhisperAssets(f.source, f.output, f.options));
      await assert.rejects(readFile(join(f.output, 'speech-bench-assets/availability.json')), /ENOENT/);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

test('packaging refuses source and destination escapes or overwriting existing files', async () => {
  const f = await fixture(Buffer.from('verified bytes'));
  try {
    await assert.rejects(packageWhisperAssets('relative/source', f.output, f.options), /absolute/);
    await assert.rejects(packageWhisperAssets(f.source, f.output, { ...f.options, sourceRoot: f.source }), /registered/);
    await packageWhisperAssets(f.source, f.output, f.options);
    await assert.rejects(packageWhisperAssets(f.source, f.output, f.options), /EEXIST/);
    await mkdir(join(f.root, 'linked-output'));
    await symlink(f.source, join(f.root, 'linked-output/speech-bench-assets'));
    await assert.rejects(packageWhisperAssets(undefined, join(f.root, 'linked-output')), /symlinks/);
    assert.equal(await readFile(join(f.source, 'models/test.onnx'), 'utf8'), 'verified bytes');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('packaging never follows a nested output directory symlink', async () => {
  const f = await fixture(Buffer.from('verified bytes'));
  try {
    await mkdir(join(f.output, 'speech-bench-assets'), { recursive: true });
    const outside = join(f.root, 'outside');
    await mkdir(outside);
    await symlink(outside, join(f.output, 'speech-bench-assets/models'));
    await assert.rejects(packageWhisperAssets(f.source, f.output, f.options), /symlinks/);
    assert.deepEqual(await readdir(outside), []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
