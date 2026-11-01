import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import assetLock from './asset-lock.json';

const PREFIX = '/speech-bench-assets/';
const OUTPUT_ROOT = '/run/media/maff/Game_Shared/agent-out-live/';
export const SPEECH_ASSET_PATHS = new Set(['manifest.json', ...assetLock.files.map((file) => file.path)]);
type AssetLock = typeof assetLock;

/** Exact names plus realpath containment, including rejection of nested symlink escapes. */
export function resolveSpeechAsset(root: string, requestPath: string): string | null {
  let name: string;
  try { name = decodeURIComponent(requestPath.split('?')[0].slice(PREFIX.length)); }
  catch { return null; }
  if (!requestPath.startsWith(PREFIX) || !SPEECH_ASSET_PATHS.has(name)) return null;
  const candidate = resolve(root, name);
  if (!existsSync(candidate)) return null;
  const real = realpathSync(candidate);
  if (!real.startsWith(`${realpathSync(root)}${sep}`)) return null;
  const info = statSync(real);
  return info.isFile() && info.size <= 40 * 1024 * 1024 ? real : null;
}

/** The committed lock is authoritative, never the writable prepared manifest. */
export function verifySpeechAssets(root: string, expected: AssetLock = assetLock): void {
  const manifestPath = resolveSpeechAsset(root, `${PREFIX}manifest.json`);
  if (!manifestPath) throw new Error('Speech bench asset manifest is missing. Run prepare-speech-bench.py first.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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
      if (!root.startsWith(OUTPUT_ROOT)) throw new Error('Keep speech bench assets in a registered agent-out run, outside the repository.');
      verifySpeechAssets(root); // Fail startup before registering a route if any runtime/model bytes differ.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
        const file = resolveSpeechAsset(root, req.url);
        const relative = file?.slice(root.length + 1);
        if (!file || !relative || !SPEECH_ASSET_PATHS.has(relative)) { res.statusCode = 404; res.end('Speech bench asset not prepared.'); return; }
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : 'text/plain');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Length', statSync(file).size);
        if (req.method === 'HEAD') { res.end(); return; }
        const stream = createReadStream(file);
        stream.on('error', () => res.destroy());
        res.on('close', () => stream.destroy());
        stream.pipe(res);
      });
    },
  };
}
