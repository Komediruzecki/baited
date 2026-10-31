import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeSessionLoader } from '../client/runtime-session';
import { retryDelay } from '../client/retry';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const runtime of ['node', 'edge']) test(`unattended ${runtime} public page recovers from initial runtime outage`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const sessions: unknown[] = [], errors: boolean[] = [];
  let calls = 0;
  const loader = createRuntimeSessionLoader({ automatic: true, random: () => 1,
    load: async () => {
      calls++;
      if (calls === 1) throw new TypeError('Network interrupted');
      if (calls === 2) throw Object.assign(new Error('Unavailable'), { status: 503 });
      return { runtime, authenticated: false };
    }, onSession: (session) => sessions.push(session), onError: (_error, retrying) => errors.push(retrying) });
  try {
    loader.reload(); await flush(); assert.equal(calls, 1);
    t.mock.timers.tick(1000); await flush(); assert.equal(calls, 2);
    t.mock.timers.tick(2000); await flush(); assert.equal(calls, 3);
    assert.deepEqual(sessions, [{ runtime, authenticated: false }]); assert.deepEqual(errors, [true, true]);
    t.mock.timers.tick(600000); await flush(); assert.equal(calls, 3, 'Success stops runtime discovery retries.');
  } finally { loader.destroy(); t.mock.timers.reset(); }
});

test('public discovery retries are bounded, while manual reload starts a fresh window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0; const retrying: boolean[] = [];
  const loader = createRuntimeSessionLoader({ automatic: true, random: () => 1,
    load: async () => { calls++; throw new TypeError('Offline'); }, onSession: () => assert.fail('Unexpected session'),
    onError: (_error, retry) => retrying.push(retry) });
  try {
    loader.reload(); await flush();
    for (let attempt = 0; retrying.at(-1) === true; attempt++) {
      assert.ok(attempt < 20);
      t.mock.timers.tick(retryDelay(attempt, 30000, () => 1)); await flush();
    }
    assert.ok(Date.now() <= 400000); assert.ok(calls > 5);
    const stopped = calls; t.mock.timers.tick(600000); await flush(); assert.equal(calls, stopped);
    loader.reload(); await flush(); assert.equal(calls, stopped + 1); assert.equal(retrying.at(-1), true);
  } finally { loader.destroy(); t.mock.timers.reset(); }
});

for (const status of [401, 403, 429]) test(`runtime discovery HTTP ${status} requires manual retry`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const loader = createRuntimeSessionLoader({ automatic: true,
    load: async () => { calls++; throw Object.assign(new Error('Refused'), { status }); },
    onSession: () => assert.fail('Unexpected session'), onError: (_error, retrying) => assert.equal(retrying, false) });
  try {
    loader.reload(); await flush(); t.mock.timers.tick(600000); await flush(); assert.equal(calls, 1);
  } finally { loader.destroy(); t.mock.timers.reset(); }
});

test('Studio discovery keeps manual recovery and never loops through sign-in', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const loader = createRuntimeSessionLoader({
    load: async () => { calls++; throw new TypeError('Offline'); },
    onSession: () => assert.fail('Unexpected session'), onError: (_error, retrying) => assert.equal(retrying, false) });
  try {
    loader.reload(); await flush(); t.mock.timers.tick(600000); await flush(); assert.equal(calls, 1);
  } finally { loader.destroy(); t.mock.timers.reset(); }
});

test('unmount cancels both runtime retry timers and in-flight fetches, ignoring late responses', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0, signal: AbortSignal | undefined, finish!: (value: string) => void;
  const sessions: string[] = [];
  const loader = createRuntimeSessionLoader({ automatic: true, random: () => 0,
    load: async (abort) => { calls++; signal = abort; return new Promise<string>((resolve) => { finish = resolve; }); },
    onSession: (session) => sessions.push(session), onError: () => assert.fail('A canceled request must stay silent') });
  try {
    loader.reload(); await flush(); assert.equal(signal!.aborted, false);
    loader.destroy(); assert.equal(signal!.aborted, true);
    finish('late-session'); await flush(); assert.deepEqual(sessions, []);
    loader.reload(); t.mock.timers.tick(600000); await flush(); assert.equal(calls, 1);
  } finally { loader.destroy(); t.mock.timers.reset(); }
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  const retry = createRuntimeSessionLoader({ automatic: true, random: () => 0,
    load: async () => { calls++; throw new TypeError('Offline'); }, onSession: () => {}, onError: () => {} });
  try {
    retry.reload(); await flush(); retry.destroy(); t.mock.timers.tick(600000); await flush(); assert.equal(calls, 2);
  } finally { retry.destroy(); t.mock.timers.reset(); }
});

test('retry delays have bounded jitter at both random extremes', () => {
  assert.equal(retryDelay(0, 60000, () => 0), 500);
  assert.equal(retryDelay(0, 60000, () => 1), 1000);
  assert.equal(retryDelay(100, 60000, () => 0), 30000);
  assert.equal(retryDelay(100, 60000, () => 1), 60000);
});
