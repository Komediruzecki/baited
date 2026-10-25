import { request as httpRequest } from 'node:http';
import { createServer } from 'node:https';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXTENSION_FILES, HELPER_URL, readFrontendFile } from './build-extension.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPaths = new Set(['/api/extension/state', '/api/extension/config']);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};
const policy = [
  "default-src 'none'", "script-src 'self' https://extension-files.twitch.tv",
  "style-src 'self'", "img-src 'self'", "font-src 'self'", "connect-src 'self'",
  "base-uri 'none'", "form-action 'none'",
  'frame-ancestors https://twitch.tv https://*.twitch.tv',
].join('; ');

function respond(res, status, message) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

export async function loadExtensionFiles(directory, origin = 'https://localhost:3443') {
  const files = new Map();
  for (const name of EXTENSION_FILES) {
    const content = await readFrontendFile(name, directory);
    if (name.endsWith('.html')) {
      const firstScript = content.toString().match(/<script\b([^>]*)>/i);
      const source = firstScript?.[1].match(/\bsrc=["']([^"']+)["']/i);
      if (source?.[1] !== HELPER_URL)
        throw new Error('Build the native Extension with the official Twitch Helper before serving it.');
    }
    if (name === 'runtime-config.js') {
      const match = content.toString().match(/window\.BAITED_EXTENSION_CONFIG\s*=\s*Object\.freeze\((\{[^\n]*\})\);/);
      let config;
      try { config = match && JSON.parse(match[1]); } catch { /* Reject below. */ }
      if (!config || config.apiBaseUrl !== origin || !/^[a-zA-Z0-9]{6,64}$/.test(config.clientId))
        throw new Error('Build the Extension with its client ID and this local HTTPS API origin before serving it.');
    }
    files.set(`/${name}`, content);
  }
  return files;
}

function singleHeader(req, name) {
  return req.rawHeaders.filter((_, index) => index % 2 === 0)
    .filter((header) => header.toLowerCase() === name).length <= 1;
}

function requestPath(raw) {
  // Inspect the raw request target before URL normalization can remove dot segments.
  if (!raw || raw.length > 2048 || !raw.startsWith('/') || raw.startsWith('//') ||
      /[\\#\x00-\x20\x7f]/.test(raw)) return null;
  const separator = raw.indexOf('?');
  const path = separator === -1 ? raw : raw.slice(0, separator);
  if (path !== '/' && !path.slice(1).split('/').every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part))) return null;
  if (separator !== -1) {
    if (!['/viewer.html', '/config.html'].includes(path)) return null;
    // Twitch appends these public environment hints. They never authorize an API request.
    // https://dev.twitch.tv/docs/extensions/reference/#client-query-parameters
    const allowed = {
      anchor: /^(component|panel|video_overlay)$/,
      language: /^[a-zA-Z0-9_-]{1,32}$/,
      locale: /^[a-zA-Z0-9_-]{1,32}$/,
      mode: /^(config|dashboard|viewer)$/,
      platform: /^(mobile|web)$/,
      popout: /^(true|false)$/,
      state: /^(testing|hosted_test|approved|released|ready_for_review|in_review|pending_action|uploading)$/,
    };
    const seen = new Set();
    for (const [name, value] of new URLSearchParams(raw.slice(separator + 1))) {
      if (!Object.hasOwn(allowed, name) || !allowed[name].test(value) || seen.has(name)) return null;
      seen.add(name);
    }
  }
  return path === '/' ? '/viewer.html' : path;
}

