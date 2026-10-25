import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// A separate, local-only static study. It cannot read game data or provider credentials.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../concepts/bait-bomb');
const port = Number(process.env.CONCEPT_PORT || 3319);
const seconds = Number(process.env.CONCEPT_SECONDS || 10800);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('CONCEPT_PORT must be an integer from 1024 to 65535.');
if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
  throw new Error('CONCEPT_SECONDS must be 60 to 18000.');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/scene.js', ['scene.js', 'text/javascript; charset=utf-8']],
  ['/assets/bait-bomb-logo.png', ['assets/bait-bomb-logo.png', 'image/png']],
  ['/assets/russo-one.ttf', ['assets/russo-one.ttf', 'font/ttf']],
  ['/assets/inter-latin.woff2', ['assets/inter-latin.woff2', 'font/woff2']],
  ...['banana', 'penguin', 'microwave'].map((word) => [`/cards/proofs/${word}.png`, [`../../public/cards/proofs/${word}.png`, 'image/png']]),
]);
const server = createServer((req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) {
    res.writeHead(421); res.end('Open the preview with its 127.0.0.1 address.'); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let pathname;
  try { pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname; }
  catch { res.writeHead(400); res.end('Invalid request.'); return; }
  const entry = files.get(pathname);
  if (!entry) { res.writeHead(404); res.end('Not found.'); return; }
  const source = createReadStream(resolve(root, entry[0]));
  source.on('error', () => { if (!res.headersSent) res.writeHead(404); res.end('Not found.'); });
  source.on('open', () => {
    res.writeHead(200, {
      'Content-Type': entry[1], 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    });
    if (req.method === 'HEAD') { source.destroy(); res.end(); }
    else source.pipe(res);
  });
});
let lifetime;
function stop() { clearTimeout(lifetime); server.close(); server.closeAllConnections(); }
server.on('error', error => { clearTimeout(lifetime); console.error(error.code || 'Preview failed'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
server.listen(port, '127.0.0.1', () => {
  console.log(`BAIT motion study: http://127.0.0.1:${port}. Strict loopback port; stops after ${seconds / 60} minutes or Ctrl+C.`);
  lifetime = setTimeout(stop, seconds * 1000);
});
