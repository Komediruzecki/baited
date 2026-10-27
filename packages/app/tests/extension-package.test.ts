import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { runInNewContext } from 'node:vm';

const { EXTENSION_FILES, HELPER_URL, buildExtension, extensionBuildPaths, publicConfig, readFrontendFile, runtimeConfigSource } =
  await import(new URL('../scripts/build-extension.mjs', import.meta.url).href);
const { createExtensionPreviewServer, fixtureState } =
  await import(new URL('../scripts/preview-extension.mjs', import.meta.url).href);
const clientId = 'baitedtestclient0001';

test('release defaults preserve v0.0.1 paths and v0.0.2 names its own artifact', () => {
  const legacy = extensionBuildPaths();
  assert.equal(legacy.version, '0.0.1');
  assert.equal(legacy.outDir, new URL('../dist/extension', import.meta.url).pathname);
  assert.equal(legacy.zipPath, new URL('../dist/baited-v0.0.1.zip', import.meta.url).pathname);
  const release = extensionBuildPaths({ version: '0.0.2' });
  assert.equal(release.version, '0.0.2');
  assert.equal(release.outDir, legacy.outDir);
  assert.equal(release.zipPath, new URL('../dist/baited-v0.0.2.zip', import.meta.url).pathname);
  const preview = extensionBuildPaths({ version: '0.0.2', localPreview: true });
  assert.equal(preview.outDir, new URL('../dist/extension-local-preview', import.meta.url).pathname);
  assert.equal(preview.zipPath, new URL('../dist/baited-v0.0.2-local-preview.zip', import.meta.url).pathname);
  assert.match(extensionBuildPaths({ version: '1.2.3-rc.1+build.5' }).zipPath,
    /baited-v1\.2\.3-rc\.1\+build\.5\.zip$/);
});

test('invalid release versions and path injection are rejected before any files are written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-version-safety-test-'));
  try {
    for (const version of ['', null, 2, 'v0.0.2', '0.0', '01.0.2', '0.0.2-01', '0.0.2 ', '0.0.2\n',
      '../../0.0.2', '0.0.2/escape', '0.0.2\\escape', '0.0.2?file=escape', '0.0.2+']) {
      await assert.rejects(buildExtension({ version, clientId, apiBaseUrl: 'https://api.example.test',
        outDir: join(root, 'output'), zipPath: join(root, 'result.zip') }), /valid SemVer/);
    }
    assert.deepEqual(await readdir(root), []);
    const missingVersion = spawnSync(process.execPath, [new URL('../scripts/build-extension.mjs', import.meta.url).pathname,
      '--version'], { encoding: 'utf8' });
    assert.equal(missingVersion.status, 1);
    assert.match(missingVersion.stderr, /Usage:.*--version SEMVER/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('versioned packaging still refuses source overlap and ZIP paths inside its output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-version-path-test-'));
  try {
    const sourceDir = new URL('../extension', import.meta.url).pathname;
    for (const paths of [
      { outDir: sourceDir, zipPath: join(root, 'release.zip') },
      { outDir: join(root, 'output'), zipPath: join(sourceDir, 'release.zip') },
      { outDir: join(root, 'output'), zipPath: join(root, 'output', 'release.zip') },
      { outDir: join(root, 'output'), zipPath: join(root, 'release.txt') },
    ]) {
      await assert.rejects(buildExtension({ version: '0.0.2', clientId,
        apiBaseUrl: 'https://api.example.test', ...paths }), /dedicated output directory/);
    }
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installable configuration rejects unresolved IDs, credentials and non-HTTPS API origins', () => {
  for (const id of [undefined, '', 'pass://dev/item/id', 'id-with-dashes', '<script>'])
    assert.throws(() => publicConfig(id, 'https://api.example.test'), /TWITCH_EXTENSION_CLIENT_ID/);
  for (const origin of [undefined, '', 'http://api.example.test', 'http://localhost:3443',
    'https://user:fixture-password@api.example.test', 'https://api.example.test/path',
    'https://api.example.test?token=fixture', 'https://api.example.test#fixture', 'file:///example']) {
    assert.throws(() => publicConfig(clientId, origin), /EXTENSION_API_BASE_URL/);
  }
  assert.deepEqual(publicConfig(clientId, 'https://api.example.test/'), {
    clientId, apiBaseUrl: 'https://api.example.test', studioBaseUrl: 'https://api.example.test',
  });
  assert.equal(publicConfig(clientId, 'http://127.0.0.1:3322', true).apiBaseUrl, 'http://127.0.0.1:3322');
  assert.throws(() => publicConfig(clientId, 'http://api.example.test', true), /HTTPS/);
});

