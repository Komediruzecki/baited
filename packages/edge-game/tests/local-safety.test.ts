import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';
import { isNodeBuiltin, nodeBuiltinGuard } from '../scripts/build.mjs';
import {
  createLocalOptions,
  DEFAULT_TIMEOUT_MS,
  LOCAL_FIXTURE_SECRET_B64,
  LOCAL_HOST,
  LOCAL_PORT,
  MAX_TIMEOUT_MS,
  parseLocalSettings,
} from '../scripts/local-options.mjs';

test('local settings reject every CLI argument, including remote flags', () => {
  for (const args of [['--remote'], ['--host', '0.0.0.0'], ['--port', '443'], ['--help'], ['dev']]) {
    assert.throws(() => parseLocalSettings(args, {}), /accepts no arguments/);
  }
});

test('preview lifetime is bounded and persistent state is explicit', () => {
  assert.deepEqual(parseLocalSettings([], {}), { timeoutMs: DEFAULT_TIMEOUT_MS, statePath: false });
  assert.equal(parseLocalSettings([], { BAITED_EDGE_LOCAL_TIMEOUT_MS: String(MAX_TIMEOUT_MS) }).timeoutMs, MAX_TIMEOUT_MS);
  for (const value of ['0', '-1', 'Infinity', 'NaN', '3600001', '15m', '1.5', '']) {
    assert.throws(() => parseLocalSettings([], { BAITED_EDGE_LOCAL_TIMEOUT_MS: value }), /TIMEOUT/);
  }
  for (const value of ['./state', 'https://example.com/state', '//server/share', '/', '']) {
    assert.throws(() => parseLocalSettings([], { BAITED_EDGE_LOCAL_STATE: value }), /STATE/);
  }
  assert.equal(parseLocalSettings([], { BAITED_EDGE_LOCAL_STATE: '/var/local/baited-fixture' }).statePath, '/var/local/baited-fixture');
});

test('the harness ignores credential, endpoint, host and port environment values', () => {
  const settings = parseLocalSettings([], {
    CLOUDFLARE_API_TOKEN: 'public-test-marker',
    CLOUDFLARE_ACCOUNT_ID: 'public-test-marker',
    CLOUDFLARE_API_BASE_URL: 'https://example.com',
    EDGE_STAGING_AUTH: 'true',
    EDGE_FIXTURE_SECRET_B64: 'untrusted-environment-value',
    HOST: '0.0.0.0',
    PORT: '443',
  });
  const options = createLocalOptions({ ...settings, script: 'export default {};' });
  const worker = options.workers[0];
  assert.equal(options.host, LOCAL_HOST);
  assert.equal(options.port, LOCAL_PORT);
  assert.equal(worker.config.env.EDGE_STAGING_AUTH.value, 'false');
  assert.equal(worker.config.env.EDGE_FIXTURE_SECRET_B64.value, LOCAL_FIXTURE_SECRET_B64);
  assert.equal(Buffer.from(LOCAL_FIXTURE_SECRET_B64, 'base64').length, 32);
  assert.equal(worker.config.exports.ChannelRoom.storage, 'sqlite');
  assert.equal(options.resourcePersistencePath, undefined);
  assert.equal(options.telemetry.enabled, false);
  assert.equal(options.cf, false);
  assert.equal(worker.dev.unsafeRegisterWorker, false);
  assert.equal(worker.dev.remoteProxyConnectionString, undefined);
  assert.equal(worker.config.env.ART.type, 'r2');
  assert.equal(worker.config.env.ART.dev?.remote ?? false, false);
  assert.throws(() => createLocalOptions({ port: 443 }), /Local edge port/);
});

test('Node builtins fail the actual browser bundle while cloudflare runtime imports remain external', async () => {
  for (const name of ['node:fs', 'fs', 'fs/promises', 'worker_threads', 'node:any-new-builtin']) {
    assert.equal(isNodeBuiltin(name), true);
    await assert.rejects(build({
      stdin: { contents: `import * as builtin from ${JSON.stringify(name)}; export default builtin;`, loader: 'ts' },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      plugins: [nodeBuiltinGuard()],
      logLevel: 'silent',
    }), /Node runtime import is forbidden/);
  }
  const result = await build({
    stdin: { contents: 'export { DurableObject } from "cloudflare:workers";', loader: 'ts' },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    external: ['cloudflare:workers'],
    write: false,
    plugins: [nodeBuiltinGuard()],
    logLevel: 'silent',
  });
  assert.match(result.outputFiles[0].text, /cloudflare:workers/);
});

test('both command entrypoints reject remote flags before starting a build or listener', () => {
  for (const name of ['build', 'local']) {
    const command = spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${name}.mjs`, import.meta.url)), '--remote'], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.equal(command.status, 1);
    assert.match(command.stderr, /accepts no arguments/);
    assert.equal(command.stdout, '');
  }
});

test('the real local runtime rejects outbound fetches without contacting a provider', { timeout: 15_000 }, async () => {
  const options = createLocalOptions({
    port: 0,
    script: 'export default { fetch() { return fetch("https://outbound-must-not-resolve.invalid/"); } };',
  });
  options.workers[0].config.exports = {};
  options.workers[0].config.env = {};
  const emulator = new Miniflare({
    ...options,
  });
  try {
    const ready = await emulator.ready;
    assert.equal(ready.hostname, LOCAL_HOST);
    const response = await emulator.dispatchFetch('http://127.0.0.1/');
    assert.equal(response.status, 503);
    assert.match(await response.text(), /Outbound network access is disabled/);
  } finally {
    await emulator.dispose();
  }
});

test('the local runtime fails when its port is occupied instead of choosing another port', { timeout: 15_000 }, async () => {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, LOCAL_HOST, resolve);
  });
  const address = blocker.address();
  assert.ok(address && typeof address !== 'string');
  const options = createLocalOptions({ port: 0, script: 'export default { fetch() { return new Response("local"); } };' });
  // Reserve an ephemeral port for this focused test so the normal preview port
  // never needs to be disturbed. The CLI uses LOCAL_PORT without overrides.
  options.port = address.port;
  options.log = new Log(LogLevel.NONE);
  options.workers[0].config.exports = {};
  options.workers[0].config.env = {};
  const emulator = new Miniflare(options);
  try {
    await assert.rejects(emulator.ready, { code: 'ERR_ADDRESS_IN_USE' });
  } finally {
    try {
      // This release repeats its startup error from dispose(). Still release the
      // test's reserved socket, including when either assertion fails.
      await emulator.dispose().catch((error: { code?: string }) => {
        assert.equal(error.code, 'ERR_ADDRESS_IN_USE');
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});
