import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createSpeechAssetReader, localSpeechBenchAssets, resolveSpeechAsset, verifySpeechAssets } from '../scripts/speech-bench/assets.js';
import assetLock from '../scripts/speech-bench/asset-lock.json';

test('speech assets are dev-serve only, never a build copy plugin', () => {
  assert.equal(localSpeechBenchAssets().apply, 'serve');
  assert.equal(localSpeechBenchAssets().generateBundle, undefined);
});

test('startup validation rejects corrupted runtime bytes even when the prepared manifest is rewritten', () => {
  const root = mkdtempSync(join(tmpdir(), 'baited-lock-test-'));
  try {
    mkdirSync(join(root, 'runtime'));
    const content = 'export const verified = 1;';
    const sha256 = createHash('sha256').update(content).digest('hex');
    const expected = { ...assetLock, files: [{ ...assetLock.files[0], bytes: content.length, sha256 }] };
    const path = join(root, 'runtime/transformers.min.js');
    const manifest = join(root, 'manifest.json');
    writeFileSync(path, content); writeFileSync(manifest, JSON.stringify(expected));
    verifySpeechAssets(root, expected);
    const corrupt = content.replace('1', '2');
    writeFileSync(path, corrupt);
    assert.throws(() => verifySpeechAssets(root, expected), /checksum failed/);
    writeFileSync(manifest, JSON.stringify({ ...expected, files: [{ ...expected.files[0], sha256: createHash('sha256').update(corrupt).digest('hex') }] }));
    assert.throws(() => verifySpeechAssets(root, expected), /manifest metadata does not match/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('startup validation rejects missing, oversized and mis-sized manifest entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'baited-size-test-'));
  try {
    mkdirSync(join(root, 'runtime'));
    const content = 'export {};';
    const expected = { ...assetLock, files: [{ ...assetLock.files[0], bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') }] };
    const manifest = join(root, 'manifest.json');
    writeFileSync(manifest, JSON.stringify(expected));
    assert.throws(() => verifySpeechAssets(root, expected), /wrong size or is missing/);
    writeFileSync(join(root, 'runtime/transformers.min.js'), content + ' ');
    assert.throws(() => verifySpeechAssets(root, expected), /wrong size or is missing/);
    writeFileSync(manifest, JSON.stringify({ ...expected, files: [{ ...expected.files[0], bytes: 99_999_999 }] }));
    assert.throws(() => verifySpeechAssets(root, expected), /manifest metadata does not match/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('each served response rejects same-size changes, resized files and a changed manifest after startup', () => {
  const root = mkdtempSync(join(tmpdir(), 'baited-response-test-'));
  try {
    mkdirSync(join(root, 'runtime'));
    const content = 'export const checked = 1;';
    const expected = { ...assetLock, files: [{ ...assetLock.files[0], bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex') }] };
    const runtime = join(root, 'runtime/transformers.min.js'), manifest = join(root, 'manifest.json');
    writeFileSync(runtime, content); writeFileSync(manifest, JSON.stringify(expected));
    const read = createSpeechAssetReader(root, expected);
    const verified = read('/speech-bench-assets/runtime/transformers.min.js')!;
    writeFileSync(runtime, content.replace('1', '2'));
    assert.throws(() => read('/speech-bench-assets/runtime/transformers.min.js'), /checksum changed/);
    assert.equal(verified.bytes.toString(), content, 'already verified response bytes cannot change with the file');
    writeFileSync(runtime, content + ' ');
    assert.throws(() => read('/speech-bench-assets/runtime/transformers.min.js'), /size changed/);
    writeFileSync(runtime, content);
    writeFileSync(manifest, JSON.stringify(expected).replace('tiny', 'tino'));
    assert.throws(() => read('/speech-bench-assets/manifest.json'), /checksum changed/);
    assert.equal(read('/speech-bench-assets/runtime/not-listed.js'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('preparation atomically replaces marker symlinks and hardlinks without altering their targets', () => {
  const root = mkdtempSync(join(tmpdir(), 'baited-atomic-test-'));
  try {
    const script = fileURLToPath(new URL('../scripts/prepare-speech-bench.py', import.meta.url));
    const code = `
from pathlib import Path
import os, sys
script, root = Path(sys.argv[1]), Path(sys.argv[2])
scope = {'__name__': 'test', '__file__': str(script)}
exec(compile(script.read_text(), str(script), 'exec'), scope)
prepared = root / 'prepared'
prepared.mkdir()
victim = root / 'preserve.txt'
victim.write_text('unchanged')
for name in ['manifest.json', 'NOTICES.md']:
    target = prepared / name
    target.symlink_to(victim)
    scope['atomic_write'](target, b'new marker', prepared)
    assert not target.is_symlink() and target.read_bytes() == b'new marker'
    assert victim.read_text() == 'unchanged'
target = prepared / 'hardlink.json'
os.link(victim, target)
scope['atomic_write'](target, b'new marker', prepared)
assert target.read_bytes() == b'new marker' and victim.read_text() == 'unchanged'
`;
    const result = spawnSync('python3', ['-c', code, script, root], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('asset resolver allows exact filenames, rejects traversal, malformed URLs and symlink escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'baited-speech-test-'));
  try {
    const assets = join(root, 'assets'); mkdirSync(assets);
    const manifest = join(assets, 'manifest.json'); writeFileSync(manifest, '{}');
    writeFileSync(join(root, 'outside.json'), '{}');
    assert.equal(resolveSpeechAsset(assets, '/speech-bench-assets/manifest.json'), manifest);
    assert.equal(resolveSpeechAsset(assets, '/speech-bench-assets/manifest.json?v=1'), manifest);
    for (const url of ['/speech-bench-assets/../outside.json', '/speech-bench-assets/%2e%2e%2foutside.json',
      '/speech-bench-assets/.env', '/speech-bench-assets/%', '/other/manifest.json', '/speech-bench-assets/runtime/unlisted.js']) {
      assert.equal(resolveSpeechAsset(assets, url), null, url);
    }
    mkdirSync(join(assets, 'runtime'));
    symlinkSync(join(root, 'outside.json'), join(assets, 'runtime', 'transformers.min.js'));
    assert.equal(resolveSpeechAsset(assets, '/speech-bench-assets/runtime/transformers.min.js'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
