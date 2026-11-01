import { constants, readFileSync } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const WHISPER_ASSET_LIMIT = 25 * 1024 * 1024;
export const WHISPER_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const OUTPUT_ROOT = '/run/media/maff/Game_Shared/agent-out-live';
export const whisperAssetLock = JSON.parse(readFileSync(new URL('./asset-lock.json', import.meta.url), 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const child = (root, path) => {
  const part = relative(root, path);
  return part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
};

function safeName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(name)
    && name.split('/').every((part) => part !== '.' && part !== '..');
}

/** Fixed lock paths only; reject symlinks and bound allocation before reading bytes. */
async function readBounded(root, name, maximum) {
  if (!safeName(name)) throw new Error('Invalid speech asset path.');
  let path = root;
  for (const part of name.split('/')) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Speech assets must not contain symlinks.');
  }
  const canonical = await realpath(path);
  if (!child(root, canonical)) throw new Error('Speech asset escaped its prepared directory.');
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 1 || info.size > maximum)
      throw new Error('Speech asset exceeds its bounded file size.');
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error('Speech asset changed while reading.');
      offset += bytesRead;
    }
    if ((await handle.read(Buffer.alloc(1), 0, 1, offset)).bytesRead)
      throw new Error('Speech asset grew while reading.');
    return bytes;
  } finally { await handle.close(); }
}

async function writeNew(root, name, bytes) {
  if (!safeName(name) || bytes.length > WHISPER_ASSET_LIMIT) throw new Error('Invalid packaged speech asset.');
  const target = resolve(root, name);
  if (!child(root, target)) throw new Error('Speech output escaped its directory.');
  let directory = root;
  for (const part of name.split('/').slice(0, -1)) {
    directory = join(directory, part);
    try { await mkdir(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory)
      throw new Error('Speech output must not contain symlinks.');
  }
  // Build output must be fresh; never follow or overwrite an existing link/file.
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
}

/** Explicit build opt-in. Original prepared assets are never modified or downloaded. */
export async function packageWhisperAssets(source, output, options = {}) {
  const expected = options.lock ?? whisperAssetLock;
  const root = resolve(output, 'speech-bench-assets');
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root)
    throw new Error('Speech output must not contain symlinks.');
  const available = Boolean(source);
  const availability = { available, model: expected.model, revision: expected.revision,
    totalBytes: available ? expected.files.reduce((total, file) => total + file.bytes, 0) : 0 };
  if (!available) {
    await writeNew(root, 'availability.json', Buffer.from(`${JSON.stringify(availability, null, 2)}\n`));
    return availability;
  }
  if (!isAbsolute(source)) throw new Error('Use an absolute prepared speech asset directory.');
  const prepared = await realpath(source);
  const allowedRoot = await realpath(options.sourceRoot ?? OUTPUT_ROOT);
  if (!child(allowedRoot, prepared)) throw new Error('Prepared speech assets must stay in registered agent output.');
  const manifest = JSON.parse((await readBounded(prepared, 'manifest.json', 64 * 1024)).toString('utf8'));
  const fields = ['format', 'model', 'revision', 'transformers', 'onnx', 'dtype', 'device'];
  if (!manifest || fields.some((field) => manifest[field] !== expected[field]) || !Array.isArray(manifest.files)
    || manifest.files.length !== expected.files.length) throw new Error('Prepared speech manifest does not match the pinned lock.');
  const files = [];
  for (const asset of expected.files) {
    if (!safeName(asset.path) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > MAX_SOURCE_BYTES
      || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid pinned speech asset.');
    const matches = manifest.files.filter((file) => file?.path === asset.path);
    if (matches.length !== 1 || ['bytes', 'sha256', 'source'].some((key) => matches[0][key] !== asset[key]))
      throw new Error('Prepared speech manifest metadata does not match the pinned lock.');
    const bytes = await readBounded(prepared, asset.path, asset.bytes);
    if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error(`Speech asset verification failed: ${asset.path}`);
    if (bytes.length <= WHISPER_ASSET_LIMIT) {
      await writeNew(root, asset.path, bytes);
      files.push({ ...asset });
    } else {
      const chunks = [];
      for (let offset = 0, index = 0; offset < bytes.length; offset += WHISPER_CHUNK_BYTES, index++) {
        const part = bytes.subarray(offset, Math.min(offset + WHISPER_CHUNK_BYTES, bytes.length));
        const name = `chunks/${asset.sha256}-${index}.bin`;
        await writeNew(root, name, part);
        chunks.push({ path: name, bytes: part.length, sha256: digest(part) });
      }
      files.push({ ...asset, chunks });
    }
  }
  await writeNew(root, 'manifest.json', Buffer.from(`${JSON.stringify({ ...expected, transport: 'chunked-static-v1', files }, null, 2)}\n`));
  // Availability is last: a partial/failed package can never advertise a ready model.
  await writeNew(root, 'availability.json', Buffer.from(`${JSON.stringify(availability, null, 2)}\n`));
  return availability;
}
