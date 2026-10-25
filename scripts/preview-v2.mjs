import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// This preview has no application routes, credentials, or network dependencies.
const project = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const concept = resolve(project, 'concepts/bait-v2');
const sharedAssets = resolve(project, 'concepts/bait-bomb/assets');
const cardProofs = resolve(project, 'public/cards/proofs');
const port = Number(process.env.V2_PORT || 3321);
const seconds = Number(process.env.V2_SECONDS || 10800);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('V2_PORT must be an integer from 1024 to 65535.');
}
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000) {
  throw new Error('V2_SECONDS must be an integer from 60 to 18000.');
}

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.json', 'application/json; charset=utf-8'],
  ['.vtt', 'text/vtt; charset=utf-8'],
]);
const aliases = new Map([
  ...[
    'bait-bomb-logo.png',
    'irchiinnuss-mark.svg',
    'irchiinnuss-wordmark.svg',
    'inter-latin.woff2',
    'russo-one.ttf',
  ].map((name) => [`/assets/${name}`, { root: sharedAssets, file: name }]),
  ...[
    'banana',
    'penguin',
    'microwave',
    'dragon',
    'volcano',
    'monocle',
    'pizza',
    'robot',
    'rocket',
    'pirate',
    'cactus',
    'jellyfish',
    'telescope',
    'saxophone',
    'octopus',
    'boomerang',
    'narwhal',
    'parachute',
  ].map((name) => [`/cards/proofs/${name}.png`, { root: cardProofs, file: `${name}.png` }]),
]);
const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function within(root, path) {
  const part = relative(root, path);
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}

function requestPath(url) {
  if (
    typeof url !== 'string' ||
    !url.startsWith('/') ||
    url.startsWith('//') ||
    url.includes('#')
  ) {
    return null;
  }
  try {
    const encodedPath = url.split('?')[0];
    if (/%2f|%5c/i.test(encodedPath)) return null;
    const path = decodeURIComponent(encodedPath);
    if (path === '/') return '/index.html';
    // Reject traversal before URL normalization, hidden files, and encoded separators.
    if (
      !path
        .slice(1)
        .split('/')
        .every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part))
    ) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}

function byteRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : null;
  const end = match[2] ? Number(match[2]) : null;
  if ([start, end].some((number) => number !== null && !Number.isSafeInteger(number))) return null;
  if (start === null) {
    return end > 0 ? { start: Math.max(0, size - end), end: size - 1 } : null;
  }
  if (start >= size || (end !== null && end < start)) return null;
  return { start, end: end === null ? size - 1 : Math.min(end, size - 1) };
}

function reply(req, res, status, message = '', headers = {}) {
  const body = Buffer.from(message);
  res.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    ...headers,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function serve(req, res) {
  if (req.headers.host !== `127.0.0.1:${port}`) {
    reply(req, res, 421, 'Open the preview with its 127.0.0.1 address.');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    reply(req, res, 405, '', { Allow: 'GET, HEAD' });
    return;
  }
  const path = requestPath(req.url);
  if (!path) {
    reply(req, res, 400, 'Invalid request.');
    return;
  }
  const contentType = mime.get(extname(path).toLowerCase());
  if (!contentType) {
    reply(req, res, 404, 'Not found.');
    return;
  }
  const entry = aliases.get(path) || { root: concept, file: path.slice(1) };
  let file;
  try {
    const root = await realpath(entry.root);
    if (root !== entry.root || !within(project, root)) throw new Error('Outside preview');
    const target = await realpath(resolve(entry.root, entry.file));
    if (!within(root, target)) throw new Error('Outside preview');
    file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    // Validate the opened descriptor as well, so a changed parent symlink cannot escape.
    const openedPath = await realpath(`/proc/self/fd/${file.fd}`);
    if (!within(root, openedPath)) throw new Error('Outside preview');
    const stat = await file.stat();
    if (!stat.isFile() || !Number.isSafeInteger(stat.size)) throw new Error('Not a file');
    let range = null;
    if (req.method === 'GET' && req.headers.range && !req.headers['if-range']) {
      range = byteRange(req.headers.range, stat.size);
      if (!range) {
        await file.close();
        file = null;
        reply(req, res, 416, '', { 'Content-Range': `bytes */${stat.size}` });
        return;
      }
    }
    res.writeHead(range ? 206 : 200, {
      ...securityHeaders,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': range ? range.end - range.start + 1 : stat.size,
      ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}` } : {}),
    });
    if (req.method === 'HEAD' || stat.size === 0) {
      await file.close();
      file = null;
      res.end();
      return;
    }
    const stream = file.createReadStream(range || {});
    file = null; // The stream owns and closes the descriptor, including on abort.
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    if (file) await file.close().catch(() => {});
    if (res.headersSent) res.destroy();
    else reply(req, res, 404, 'Not found.');
  }
}

const server = createServer((req, res) => {
  serve(req, res).catch(() => {
    if (res.headersSent) res.destroy();
    else reply(req, res, 500, 'Preview failed.');
  });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
let lifetime;
function stop() {
  clearTimeout(lifetime);
  server.close();
  server.closeAllConnections();
}
server.on('error', (error) => {
  clearTimeout(lifetime);
  console.error(
    error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : 'Preview failed.',
  );
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
server.listen(port, '127.0.0.1', () => {
  console.log(`BAIT v2: http://127.0.0.1:${port}. Stops after ${seconds / 60} minutes or Ctrl+C.`);
  lifetime = setTimeout(stop, seconds * 1000);
});
