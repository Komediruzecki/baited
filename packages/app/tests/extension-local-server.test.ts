import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type RequestOptions, type Server } from 'node:http';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const gateway = await import(new URL('../scripts/serve-extension-local.mjs', import.meta.url).href);
const bundle = await import(new URL('../scripts/build-extension.mjs', import.meta.url).href);
const origin = 'https://localhost:3443';
const token = 'Bearer header.payload.signature';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return address.port;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
}

function get(port: number, path: string, headers: RequestOptions['headers'] = {}, method = 'GET') {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method,
      headers: Array.isArray(headers) ? headers : { Host: 'localhost:3443', ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('local gateway serves only its native bundle, pins Host and rejects unsafe raw paths', async () => {
  let proxied = 0;
  const handler = gateway.createExtensionLocalHandler({
    files: new Map([['/viewer.html', Buffer.from('native viewer')], ['/config.html', Buffer.from('native setup')], ['/styles.css', Buffer.from('body {}')]]),
    requestUpstream: () => { proxied++; throw new Error('unexpected'); },
  });
  const server = createServer(handler);
  const port = await listen(server);
  try {
    const index = await get(port, '/');
    assert.equal(index.status, 200);
    assert.equal(index.body, 'native viewer');
    assert.equal(index.headers['cache-control'], 'no-store');
    assert.match(index.headers['content-security-policy'] as string, /https:\/\/extension-files\.twitch\.tv/);
    assert.match(index.headers['content-security-policy'] as string, /frame-ancestors https:\/\/twitch.tv https:\/\/\*\.twitch.tv/);
    assert.equal((await get(port, '/viewer.html', {}, 'HEAD')).body, '');
    const twitchQuery = 'anchor=panel&language=en&locale=en-US&mode=viewer&platform=web&popout=false&state=testing';
    assert.equal((await get(port, `/viewer.html?${twitchQuery}`)).body, 'native viewer');
    assert.equal((await get(port, '/config.html?mode=config&platform=web&state=testing')).body, 'native setup');
    assert.equal((await get(port, '/viewer.html?mode=viewer&mode=config')).status, 400);
    assert.equal((await get(port, '/styles.css?mode=viewer')).status, 400);
    assert.equal((await get(port, '/viewer.html?language=%00')).status, 400);
    assert.equal((await get(port, '/', { Host: 'evil.example:3443' })).status, 403);
    assert.equal((await get(port, '/', { Host: '127.0.0.1:3443' })).status, 403);
    for (const path of ['/../viewer.html', '/%2e%2e/viewer.html', '/assets/%2fsecret', '/assets\\secret',
      '//evil.example/', '/.env', '/viewer.html?token=secret', '/viewer.html#fragment']) {
      assert.equal((await get(port, path)).status, 400, path);
    }
    for (const path of ['/preview.html', '/api/room', '/api/extension/state/other', '/scripts/serve-extension-local.mjs']) {
      assert.equal((await get(port, path)).status, 404, path);
    }
    assert.equal((await get(port, '/api/extension/state', {}, 'POST')).status, 405);
    assert.equal((await get(port, '/api/extension/state', { 'Content-Length': '2' })).status, 400);
    assert.equal(proxied, 0);
  } finally { await close(server); }
});

test('proxy fixes target and Host, forwards only validated authorization/origin and never cookies', async () => {
  const backendRequests: { method?: string; path?: string; headers: IncomingHttpHeaders }[] = [];
  const backend = createServer((req, res) => {
    backendRequests.push({ method: req.method, path: req.url, headers: req.headers });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'session=private',
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      Location: 'https://untrusted.example', 'X-Unrelated': 'private' });
    res.end(JSON.stringify({ configured: true }));
  });
  const backendPort = await listen(backend);
  const options: RequestOptions[] = [];
  const server = createServer(gateway.createExtensionLocalHandler({ files: new Map(),
    requestUpstream: (input: RequestOptions, callback: (response: IncomingMessage) => void) => {
      options.push(input);
      return request({ ...input, port: backendPort }, callback);
    },
  }));
  const port = await listen(server);
  try {
    const result = await get(port, '/api/extension/state', { Authorization: token, Origin: origin,
      Cookie: 'session=do-not-forward', Forwarded: 'host=evil.example', 'X-Forwarded-Host': 'evil.example',
      'X-Forwarded-For': '203.0.113.3', 'X-Forwarded-Proto': 'https', Referer: 'https://private.example' });
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { configured: true });
    assert.equal(options[0].hostname, '127.0.0.1');
    assert.equal(options[0].port, 3000);
    assert.equal(options[0].protocol, 'http:');
    assert.equal(options[0].path, '/api/extension/state');
    assert.equal(backendRequests[0].headers.host, 'localhost:3000');
    assert.equal(backendRequests[0].headers.authorization, token);
    assert.equal(backendRequests[0].headers.origin, origin);
    for (const header of ['cookie', 'forwarded', 'x-forwarded-host', 'x-forwarded-for', 'x-forwarded-proto', 'referer'])
      assert.equal(backendRequests[0].headers[header], undefined, header);
    for (const header of ['set-cookie', 'access-control-allow-credentials', 'location', 'x-unrelated'])
      assert.equal(result.headers[header], undefined, header);
    assert.equal(result.headers['access-control-allow-origin'], origin);
    assert.equal(result.headers['cache-control'], 'no-store');
    const head = await get(port, '/api/extension/config', { Authorization: token }, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(backendRequests[1].method, 'HEAD');
    assert.equal(backendRequests[1].path, '/api/extension/config');
    assert.equal(backendRequests[1].headers.origin, undefined);
  } finally { await close(server); await close(backend); }
});

