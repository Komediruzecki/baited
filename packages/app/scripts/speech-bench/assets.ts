import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import assetLock from './asset-lock.json';

const PREFIX = '/speech-bench-assets/';
const OUTPUT_ROOT = '/run/media/maff/Game_Shared/agent-out-live';
export const SPEECH_ASSET_PATHS = new Set(['manifest.json', ...assetLock.files.map((file) => file.path)]);
type AssetLock = typeof assetLock;

function assetName(requestPath: string): string | null {
  let name: string;
  try { name = decodeURIComponent(requestPath.split('?')[0].slice(PREFIX.length)); }
  catch { return null; }
  return requestPath.startsWith(PREFIX) && SPEECH_ASSET_PATHS.has(name) ? name : null;
}

function isChild(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return Boolean(path) && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Exact URL names plus native-path containment, including nested symlink escapes. */
export function resolveSpeechAsset(root: string, requestPath: string): string | null {
  const name = assetName(requestPath);
  if (!name) return null;
  const candidate = resolve(root, name);
  if (!existsSync(candidate)) return null;
  const real = realpathSync(candidate);
  if (!isChild(realpathSync(root), real)) return null;
  const info = statSync(real);
  return info.isFile() && info.size <= 40 * 1024 * 1024 ? real : null;
}

/** Return exactly the checked bytes, so replacing a path cannot race a later stream open. */
function readLockedFile(file: string, expected: { bytes: number; sha256: string }): Buffer {
  const descriptor = openSync(file, 'r');
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size !== expected.bytes) throw new Error('Speech bench asset size changed. Restart with freshly prepared assets.');
    const bytes = Buffer.alloc(expected.bytes);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error('Speech bench asset changed while reading.');
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, offset) ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
      throw new Error('Speech bench asset checksum changed. Restart with freshly prepared assets.');
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

/** Recheck every response, including same-size replacements and the startup-pinned manifest. */
export function createSpeechAssetReader(root: string, expected: AssetLock = assetLock) {
  const manifest = verifySpeechAssets(root, expected);
  const lock = new Map(expected.files.map((asset) => [asset.path, asset]));
  const manifestLock = { bytes: manifest.length, sha256: createHash('sha256').update(manifest).digest('hex') };
  return (requestPath: string): { name: string; bytes: Buffer } | null => {
    const name = assetName(requestPath);
    const expectedFile = name === 'manifest.json' ? manifestLock : name ? lock.get(name) : null;
    if (!name || !expectedFile) return null;
    const file = resolveSpeechAsset(root, requestPath);
    if (!file) return null;
    return { name, bytes: readLockedFile(file, expectedFile) };
  };
}

/** The committed lock is authoritative, never the writable prepared manifest. */
export function verifySpeechAssets(root: string, expected: AssetLock = assetLock): Buffer {
  const manifestPath = resolveSpeechAsset(root, `${PREFIX}manifest.json`);
  if (!manifestPath) throw new Error('Speech bench asset manifest is missing. Run prepare-speech-bench.py first.');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const fields = ['format', 'model', 'revision', 'transformers', 'onnx', 'dtype', 'device'] as const;
  if (!manifest || fields.some((field) => manifest[field] !== expected[field]) || !Array.isArray(manifest.files) ||
    manifest.files.length !== expected.files.length) throw new Error('Speech bench manifest does not match the committed asset lock.');
  for (const asset of expected.files) {
    const matches = manifest.files.filter((file: { path?: unknown }) => file?.path === asset.path);
    if (matches.length !== 1 || matches[0].bytes !== asset.bytes || matches[0].sha256 !== asset.sha256 ||
      matches[0].source !== asset.source) throw new Error(`Speech bench manifest metadata does not match the lock: ${asset.path}`);
    const file = resolveSpeechAsset(root, `${PREFIX}${asset.path}`);
    if (!file || statSync(file).size !== asset.bytes) throw new Error(`Speech bench asset has the wrong size or is missing: ${asset.path}`);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== asset.sha256) {
      throw new Error(`Speech bench asset checksum failed: ${asset.path}. Preserve it and prepare a fresh asset directory.`);
    }
  }
  return manifestBytes;
}

/** Vite serve only. Nothing is added to public/, build output, or the Twitch ZIP. */
export function localSpeechBenchAssets(): Plugin {
  return {
    name: 'local-speech-bench-assets', apply: 'serve',
    configureServer(server) {
      const configured = process.env.BAITED_SPEECH_ASSET_DIR;
      if (!configured) return;
      if (!isAbsolute(configured) || !existsSync(configured)) throw new Error('BAITED_SPEECH_ASSET_DIR must be a prepared absolute asset directory.');
      const root = realpathSync(configured);
      if (!existsSync(OUTPUT_ROOT) || !isChild(realpathSync(OUTPUT_ROOT), root)) throw new Error('Keep speech bench assets in a registered agent-out run on this Linux host, outside the repository.');
      const readAsset = createSpeechAssetReader(root); // Fail closed before serving, and check each response again.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        try {
          const asset = readAsset(req.url);
          if (!asset) { res.statusCode = 404; res.end('Speech bench asset not prepared.'); return; }
          res.setHeader('Content-Type', asset.name.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(asset.name) ? 'text/javascript' : asset.name.endsWith('.json') ? 'application/json' : 'text/plain');
          res.setHeader('Content-Length', asset.bytes.length);
          res.end(req.method === 'HEAD' ? undefined : asset.bytes);
        } catch {
          res.statusCode = 503;
          res.end('Speech bench asset verification failed. Prepare a fresh asset directory and restart this preview.');
        }
      });
    },
  };
}
