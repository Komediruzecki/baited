import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneLease } from '../client/safety';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('microphone renewal retries a transient failure once, without concurrent requests', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const recovery: boolean[] = [];
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.renew && ++calls === 1) throw new TypeError('Network failed');
  }, { onRecovery: (recovering) => recovery.push(recovering) });
  try {
    await lease.arm();
    t.mock.timers.tick(10000);
    const first = lease.renew(), second = lease.renew();
    await flush();
    assert.equal(calls, 1);
    t.mock.timers.tick(1000);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(calls, 2);
    assert.deepEqual(recovery, [true, false]);
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

for (const failure of [
  Object.assign(new Error('Refused'), { status: 401 }),
  Object.assign(new Error('Refused'), { status: 403 }),
  Object.assign(new Error('Refused'), { status: 429 }),
  Object.assign(new Error('Refused'), { status: 503, code: 'lease_owner' }),
  new Error('Unknown failure'),
]) test(`microphone renewal stops on terminal ${'code' in failure ? failure.code : 'status' in failure ? failure.status : 'unknown'} failure`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const lease = new MicrophoneLease('capture', async (body) => { if (body.renew) { calls++; throw failure; } });
  try {
    await lease.arm();
    await assert.rejects(lease.renew(), (error) => error === failure);
    t.mock.timers.tick(60000);
    assert.equal(calls, 1);
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('a stale local deadline permits one server-validated renew probe but no blind retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let fail = false, calls = 0;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.renew) { calls++; if (fail) throw new TypeError('Offline'); }
  });
  try {
    await lease.arm();
    t.mock.timers.tick(60000);
    assert.equal(await lease.renew(), true, 'The server can retain the same lease through valid active audio.');
    t.mock.timers.tick(60000); fail = true;
    await assert.rejects(lease.renew(), /Offline/);
    t.mock.timers.tick(60000);
    assert.equal(calls, 2, 'A stale deadline cannot authorize unattended retries.');
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('renewal stops retrying before known validity runs out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.renew) { calls++; throw Object.assign(new Error('Unavailable'), { status: 503 }); }
  });
  try {
    await lease.arm(); t.mock.timers.tick(20000);
    await assert.rejects(lease.renew(), /Unavailable/);
    assert.equal(calls, 1, 'There must be room for the full retry timeout inside the last confirmed lease.');
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('delayed arm acknowledgement does not add its latency to confirmed lease validity', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let release!: () => void, calls = 0;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.armed && !body.renew) await new Promise<void>((resolve) => { release = resolve; });
    if (body.renew) { calls++; throw new TypeError('Offline'); }
  });
  try {
    const armed = lease.arm(); t.mock.timers.tick(8000); release(); await armed;
    t.mock.timers.tick(12000);
    await assert.rejects(lease.renew(), /Offline/);
    assert.equal(calls, 1, 'Acknowledgement latency cannot create extra retry headroom.');
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('cancel settles an ignored-abort arm promptly and compensates a late success only for its old ID', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let release!: () => void, settled = false, current: string | null = 'old';
  const requests: { armed: boolean; leaseId: string }[] = [];
  const update = async (body: { armed: boolean; leaseId: string }) => {
    requests.push(body);
    if (body.armed && body.leaseId === 'old') await new Promise<void>((resolve) => { release = resolve; });
    else if (body.armed) current = body.leaseId;
    else if (current === body.leaseId) current = null;
  };
  const old = new MicrophoneLease('old', update);
  const pending = old.arm().then((value) => { settled = true; return value; });
  try {
    await old.cancel(); await flush();
    assert.equal(settled, true, 'Cancel must not await the old arm response.');
    assert.equal(await pending, false);
    const next = new MicrophoneLease('next', update); await next.arm();
    release(); await flush();
    assert.equal(current, 'next');
    assert.deepEqual(requests.at(-1), { armed: false, leaseId: 'old' });
    await next.cancel();
  } finally { release?.(); t.mock.timers.reset(); }
});

test('one capture cannot issue overlapping or repeated arm requests', async () => {
  let calls = 0, release!: () => void;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.armed) { calls++; await new Promise<void>((resolve) => { release = resolve; }); }
  });
  try {
    const first = lease.arm(), second = lease.arm();
    assert.equal(first, second); assert.equal(calls, 1);
    release(); assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(await lease.arm(), true); assert.equal(calls, 1);
  } finally { await lease.cancel(); }
});