test('native views permit Twitch supervisor ancestry while keeping resource origins restricted', async () => {
  const server = createServer(gateway.createExtensionLocalHandler({ files: new Map([
    ['/viewer.html', Buffer.from('native viewer')], ['/config.html', Buffer.from('native setup')],
  ]) }));
  const port = await listen(server);
  try {
    for (const path of ['/viewer.html?anchor=panel&mode=viewer&state=testing', '/config.html?mode=config&state=testing']) {
      const response = await get(port, path);
      assert.equal(response.status, 200);
      const directives = new Map((response.headers['content-security-policy'] as string)
        .split(';').map((part) => {
          const [name, ...sources] = part.trim().split(/\s+/);
          return [name, sources];
        }));
      // The known Twitch chain needs both the channel/dashboard and its supervisor.
      // No arbitrary ext-twitch.tv app, local page or non-HTTPS ancestor is permitted.
      assert.deepEqual(directives.get('frame-ancestors'), [
        'https://twitch.tv', 'https://*.twitch.tv', 'https://supervisor.ext-twitch.tv',
      ]);
      assert.deepEqual(directives.get('connect-src'), ["'self'"]);
      assert.deepEqual(directives.get('default-src'), ["'none'"]);
      assert.deepEqual(directives.get('script-src'), ["'self'", 'https://extension-files.twitch.tv']);
    }
  } finally { await close(server); }
});

test('proxy rejects cross-origin, malformed and duplicate credentials before contacting backend', async () => {
  let calls = 0;
  const server = createServer(gateway.createExtensionLocalHandler({ files: new Map(),
    requestUpstream: () => { calls++; throw new Error('unexpected'); } }));
  const port = await listen(server);
  try {
    for (const badOrigin of ['null', 'https://evil.example', 'https://supervisor.ext-twitch.tv', `${origin}/`, 'http://localhost:3443'])
      assert.equal((await get(port, '/api/extension/state', { Origin: badOrigin, Authorization: token })).status, 403);
    for (const authorization of ['Basic abc', 'Bearer missing-segments', `Bearer ${'x'.repeat(4100)}.b.c`])
      assert.equal((await get(port, '/api/extension/state', { Authorization: authorization })).status, 401);
    assert.equal((await get(port, '/api/extension/state?token=a.b.c', { Authorization: token })).status, 400);
    const duplicate = await get(port, '/api/extension/state', ['Host', 'localhost:3443', 'Authorization', token, 'Authorization', token]);
    assert.equal(duplicate.status, 400);
    assert.equal(calls, 0);
  } finally { await close(server); }
});

