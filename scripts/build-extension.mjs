import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const EXTENSION_FILES = Object.freeze([
  'viewer.html', 'config.html', 'styles.css', 'runtime-config.js',
  'client.js', 'viewer.js', 'config.js',
  'assets/bait-bomb.png', 'assets/inter-latin.woff2', 'assets/russo-one.ttf',
  'assets/Inter-OFL.txt', 'assets/RussoOne-OFL.txt',
]);
export const HELPER_URL = 'https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function within(root, path) {
  const part = relative(root, path);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}

export function publicConfig(clientId, apiBaseUrl, localPreview = false, studioBaseUrl = apiBaseUrl) {
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9]{6,64}$/.test(clientId))
    throw new Error('TWITCH_EXTENSION_CLIENT_ID must be a resolved alphanumeric client ID.');
  let url;
  try { url = new URL(apiBaseUrl); }
  catch { throw new Error('EXTENSION_API_BASE_URL must be an HTTPS origin.'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(localPreview && loopback && url.protocol === 'http:')))
    throw new Error('EXTENSION_API_BASE_URL must be an HTTPS origin without credentials, path, query or fragment. Only --local-preview permits loopback HTTP.');
  let studio;
  try { studio = new URL(studioBaseUrl); }
  catch { throw new Error('EXTENSION_STUDIO_BASE_URL must be an HTTPS or localhost HTTP origin.'); }
  const localStudio = ['127.0.0.1', 'localhost', '[::1]'].includes(studio.hostname);
  if (studio.username || studio.password || studio.pathname !== '/' || studio.search || studio.hash ||
      (studio.protocol !== 'https:' && !(localStudio && studio.protocol === 'http:')))
    throw new Error('EXTENSION_STUDIO_BASE_URL must be an HTTPS or localhost HTTP origin without credentials, path, query or fragment.');
  return Object.freeze({ clientId, apiBaseUrl: url.origin, studioBaseUrl: studio.origin });
}

export function runtimeConfigSource(config) {
  const publicFields = { clientId: config.clientId, apiBaseUrl: config.apiBaseUrl,
    studioBaseUrl: config.studioBaseUrl ?? config.apiBaseUrl };
  return `// Public Extension configuration. No credentials belong in this file.\nwindow.BAITED_EXTENSION_CONFIG = Object.freeze(${JSON.stringify(publicFields)});\n`;
}

export async function readFrontendFile(file, sourceDir = resolve(project, 'extension')) {
  if (!EXTENSION_FILES.includes(file)) throw new Error('File is not part of the Extension bundle.');
  for (const path of [sourceDir, ...(file.startsWith('assets/') ? [resolve(sourceDir, 'assets')] : []), resolve(sourceDir, file)]) {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Extension source files must not be symlinks.');
  }
  const root = await realpath(sourceDir);
  const target = await realpath(resolve(sourceDir, file));
  if (!within(root, target)) throw new Error('Extension source file escapes its directory.');
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await realpath(`/proc/self/fd/${handle.fd}`);
    const stat = await handle.stat();
    if (!within(root, opened) || !stat.isFile() || stat.size > 5 * 1024 * 1024)
      throw new Error('Invalid Extension source file.');
    return await handle.readFile();
  } finally { await handle?.close(); }
}

async function verifyOutputDirectory(root, prefix = '') {
  let files;
  try { files = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of files) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Build output must not contain symlinks.');
    if (entry.isDirectory() && name === 'assets') await verifyOutputDirectory(resolve(root, entry.name), 'assets/');
    else if (!entry.isFile() || !EXTENSION_FILES.includes(name))
      throw new Error('Build output contains unrelated files. Choose a dedicated empty Extension output directory.');
  }
}

export async function buildExtension({ sourceDir = resolve(project, 'extension'), outDir, zipPath, clientId, apiBaseUrl, studioBaseUrl, localPreview = false }) {
  const config = publicConfig(clientId, apiBaseUrl, localPreview, studioBaseUrl);
  if ((await lstat(sourceDir)).isSymbolicLink()) throw new Error('Extension source files must not be symlinks.');
  const source = await realpath(sourceDir);
  outDir = resolve(outDir);
  zipPath = resolve(zipPath);
  if (outDir === source || within(source, outDir) || within(outDir, source) ||
      !zipPath.endsWith('.zip') || zipPath === source || within(source, zipPath) || within(outDir, zipPath))
    throw new Error('Choose a dedicated output directory and a separate .zip path outside Extension sources.');
  await verifyOutputDirectory(outDir);
  const entries = [];
  for (const file of EXTENSION_FILES) {
    // The source placeholder is never copied, and no environment is serialized.
    const data = file === 'runtime-config.js'
      ? Buffer.from(runtimeConfigSource(config))
      : await readFrontendFile(file, source);
    if (file.endsWith('.html')) {
      const firstScript = data.toString().match(/<script\b([^>]*)>/i);
      const source = firstScript?.[1].match(/\bsrc=["']([^"']+)["']/i);
      if (source?.[1] !== HELPER_URL)
        throw new Error('The official Twitch Helper must be the first script in every Extension HTML entry.');
    }
    entries.push([file, data]);
  }
  await mkdir(outDir, { recursive: true });
  if ((await lstat(outDir)).isSymbolicLink()) throw new Error('Build output must not be a symlink.');
  for (const [file, data] of entries) {
    const target = resolve(outDir, file);
    await mkdir(dirname(target), { recursive: true });
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
    try { await handle.writeFile(data); } finally { await handle.close(); }
  }
  await mkdir(dirname(zipPath), { recursive: true });
  try { if (!(await lstat(zipPath)).isFile()) throw new Error('ZIP output must be a regular file.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Fixed timestamps, permissions, ordering and compression make repeated builds identical.
  const zip = spawnSync('python3', ['-c',
    'import json,pathlib,sys,zipfile\nroot=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:\n for name in sorted(json.loads(sys.argv[3])):\n  info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))\n  info.create_system=3\n  info.external_attr=(0o100644<<16)\n  info.compress_type=zipfile.ZIP_DEFLATED\n  z.writestr(info,(root/name).read_bytes(),compresslevel=9)\n',
    outDir, zipPath, JSON.stringify(EXTENSION_FILES)], { encoding: 'utf8' });
  if (zip.status !== 0) throw new Error('ZIP creation failed. Python 3 with zipfile is required.');
  const zipFile = await open(zipPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try { bytes = await zipFile.readFile(); } finally { await zipFile.close(); }
  return { version: '0.0.1', mode: localPreview ? 'local-preview' : 'installable', outDir, zipPath,
    files: EXTENSION_FILES.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  const args = process.argv.slice(2);
  let localPreview = false, outDir, zipPath;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local-preview') localPreview = true;
    else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
    else if (args[i] === '--zip' && args[i + 1]) zipPath = args[++i];
    else throw new Error('Usage: node scripts/build-extension.mjs [--local-preview] [--out-dir PATH] [--zip PATH]');
  }
  const suffix = localPreview ? '-local-preview' : '';
  const result = await buildExtension({ outDir: outDir || resolve(project, `dist/extension${suffix}`),
    zipPath: zipPath || resolve(project, `dist/baited-v0.0.1${suffix}.zip`), localPreview,
    clientId: process.env.TWITCH_EXTENSION_CLIENT_ID, apiBaseUrl: process.env.EXTENSION_API_BASE_URL,
    studioBaseUrl: process.env.EXTENSION_STUDIO_BASE_URL });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
