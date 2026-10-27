import { createServer } from 'node:http';
import { constants, readFileSync } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { previewHost, validatePreviewHost } from './preview-host.mjs';
import {
  EXTENSION_FILES,
  HELPER_URL,
  readFrontendFile,
  runtimeConfigSource,
} from './build-extension.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureClientId = 'baitedlocalpreview0001';
const catalogue = JSON.parse(readFileSync(new URL('../shared/card-review-catalogue.json', import.meta.url), 'utf8'));
const fixtures = new Set([
  'idle',
  'active',
  'hard',
  'paused',
  'settling',
  'review',
  'caught',
  'escaped',
  'unconfigured',
  'broadcaster',
  'reconnect',
  'error',
  'longword',
  'kaleidoscope',
  'archipelago',
  'dinosaur',
  'marshmallow',
  'alchemy',
]);
const harness = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/__preview/styles.css', 'styles.css'],
  ['/__preview/workbench.js', 'workbench.js'],
  ['/__preview/helper.js', 'helper.js'],
]);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
]);
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
};

function requestPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('#'))
    return null;
  try {
    const path = raw.split('?')[0];
    if (/%2f|%5c/i.test(path)) return null;
    const decoded = decodeURIComponent(path);
    if (decoded === '/') return decoded;
    return decoded
      .slice(1)
      .split('/')
      .every((part) => /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(part))
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function fixtureIdentity(authorization) {
  if (
    typeof authorization !== 'string' ||
    authorization.length > 2048 ||
    !authorization.startsWith('Bearer ')
  )
    return null;
  const pieces = authorization.slice(7).split('.');
  if (pieces.length !== 3 || pieces[2] !== 'fixture-only') return null;
  try {
    const payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString());
    if (
      !fixtures.has(payload.fixture) ||
      !['viewer', 'broadcaster'].includes(payload.role) ||
      !Number.isSafeInteger(payload.previewAt) ||
      Math.abs(Date.now() - payload.previewAt) > 18000000
    )
      return null;
    return { mode: payload.fixture, role: payload.role, at: payload.previewAt };
  } catch {
    return null;
  }
}

export function fixtureState(mode, role, at, now = Date.now()) {
  if (mode === 'unconfigured') return { version: '0.0.1', configured: false, room: null };
  const phase = ['caught', 'escaped', 'review'].includes(mode)
    ? 'cooldown'
    : ['idle', 'paused', 'settling'].includes(mode)
      ? mode
      : 'active';
  const duration = 90000;
  const remaining = phase === 'paused' ? 26000 : Math.max(0, duration - (now - at));
  const example = catalogue.find(entry => entry.word === mode) ?? catalogue.find(entry => entry.word === 'volcano');
  const target = mode === 'longword' ? 'ANTIDISESTABLISHMENTARIANISM' : example.word.toUpperCase();
  const difficulty = mode === 'hard' ? 'hard' : mode === example.word ? example.difficulty : 'medium';
  const round = ['active', 'paused', 'settling'].includes(phase)
    ? {
        id: 'fixture-round',
        number: 7,
        duration,
        remaining: phase === 'settling' ? 0 : remaining,
        endsAt: phase === 'active' ? at + duration : null,
        settleUntil: phase === 'settling' ? at + 6000 : null,
        epoch: 1,
        difficulty,
        guessEnabled: false,
        guessUsed: false,
        wrongGuessBonus: 0,
        ...(role !== 'broadcaster'
          ? {
              target,
              forbiddenClues:
                mode === 'longword'
                  ? ['establishment', 'constitutional', 'disestablishment']
                  : example.clues.slice(0, { easy: 0, medium: 2, hard: 4 }[difficulty]),
              ...(mode === 'longword' ? {} : { ink: example.ink, example: example.example }),
            }
          : {}),
      }
    : null;
  // A confirmed catch lands chat's streak on five, the On fire badge.
  const result =
    phase === 'cooldown'
      ? {
          id: `fixture-${mode}`,
          number: 7,
          word: target,
          outcome: mode,
          elapsed: 32,
          participants: 12,
          at: now - 1000,
          ...(mode === 'caught' ? { milestone: 5, newBadge: true } : {}),
        }
      : null;
  const streak = mode === 'caught' ? 5 : ['escaped', 'review'].includes(mode) ? 0 : 4;
  return {
    version: '0.0.1',
    configured: true,
    room: {
      id: 'fixture-room',
      mode: 'demo',
      channel: 'preview_channel',
      phase,
      serverTime: now,
      round,
      result,
      history: [],
      settings: {
        difficulty,
        duration,
        cooldown: 8000,
        auto: false,
        skipVotes: 3,
        sound: false,
        mission: 'single',
        missionDuration: 180000,
        callBait: false,
      },
      score: { wins: 9, played: 12, streak, best: 5 },
      participants: 12,
      voters: 1,
      voteThreshold: 3,
      leaders: [],
      connection: { status: 'connected', detail: 'Local fixture. No Twitch connection.' },
      mic: 'off',
      nextAt: null,
      mission: null,
      violations: 0,
    },
  };
}