test('gateway handles exact authenticated GET preflight and does not broaden the API CORS policy', async () => {
  let forwarded: IncomingHttpHeaders | undefined;
  const backend = createServer((req, res) => {
    forwarded = req.headers;
    res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '300' });
    res.end();
  });
  const backendPort = await listen(backend);
  const server = createServer(gateway.createExtensionLocalHandler({ files: new Map(),
    requestUpstream: (input: RequestOptions, callback: (response: IncomingMessage) => void) => request({ ...input, port: backendPort }, callback) }));
  const port = await listen(server);
  const headers = { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' };
  try {
    const good = await get(port, '/api/extension/state', headers, 'OPTIONS');
    assert.equal(good.status, 204);
    assert.equal(good.headers['access-control-allow-origin'], origin);
    assert.equal(good.headers['access-control-allow-methods'], 'GET');
    assert.equal(forwarded?.['access-control-request-headers'], 'authorization');
    assert.equal((await get(port, '/api/extension/config', { ...headers, 'Access-Control-Request-Method': 'POST' }, 'OPTIONS')).status, 403);
    assert.equal((await get(port, '/api/extension/state', { ...headers, 'Access-Control-Request-Headers': 'authorization,cookie' }, 'OPTIONS')).status, 403);
    assert.equal((await get(port, '/api/extension/state', {}, 'OPTIONS')).status, 403);
  } finally { await close(server); await close(backend); }
});

test('opt-in diagnostics are sanitized and limited to 100 requests within five minutes', async () => {
  assert.equal(gateway.createExtensionDiagnostics(), null);
  let now = 1000;
  const lines: string[] = [];
  const diagnostics = gateway.createExtensionDiagnostics({ enabled: true,
    write: (line: string) => lines.push(line), now: () => now });
  const server = createServer(gateway.createExtensionLocalHandler({
    files: new Map([['/config.html', Buffer.from('native setup')]]), diagnostics,
  }));
  const port = await listen(server);
  try {
    await get(port, '/config.html?mode=config', { Authorization: token, Cookie: 'secret-cookie' });
    await get(port, '/config.html?secret-query=secret-value');
    await get(port, '/secret-path', { 'X-Secret-Header': 'secret-header-value' });
    assert.deepEqual(lines.map((line) => JSON.parse(line)), [
      { method: 'GET', path: '/config.html', queryPresent: true, status: 200 },
      { method: 'GET', path: '/config.html', queryPresent: true, status: 400 },
      { method: 'GET', path: '<unrecognized>', queryPresent: false, status: 404 },
    ]);
    assert.doesNotMatch(lines.join('\n'), /secret|Bearer|header\.payload/);
  } finally { await close(server); }
  const finish = (logger: typeof diagnostics, method = 'GET') => {
    const response = Object.assign(new EventEmitter(), { statusCode: 405 });
    logger({ method, url: '/config.html' }, response);
    response.emit('finish');
  };
  for (let index = 0; index < 110; index++) finish(diagnostics, 'SECRET-METHOD');
  assert.equal(lines.length, 100);
  assert.equal(JSON.parse(lines[99]).method, '<other>');
  const timed: string[] = [];
  const timedDiagnostics = gateway.createExtensionDiagnostics({ enabled: true,
    write: (line: string) => timed.push(line), now: () => now });
  now += 5 * 60 * 1000 - 1;
  finish(timedDiagnostics);
  const lateResponse = Object.assign(new EventEmitter(), { statusCode: 200 });
  timedDiagnostics({ method: 'GET', url: '/config.html' }, lateResponse);
  now += 1;
  lateResponse.emit('finish');
  finish(timedDiagnostics);
  assert.equal(timed.length, 1);
  const unavailableLogger = gateway.createExtensionDiagnostics({ enabled: true,
    write: () => { throw new Error('output unavailable'); } });
  assert.doesNotThrow(() => finish(unavailableLogger));
});

