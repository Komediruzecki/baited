import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../server/config.js';
import { createBait } from '../server/app.js';

const { hostedSettings, backendInvocation, tunnelInvocation } = await import(
  new URL('../../../ops/hosted-test.mjs', import.meta.url).href);
const fixtures = {
  PATH: process.env.PATH,
  TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-oauth-secret',
  TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), TWITCH_EXTENSION_CLIENT_ID: 'fixtureextension',
  TWITCH_EXTENSION_SECRET: Buffer.alloc(32, 17).toString('base64'),
  TUNNEL_TOKEN: 'fixture-tunnel-token', CLOUDFLARE_API_TOKEN: 'must-not-inherit',
  DEEPGRAM_API_KEY: 'must-not-inherit-either',
};

test('Cloudflare provisioning validates an existing Proton token before configuration or DNS changes', () => {
  const script = new URL('../../../ops/tests/test_provision_hosted_tunnel.py', import.meta.url);
  const result = spawnSync('python3', [script.pathname], {
    encoding: 'utf8', timeout: 10000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr);
});

test('hosted launcher fails closed on unresolved Proton credentials and unbounded duration', () => {
  assert.deepEqual(hostedSettings('backend', fixtures), { mode: 'backend', seconds: 10800 });
  assert.throws(() => hostedSettings('backend', { ...fixtures, TWITCH_CLIENT_SECRET: 'pass://dev/item/field' }), /Resolve/);
  assert.throws(() => hostedSettings('backend', { ...fixtures, TOKEN_ENCRYPTION_KEY: 'wrong' }), /64 hexadecimal/);
  assert.throws(() => hostedSettings('tunnel', { ...fixtures, TUNNEL_TOKEN: '' }), /TUNNEL_TOKEN/);
  for (const seconds of ['0', '59', '18001', 'Infinity', 'not-a-number'])
    assert.throws(() => hostedSettings('tunnel', { ...fixtures, HOSTED_TEST_SECONDS: seconds }), /HOSTED_TEST_SECONDS/);
  assert.throws(() => hostedSettings('publish', fixtures), /Choose backend or tunnel/);
});

test('backend binds loopback and forwards credentials only by selected environment names', () => {
  const { command, args, env } = backendInvocation(fixtures, 'test-container');
  assert.equal(command, 'docker');
  assert.ok(args.includes('host'));
  assert.ok(args.includes('HOST=127.0.0.1'));
  assert.ok(args.includes('PORT=3300'));
  assert.ok(args.includes('ENABLE_DEMO=false'));
  assert.ok(args.includes('TRUSTED_PROXIES=127.0.0.1'));
  assert.ok(args.includes('SPEECH_PROVIDER=moonshine'));
  assert.ok(args.includes('type=volume,source=baited-hosted-test-data,target=/app/data'));
  assert.equal(args.includes('--publish'), false);
  assert.equal(args.includes('-p'), false);
  for (const secret of [fixtures.TWITCH_CLIENT_SECRET, fixtures.TOKEN_ENCRYPTION_KEY, fixtures.TWITCH_EXTENSION_SECRET])
    assert.equal(args.join(' ').includes(secret), false);
  assert.equal(env.TWITCH_CLIENT_SECRET, fixtures.TWITCH_CLIENT_SECRET);
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.TUNNEL_TOKEN, undefined);
  assert.equal(env.DEEPGRAM_API_KEY, undefined);
});

test('tunnel token goes through an anonymous pipe and is removed before cloudflared starts', () => {
  const { command, args, env } = tunnelInvocation(fixtures);
  assert.equal(command, 'bash');
  assert.match(args[3], /unset TUNNEL_TOKEN\nexec cloudflared/);
  assert.match(args[3], /--token-file <\(printf/);
  assert.match(args[3], /--config "\$1"/);
  assert.match(args[3], /--metrics 127.0.0.1:20249/);
  assert.equal(args.join(' ').includes(fixtures.TUNNEL_TOKEN), false);
  assert.equal(env.TUNNEL_TOKEN, fixtures.TUNNEL_TOKEN);
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.TWITCH_CLIENT_SECRET, undefined);
  // Exercise the exact Bash handoff with a harmless stand-in executable. This
  // catches the ENXIO failure a Node socketpair would cause when reopened.
  const stubArgs = [...args];
  stubArgs[3] = args[3].replace('exec cloudflared tunnel', 'exec bash --noprofile --norc -c \'test -z "${TUNNEL_TOKEN+x}" && cat "${!#}"\' -- tunnel');
  const result = spawnSync(command, stubArgs, { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, fixtures.TUNNEL_TOKEN);
});

test('hosted origin pins Host, disables demo and limits the real client at the end of the forwarded chain', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'baited-hosted-proxy-'));
  const origin = 'https://play-baited.maff.app';
  const config = loadConfig({ ...fixtures, NODE_ENV: 'production', PUBLIC_URL: origin,
    HOST: '127.0.0.1', PORT: '0', DATA_DIR: dataDir, ENABLE_DEMO: 'false',
    TRUSTED_PROXIES: '127.0.0.1', SPEECH_PROVIDER: 'moonshine' });
  const bait = await createBait(config);
  await new Promise<void>(resolve => bait.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await bait.close(); await rm(dataDir, { recursive: true, force: true }); });
  const port = (bait.server.address() as AddressInfo).port;
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
        let body = '';
        res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body }));
      });
      req.on('error', reject); req.end();
    });
  const headers = { Host: 'play-baited.maff.app' };
  assert.equal((await get('/api/health')).status, 421);
  assert.equal((await get('/api/health', headers)).status, 200);
  assert.equal((await get('/api/demo/start', { ...headers, Origin: origin }, 'POST')).status, 404);
  const session = JSON.parse((await get('/api/session', headers)).body);
  assert.equal(session.demoAvailable, false);
  // Cloudflare appends the connecting client's address after any supplied XFF.
  // A forged left entry or CF-Connecting-IP value must not bypass its rate limit.
  for (let i = 0; i < 21; i++) {
    const response = await get('/auth/twitch', {
      ...headers, 'X-Forwarded-For': `203.0.113.${i + 1}, 198.51.100.22`,
      'CF-Connecting-IP': `203.0.113.${i + 1}`,
    });
    assert.equal(response.status, i < 20 ? 302 : 429);
  }
  const otherViewer = await get('/auth/twitch', {
    ...headers, 'X-Forwarded-For': '198.51.100.23', 'CF-Connecting-IP': '198.51.100.23',
  });
  assert.equal(otherViewer.status, 302, 'Paolo receives a separate client rate-limit bucket');
});