test('arm timeout aborts its request and cannot report readiness after a late success', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let release!: () => void, signal: AbortSignal | undefined, disarms = 0;
  const lease = new MicrophoneLease('capture', async (body, requestSignal) => {
    if (body.armed) { signal = requestSignal; await new Promise<void>((resolve) => { release = resolve; }); }
    else disarms++;
  });
  try {
    const pending = assert.rejects(lease.arm(), { name: 'TimeoutError' });
    t.mock.timers.tick(10000); await pending;
    assert.equal(signal?.aborted, true);
    release(); await flush();
    assert.equal(disarms, 1, 'An abandoned successful arm gets a bounded exact-ID disarm.');
    assert.equal(await lease.renew(), false);
  } finally { release?.(); t.mock.timers.reset(); }
});

test('hanging disarm is single-flight and bounded so replacement can continue', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let signal: AbortSignal | undefined, disarms = 0;
  const old = new MicrophoneLease('old', async (body, requestSignal) => {
    if (!body.armed) { disarms++; signal = requestSignal; await new Promise(() => {}); }
  });
  try {
    await old.arm();
    const pending = assert.rejects(old.cancel(), { name: 'TimeoutError' });
    const again = assert.rejects(old.cancel(), { name: 'TimeoutError' });
    t.mock.timers.tick(10000); await Promise.all([pending, again]);
    assert.equal(signal?.aborted, true); assert.equal(disarms, 1);
    const next = new MicrophoneLease('next', async () => {});
    assert.equal(await next.arm(), true); await next.cancel();
  } finally { t.mock.timers.reset(); }
});

test('transient renewal retries have a three-attempt ceiling', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.renew) { calls++; throw new TypeError('Offline'); }
  });
  try {
    await lease.arm();
    const pending = assert.rejects(lease.renew(), /Offline/); await flush();
    t.mock.timers.tick(1000); await flush();
    t.mock.timers.tick(2000); await pending;
    t.mock.timers.tick(60000); assert.equal(calls, 3);
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('renewal timeout aborts the request and settles the single flight', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let signal: AbortSignal | undefined, calls = 0;
  const lease = new MicrophoneLease('capture', async (body, requestSignal) => {
    if (body.renew) { calls++; signal = requestSignal; await new Promise(() => {}); }
  });
  try {
    await lease.arm(); t.mock.timers.tick(20000);
    const pending = assert.rejects(lease.renew(), { name: 'TimeoutError' });
    await flush(); t.mock.timers.tick(10000); await pending;
    assert.equal(signal?.aborted, true);
    assert.equal(calls, 1);
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});

test('cancellation wakes a retry wait and a late successful renewal cannot revive capture', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let calls = 0, release!: () => void;
  const lease = new MicrophoneLease('capture', async (body) => {
    if (body.renew) { calls++; if (calls === 1) throw new TypeError('Offline'); }
  });
  try {
    await lease.arm();
    const waiting = lease.renew(); await flush();
    await lease.cancel();
    assert.equal(await waiting, false);
    t.mock.timers.tick(60000); assert.equal(calls, 1);
    const delayed = new MicrophoneLease('next', async (body) => {
      if (body.renew) await new Promise<void>((resolve) => { release = resolve; });
    });
    await delayed.arm(); const renewal = delayed.renew(); await flush();
    await delayed.cancel();
    assert.equal(await renewal, false);
    release(); await flush();
    assert.equal(delayed.active, false);
  } finally { await lease.cancel(); t.mock.timers.reset(); }
});