test('bundle loader rejects symlinks, preview Helpers and API origins that would bypass the gateway', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baited-extension-gateway-'));
  const html = `<script src="${bundle.HELPER_URL}"></script><script src="client.js"></script>`;
  try {
    for (const name of bundle.EXTENSION_FILES as string[]) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await writeFile(join(directory, name), name.endsWith('.html') ? html : name);
    }
    const config = bundle.runtimeConfigSource({ clientId: 'testclientid', apiBaseUrl: origin });
    await writeFile(join(directory, 'runtime-config.js'), config);
    const files = await gateway.loadExtensionFiles(directory, origin);
    assert.equal(files.size, bundle.EXTENSION_FILES.length);
    assert.equal(files.has('/preview.html'), false);
    await writeFile(join(directory, 'viewer.html'), '<script src="preview-stub.js"></script>');
    await assert.rejects(gateway.loadExtensionFiles(directory, origin), /official Twitch Helper/);
    await writeFile(join(directory, 'viewer.html'), html);
    await writeFile(join(directory, 'runtime-config.js'), bundle.runtimeConfigSource({ clientId: 'testclientid', apiBaseUrl: 'http://localhost:3000' }));
    await assert.rejects(gateway.loadExtensionFiles(directory, origin), /HTTPS API origin/);
    await writeFile(join(directory, 'runtime-config.js'), config);
    await rm(join(directory, 'styles.css'));
    await symlink(join(directory, 'client.js'), join(directory, 'styles.css'));
    await assert.rejects(gateway.loadExtensionFiles(directory, origin), /symlinks/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('gateway reports upstream errors generically and bounds response size', async () => {
  const backend = createServer((_, res) => { res.writeHead(200); res.end(Buffer.alloc(1024 * 1024 + 1)); });
  const backendPort = await listen(backend);
  const server = createServer(gateway.createExtensionLocalHandler({ files: new Map(),
    requestUpstream: (input: RequestOptions, callback: (response: IncomingMessage) => void) => request({ ...input, port: backendPort }, callback) }));
  const port = await listen(server);
  try {
    assert.equal((await get(port, '/api/extension/state', { Authorization: token })).status, 502);
    await close(backend);
    const unavailable = await get(port, '/api/extension/state', { Authorization: token });
    assert.equal(unavailable.status, 502);
    assert.equal(unavailable.body, 'Extension backend unavailable.');
  } finally { await close(server); if (backend.listening) await close(backend); }
});

test('CLI missing or invalid TLS material fails closed without echoing values', () => {
  const script = new URL('../scripts/serve-extension-local.mjs', import.meta.url);
  const env: NodeJS.ProcessEnv = { ...process.env, EXTENSION_DIAGNOSTICS: '1' };
  delete env.EXTENSION_TLS_CERT;
  delete env.EXTENSION_TLS_KEY;
  const missing = spawnSync(process.execPath, [script.pathname], { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /injected from Proton Pass/);
  const sentinel = 'TEST_ONLY_DO_NOT_ECHO_MALFORMED_TLS';
  const invalid = spawnSync(process.execPath, [script.pathname], { env: { ...env,
    EXTENSION_TLS_CERT: sentinel, EXTENSION_TLS_KEY: sentinel }, encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /local TLS certificate or key is invalid/);
  assert.equal(`${invalid.stdout}${invalid.stderr}`.includes(sentinel), false);
});