export function createExtensionLocalHandler({ files, port = 3443, requestUpstream = httpRequest }) {
  const expectedHost = `localhost:${port}`;
  const origin = `https://${expectedHost}`;
  return (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', policy);
    if (req.headers.host !== expectedHost || !singleHeader(req, 'host'))
      return respond(res, 403, 'Unexpected local host.');
    const path = requestPath(req.url);
    if (!path) return respond(res, 400, 'Invalid request path.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS');
      return respond(res, 405, 'Read-only local Extension server.');
    }
    if (req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0'))
      return respond(res, 400, 'Request bodies are not supported.');
    if (!apiPaths.has(path)) {
      if (req.method === 'OPTIONS') return respond(res, 405, 'Preflight is available only for Extension API routes.');
      const body = files.get(path);
      if (!body) return respond(res, 404, 'Not found.');
      res.writeHead(200, { 'Content-Type': mimeTypes[extname(path)], 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (!['origin', 'authorization', 'access-control-request-method', 'access-control-request-headers']
      .every((header) => singleHeader(req, header))) return respond(res, 400, 'Duplicate authorization or origin headers.');
    if (req.headers.origin !== undefined && req.headers.origin !== origin)
      return respond(res, 403, 'Unexpected Extension origin.');
    const authorization = req.headers.authorization;
    if (authorization !== undefined && (authorization.length > 4103 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)))
      return respond(res, 401, 'Invalid Extension authorization.');
    const headers = { Host: 'localhost:3000' };
    if (authorization) headers.Authorization = authorization;
    if (req.headers.origin) headers.Origin = req.headers.origin;
    if (req.method === 'OPTIONS') {
      if (req.headers.origin !== origin || req.headers['access-control-request-method'] !== 'GET' ||
          req.headers['access-control-request-headers']?.toLowerCase().trim() !== 'authorization')
        return respond(res, 403, 'Unsupported Extension preflight.');
      headers['Access-Control-Request-Method'] = 'GET';
      headers['Access-Control-Request-Headers'] = 'authorization';
    }
    // No incoming Host, Cookie, Forwarded, X-Forwarded-* or arbitrary path is forwarded.
    // This destination is intentionally not configurable through environment or requests.
    let upstream;
    try {
      upstream = requestUpstream({ protocol: 'http:', hostname: '127.0.0.1', port: 3000,
        method: req.method, path, headers, agent: false }, (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > 1024 * 1024) {
            upstream.destroy();
            respond(res, 502, 'Extension backend response exceeded the local limit.');
          } else chunks.push(chunk);
        });
        response.on('error', () => respond(res, 502, 'Extension backend unavailable.'));
        response.on('end', () => {
          if (res.destroyed || res.writableEnded) return;
          // Do not expose backend cookies, redirects or arbitrary headers to the iframe.
          const forwarded = { 'Content-Type': 'application/json; charset=utf-8' };
          if (response.headers['access-control-allow-origin'] === origin) forwarded['Access-Control-Allow-Origin'] = origin;
          for (const name of ['access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age', 'retry-after']) {
            const value = response.headers[name];
            if (typeof value === 'string' && value.length <= 128) forwarded[name] = value;
          }
          forwarded.Vary = 'Origin';
          const body = Buffer.concat(chunks);
          forwarded['Content-Length'] = body.length;
          res.writeHead(response.statusCode || 502, forwarded);
          res.end(req.method === 'HEAD' ? undefined : body);
        });
      });
      upstream.setTimeout(5000, () => {
        upstream.destroy();
        respond(res, 502, 'Extension backend timed out.');
      });
      upstream.on('error', () => respond(res, 502, 'Extension backend unavailable.'));
      res.once('close', () => upstream.destroy());
      upstream.end();
    } catch {
      upstream?.destroy();
      respond(res, 502, 'Extension backend unavailable.');
    }
  };
}

export async function main() {
  if (!process.env.EXTENSION_TLS_CERT || !process.env.EXTENSION_TLS_KEY)
    throw new Error('Local HTTPS requires EXTENSION_TLS_CERT and EXTENSION_TLS_KEY injected from Proton Pass.');
  const port = Number(process.env.EXTENSION_PORT || 3443);
  const seconds = Number(process.env.EXTENSION_PREVIEW_SECONDS || 10800);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(seconds) || seconds < 1 || seconds > 10800)
    throw new Error('Choose a valid local port and a lifetime of 1–10800 seconds.');
  const origin = `https://localhost:${port}`;
  let server;
  try {
    server = createServer({ cert: process.env.EXTENSION_TLS_CERT, key: process.env.EXTENSION_TLS_KEY,
      minVersion: 'TLSv1.2', maxHeaderSize: 16 * 1024 });
  } catch { throw new Error('The local TLS certificate or key is invalid. Recheck its Proton Pass fields.'); }
  let files;
  try { files = await loadExtensionFiles(resolve(process.env.EXTENSION_BUILD_DIR || resolve(project, 'dist/extension')), origin); }
  catch { throw new Error('Native Extension build missing or invalid. Rebuild with this HTTPS API origin; symlinks and preview stubs are not allowed.'); }
  server.on('request', createExtensionLocalHandler({ files, port }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  await new Promise((resolveListen, reject) => {
    server.once('error', () => reject(new Error('Could not listen on the requested local HTTPS port.')));
    server.listen(port, '127.0.0.1', resolveListen);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  };
  const timer = setTimeout(stop, seconds * 1000);
  timer.unref();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log(JSON.stringify({ localOnly: true, baseUri: `${origin}/`, viewerPath: 'viewer.html',
    configPath: 'config.html', backend: 'http://localhost:3000', expiresInSeconds: seconds,
    certificateTrust: 'Open the base URI and trust the local certificate before Twitch Local Test.' }));
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