test('studio origin is explicit and supports only HTTPS or loopback HTTP', () => {
  assert.equal(publicConfig(clientId, 'https://localhost:3443', false, 'http://localhost:3000').studioBaseUrl,
    'http://localhost:3000');
  for (const origin of ['http://studio.example.test', 'https://studio.example.test/studio',
    'https://user:fixture@studio.example.test', 'https://studio.example.test?token=fixture'])
    assert.throws(() => publicConfig(clientId, 'https://api.example.test', false, origin), /EXTENSION_STUDIO_BASE_URL/);
});

test('runtime configuration serializes only the three public fields', () => {
  const source = runtimeConfigSource({ ...publicConfig(clientId, 'https://api.example.test'),
    TWITCH_EXTENSION_SECRET: 'fixture-shared-secret', TOKEN_ENCRYPTION_KEY: 'fixture-encryption-key',
    processEnv: { another: 'fixture-private-value' } });
  assert.doesNotMatch(source, /fixture-shared-secret|fixture-encryption-key|fixture-private-value|processEnv/);
  assert.match(source, /studioBaseUrl/);
});

test('build creates deterministic ZIPs containing only explicit frontend files and public runtime config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-package-test-'));
  try {
    const opts = { clientId, apiBaseUrl: 'https://localhost:3443', studioBaseUrl: 'http://localhost:3000' };
    const first = await buildExtension({ ...opts, outDir: join(root, 'first'), zipPath: join(root, 'first.zip') });
    const second = await buildExtension({ ...opts, version: '0.0.2', outDir: join(root, 'second'), zipPath: join(root, 'second.zip') });
    assert.equal(first.version, '0.0.1');
    assert.equal(second.version, '0.0.2');
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.mode, 'installable');
    assert.deepEqual(await readFile(first.zipPath), await readFile(second.zipPath));
    const contents = spawnSync('python3', ['-c',
      'import json,sys,zipfile\nwith zipfile.ZipFile(sys.argv[1]) as z:\n print(json.dumps({"names":z.namelist(),"runtime":z.read("runtime-config.js").decode(),"viewer":z.read("viewer.html").decode(),"bad":z.testzip()}))', first.zipPath],
    { encoding: 'utf8' });
    assert.equal(contents.status, 0, contents.stderr);
    const data = JSON.parse(contents.stdout);
    assert.deepEqual(data.names, [...EXTENSION_FILES].sort());
    assert.equal(data.bad, null);
    assert.match(data.runtime, /http:\/\/localhost:3000/);
    assert.doesNotMatch(data.runtime, /clientId:\s*''|apiBaseUrl:\s*''|pass:\/\//);
    assert.ok(data.viewer.includes(HELPER_URL));
    assert.ok(data.names.includes('tokens.css'));
    assert.equal(data.names.includes('assets/bait-bomb.png'), false);
    assert.doesNotMatch(data.viewer, /__preview|fixture-only/);
    assert.equal(data.names.some((name: string) => /preview|fixture|node_modules|server|moonshine|\.env|DESIGN|PROVENANCE/.test(name)), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI --version emits the requested release receipt without changing the API schema', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-version-cli-test-'));
  try {
    const zipPath = join(root, 'baited-v0.0.2.zip');
    const build = spawnSync(process.execPath, [new URL('../scripts/build-extension.mjs', import.meta.url).pathname,
      '--version', '0.0.2', '--out-dir', join(root, 'output'), '--zip', zipPath], {
      encoding: 'utf8', env: { ...process.env, TWITCH_EXTENSION_CLIENT_ID: clientId,
        EXTENSION_API_BASE_URL: 'https://api.example.test', EXTENSION_STUDIO_BASE_URL: 'https://studio.example.test' },
    });
    assert.equal(build.status, 0, build.stderr);
    const receipt = JSON.parse(build.stdout);
    assert.equal(receipt.version, '0.0.2');
    assert.equal(receipt.zipPath, zipPath);
    assert.equal(receipt.mode, 'installable');
    const client = await readFile(join(root, 'output', 'client.js'), 'utf8');
    assert.match(client, /VERSION\s*=\s*['"]0\.0\.1['"]/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('packaging refuses unrelated output files and source symlinks without reading or deleting them', async () => {
  const root = await mkdtemp(join(tmpdir(), 'baited-package-safety-test-'));
  try {
    const outDir = join(root, 'output');
    await mkdir(outDir);
    await writeFile(join(outDir, 'keep.txt'), 'preserve this fixture');
    await assert.rejects(buildExtension({ clientId, apiBaseUrl: 'https://api.example.test', outDir,
      zipPath: join(root, 'result.zip') }), /unrelated files/);
    assert.equal(await readFile(join(outDir, 'keep.txt'), 'utf8'), 'preserve this fixture');
    const sourceDir = join(root, 'source');
    await mkdir(sourceDir);
    await symlink(join(outDir, 'keep.txt'), join(sourceDir, 'viewer.html'));
    await assert.rejects(readFrontendFile('viewer.html', sourceDir), /symlinks/);
    await assert.rejects(readFrontendFile('../keep.txt', sourceDir), /not part/);
    const linkedSource = join(root, 'linked-source');
    await symlink(sourceDir, linkedSource);
    await assert.rejects(buildExtension({ clientId, apiBaseUrl: 'https://api.example.test', sourceDir: linkedSource,
      outDir: join(root, 'safe-output'), zipPath: join(root, 'result.zip') }), /symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function fixtureToken(fixture = 'active', role = 'viewer', previewAt = Date.now()) {
  return `fixture.${Buffer.from(JSON.stringify({ fixture, role, previewAt })).toString('base64url')}.fixture-only`;
}

test('preview serves a bounded allowlist, requires exact Host/origin, and keeps stubs out of shipped HTML', async () => {
  const server = createExtensionPreviewServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  function get(path: string, options: { method?: string; headers?: Record<string, string> } = {}) {
    return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });
  }
  try {
    const index = await get('/');
    assert.equal(index.status, 200);
    assert.match(index.body, /Local fixture/i);
    assert.equal((await get('/', { headers: { Host: 'attacker.example' } })).status, 421);
    assert.equal((await get('/', { headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await get('/', { method: 'POST' })).status, 405);
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/.env', '/assets/%2fetc/passwd', '/%5cfoo', '//example.test'])
      assert.equal((await get(path)).status, 400, path);
    for (const path of ['/package.json', '/server/app.ts', '/scripts/preview-extension.mjs', '/extension/tests/client.test.js'])
      assert.equal((await get(path)).status, 404, path);
    const viewer = await get('/viewer.html');
    assert.equal(viewer.status, 200);
    assert.match(viewer.body, /\/__preview\/helper.js/);
    assert.equal(viewer.body.includes(HELPER_URL), false);
    assert.ok((await readFrontendFile('viewer.html')).toString().includes(HELPER_URL));
    const wordmark = await get('/assets/baited-original-mask.svg');
    assert.equal(wordmark.status, 200);
    assert.equal(wordmark.headers['content-type'], 'image/svg+xml');
    assert.match(wordmark.body, /BAITED original wordmark/);
    const runtime = await get('/runtime-config.js');
    assert.match(runtime.body, new RegExp(`http://127.0.0.1:${port}`));
    assert.match(runtime.body, /studioBaseUrl/);
    assert.equal((await get('/api/extension/state')).status, 401);
    const state = await get('/api/extension/state', { headers: { Authorization: `Bearer ${fixtureToken()}` } });
    assert.equal(state.status, 200);
    assert.equal(JSON.parse(state.body).room.round.target, 'VOLCANO');
    const broadcaster = await get('/api/extension/state', { headers: { Authorization: `Bearer ${fixtureToken('broadcaster', 'broadcaster')}` } });
    assert.equal('target' in JSON.parse(broadcaster.body).room.round, false);
    assert.equal((await get('/api/extension/config', { headers: { Authorization: `Bearer ${fixtureToken()}` } })).status, 403);
    assert.equal((await get('/api/extension/state', { headers: { Authorization: `Bearer ${fixtureToken('error')}` } })).status, 503);
    assert.equal((await get('/api/extension/state', { headers: { Authorization: `Bearer ${fixtureToken('reconnect', 'viewer', Date.now() - 4000)}` } })).status, 503);
    const config = await get('/api/extension/config', { headers: { Authorization: `Bearer ${fixtureToken('active', 'broadcaster')}` } });
    assert.equal(config.status, 200);
    assert.equal(JSON.parse(config.body).studioUrl, `http://127.0.0.1:${port}/studio`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
  }
});

test('fixture projections cover inactive, result, paused and unconfigured states', () => {
  assert.deepEqual(fixtureState('unconfigured', 'viewer', 0), { version: '0.0.1', configured: false, room: null });
  for (const mode of ['idle', 'caught', 'escaped', 'review']) {
    const room = fixtureState(mode, 'viewer', 0, 5000).room;
    assert.equal(room.round, null);
    assert.equal(room.result?.outcome ?? null, mode === 'idle' ? null : mode);
  }
  assert.equal(fixtureState('paused', 'viewer', 0, 10000).room.round.remaining, 26000);
  assert.equal(fixtureState('settling', 'viewer', 0, 10000).room.round.remaining, 0);
});

test('card review fixtures use real clues and preserve broadcaster secrecy', () => {
  assert.deepEqual(fixtureState('active', 'viewer', 0, 1000).room.round.forbiddenClues, ['lava', 'eruption']);
  const words = {
    kaleidoscope: ['patterns', 'mirrors', 'colors', 'colours'],
    archipelago: ['islands', 'ocean', 'chain', 'geography'],
    dinosaur: [],
    marshmallow: ['sugar', 'campfire'],
    alchemy: ['gold', 'transmutation', 'metal', 'elixir'],
  };
  for (const [word, clues] of Object.entries(words)) {
    const viewer = fixtureState(word, 'viewer', 0, 1000).room.round;
    assert.equal(viewer.target, word.toUpperCase());
    assert.deepEqual(viewer.forbiddenClues, clues);
    assert.equal(viewer.difficulty, word === 'dinosaur' ? 'easy' : word === 'marshmallow' ? 'medium' : 'hard');
    assert.match(viewer.ink, /^#[0-9a-f]{6}$/);
    assert.equal(typeof viewer.example, 'string');
    const broadcaster = fixtureState(word, 'broadcaster', 0, 1000).room.round;
    assert.equal('target' in broadcaster, false);
    assert.equal('forbiddenClues' in broadcaster, false);
    assert.equal('ink' in broadcaster, false);
    assert.equal('example' in broadcaster, false);
  }
  assert.equal(fixtureState('caught', 'viewer', 0, 1000).room.result.elapsed, 32);
});

test('preview helper preserves every selected fixture instead of silently showing volcano', async () => {
  const source = await readFile(new URL('../scripts/extension-preview/helper.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../scripts/extension-preview/index.html', import.meta.url), 'utf8');
  const choices = [...html.matchAll(/<option value="([a-z]+)">/g)].map(match => match[1]);
  for (const fixture of choices) {
    const target: any = {};
    runInNewContext(source, {
      window: target,
      location: { search: `?fixture=${fixture}`, pathname: '/viewer.html' },
      URLSearchParams,
      btoa: (value: string) => Buffer.from(value).toString('base64'),
      queueMicrotask: (callback: () => void) => callback(),
    });
    let selected = '';
    target.Twitch.ext.onAuthorized(({ token }: { token: string }) => {
      selected = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).fixture;
    });
    assert.equal(selected, fixture, `The helper must preserve the selected ${fixture} scenario`);
  }
});
