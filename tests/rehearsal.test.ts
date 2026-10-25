import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const preflight = `
  import { rehearsalSettings } from './scripts/rehearsal-config.mjs';
  try { console.log(JSON.stringify(rehearsalSettings())); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
`;

function check(overrides: NodeJS.ProcessEnv = {}) {
  // Deliberate fixtures, not inherited developer credentials. No server is started.
  return spawnSync(process.execPath, ['--input-type=module', '--eval', preflight], {
    cwd: root,
    encoding: 'utf8',
    env: {
      TWITCH_CLIENT_ID: 'fixture-client-id',
      TWITCH_CLIENT_SECRET: 'fixture-client-secret',
      TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
      ...overrides,
    },
  });
}

test('Moonshine rehearsal defaults to local speech without a provider key', () => {
  for (const SPEECH_PROVIDER of [undefined, '', 'moonshine']) {
    const result = check({ SPEECH_PROVIDER });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { seconds: 10800, speechProvider: 'moonshine' });
  }
});

test('Deepgram rehearsal requires a resolved provider key only when selected', () => {
  for (const DEEPGRAM_API_KEY of [undefined, '', 'pass://vault/item/key']) {
    const result = check({ SPEECH_PROVIDER: 'deepgram', DEEPGRAM_API_KEY });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Resolve these credentials.*DEEPGRAM_API_KEY/);
    assert.doesNotMatch(result.stderr, /pass:\/\//);
  }
  const result = check({ SPEECH_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'fixture-provider-key' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).speechProvider, 'deepgram');
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-provider-key/);
});

test('rehearsal rejects unsupported providers without including supplied values', () => {
  const result = check({ SPEECH_PROVIDER: 'not-a-provider' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SPEECH_PROVIDER must be moonshine or deepgram/);
  assert.doesNotMatch(result.stderr, /not-a-provider/);
});

test('Moonshine still requires resolved Twitch and persistent encryption credentials', () => {
  for (const name of ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY']) {
    for (const value of ['', 'pass://vault/item/key']) {
      const result = check({ [name]: value });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`Resolve these credentials.*${name}`));
      assert.doesNotMatch(result.stderr, /DEEPGRAM_API_KEY|pass:\/\//);
    }
  }
  const invalidKey = check({ TOKEN_ENCRYPTION_KEY: 'fixture-invalid-key' });
  assert.equal(invalidKey.status, 1);
  assert.match(invalidKey.stderr, /TOKEN_ENCRYPTION_KEY must be 64 hexadecimal/);
  assert.doesNotMatch(invalidKey.stderr, /fixture-invalid-key/);
});

test('rehearsal keeps its bounded lifetime', () => {
  for (const seconds of ['59', '18001', '1.5', 'NaN']) {
    const result = check({ REHEARSAL_SECONDS: seconds });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REHEARSAL_SECONDS must be 60 to 18000/);
  }
  for (const seconds of ['60', '18000']) {
    const result = check({ REHEARSAL_SECONDS: seconds });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).seconds, Number(seconds));
  }
});

test('Moonshine reference templates do not resolve optional Deepgram secrets', () => {
  for (const file of ['docs/bait.local.env.tmpl', 'docs/bait.live-local.env.tmpl']) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      .split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    assert.ok(lines.includes('SPEECH_PROVIDER=moonshine'), file);
    assert.equal(lines.some((line) => line.startsWith('DEEPGRAM_API_KEY=')), false, file);
  }
});