async function readHarness(file) {
  const root = await realpath(resolve(project, 'scripts/extension-preview'));
  const target = resolve(root, file);
  if ((await realpath(target)) !== target) throw new Error('Invalid preview asset.');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if ((await realpath(`/proc/self/fd/${handle.fd}`)) !== target)
      throw new Error('Invalid preview asset.');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export function createExtensionPreviewServer({ host: requestedHost = '127.0.0.1' } = {}) {
  const previewAddress = validatePreviewHost(requestedHost);
  function reply(
    req,
    res,
    status,
    body = '',
    contentType = 'text/plain; charset=utf-8',
    extra = {},
  ) {
    const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
    res.writeHead(status, {
      ...headers,
      'Content-Type': contentType,
      'Content-Length': data.length,
      ...extra,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  }
  async function serve(req, res) {
    const address = server.address();
    const host = `${previewAddress}:${address && typeof address === 'object' ? address.port : ''}`;
    const origin = `http://${host}`;
    if (req.headers.host !== host)
      return reply(req, res, 421, 'Open the preview with its configured address.');
    if (!['GET', 'HEAD'].includes(req.method))
      return reply(req, res, 405, '', undefined, { Allow: 'GET, HEAD' });
    const path = requestPath(req.url);
    if (!path) return reply(req, res, 400, 'Invalid request.');
    if (req.headers.origin && req.headers.origin !== origin)
      return reply(req, res, 403, 'Preview origin rejected.');
    if (path === '/api/extension/state' || path === '/api/extension/config') {
      const identity = fixtureIdentity(req.headers.authorization);
      if (!identity)
        return reply(
          req,
          res,
          401,
          JSON.stringify({ error: 'Local preview authorization required.' }),
          'application/json',
        );
      const { mode, role, at } = identity;
      const age = Date.now() - at;
      if (mode === 'error' || (mode === 'reconnect' && age >= 2000 && age < 8000))
        return reply(
          req,
          res,
          503,
          JSON.stringify({ error: 'Simulated connection interruption.' }),
          'application/json',
        );
      if (path.endsWith('/config') && role !== 'broadcaster')
        return reply(
          req,
          res,
          403,
          JSON.stringify({ error: 'Broadcaster configuration only.' }),
          'application/json',
        );
      const body = path.endsWith('/state')
        ? fixtureState(mode, role, at)
        : {
            version: '0.0.1',
            connected: mode !== 'unconfigured',
            channelId: '501062940',
            channelName: mode === 'unconfigured' ? null : 'preview_channel',
            studioUrl: `${origin}/studio`,
          };
      return reply(req, res, 200, JSON.stringify(body), 'application/json; charset=utf-8');
    }
    if (path === '/studio')
      return reply(
        req,
        res,
        200,
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Local fixture only</title><h1>This is the local fixture preview.</h1><p>The real broadcaster studio runs separately. This preview does not sign into Twitch, use a microphone or start a game.</p><p><a href="/">Return to preview</a></p></html>',
        'text/html; charset=utf-8',
      );
    if (harness.has(path)) {
      const file = harness.get(path);
      return reply(req, res, 200, await readHarness(file), mime.get(extname(file)));
    }
    const file = path.slice(1);
    if (!EXTENSION_FILES.includes(file)) return reply(req, res, 404, 'Not found.');
    let data =
      file === 'runtime-config.js'
        ? Buffer.from(
            runtimeConfigSource({
              clientId: fixtureClientId,
              apiBaseUrl: origin,
              studioBaseUrl: origin,
            }),
          )
        : await readFrontendFile(file);
    if (previewAddress !== '127.0.0.1' && file === 'client.js') {
      // Only the local harness adapts the transport. The shipped parser and ZIP stay strict.
      const source = data.toString();
      const parser = 'export function readRuntimeConfig(value) {';
      if (source.split(parser).length !== 2) throw new Error('Preview parser adaptation failed.');
      data = Buffer.from(source.replace(parser, 'function readStrictConfig(value) {') + `
export function readRuntimeConfig(value) {
  const origin = ${JSON.stringify(origin)};
  if (!value || value.apiBaseUrl !== origin || value.studioBaseUrl !== origin)
    throw new Error('Local preview service address is invalid.');
  const checked = readStrictConfig({ ...value, apiBaseUrl: 'http://127.0.0.1', studioBaseUrl: 'http://127.0.0.1' });
  return { ...checked, apiBaseUrl: origin, studioBaseUrl: origin };
}
`);
    }
    if (file.endsWith('.html'))
      data = Buffer.from(data.toString().replaceAll(HELPER_URL, '/__preview/helper.js'));
    return reply(req, res, 200, data, mime.get(extname(file)));
  }
  const server = createServer(
    (req, res) =>
      void serve(req, res).catch(() => {
        if (res.headersSent) res.destroy();
        else reply(req, res, 404, 'Preview asset unavailable.');
      }),
  );
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

function main() {
  const host = previewHost();
  const port = Number(process.env.EXTENSION_PREVIEW_PORT || 3322);
  const seconds = Number(process.env.EXTENSION_PREVIEW_SECONDS || 10800);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('EXTENSION_PREVIEW_PORT must be 1024 to 65535.');
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 18000)
    throw new Error('EXTENSION_PREVIEW_SECONDS must be 60 to 18000.');
  const server = createExtensionPreviewServer({ host });
  let lifetime;
  function stop() {
    clearTimeout(lifetime);
    server.close();
    server.closeAllConnections();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
  server.on('error', (error) => {
    clearTimeout(lifetime);
    console.error(
      error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : 'Extension preview failed.',
    );
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(
      `baited Extension fixture preview: http://${host}:${port}. No Twitch connection or microphone. Strict port; stops after ${seconds / 60} minutes or Ctrl+C.`,
    );
    lifetime = setTimeout(stop, seconds * 1000);
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
