import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Moonshine } from '../client/moonshine';

function setup(t: TestContext) {
  const workers: FakeWorker[] = [], errors: string[] = [], progress: string[] = [];
  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    messages: Array<{ type: string; id: number }> = [];
    terminated = 0;
    constructor() { workers.push(this); }
    postMessage(message: { type: string; id: number }) { this.messages.push(message); }
    terminate() { ++this.terminated; }
    send(data: object) { this.onmessage?.({ data } as MessageEvent); }
    reply() { this.send({ type: 'reply', id: this.messages.at(-1)?.id }); }
  }
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ Worker: FakeWorker, crossOriginIsolated: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const moonshine = new Moonshine(() => {}, message => progress.push(message), message => errors.push(message));
  t.after(() => {
    moonshine.close();
    for (const [key, old] of originals) {
      if (old) Object.defineProperty(globalThis, key, old); else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { moonshine, workers, errors, progress };
}

test('fatal bootstrap error rejects loading immediately, preserves diagnostics and releases the worker', async t => {
  const { moonshine, workers, errors } = setup(t);
  const pending = moonshine.load();
  workers[0].send({ type: 'stage', stage: 'loading-runtime' });
  workers[0].onerror?.({ message: 'Out of memory', filename: 'https://pilot-baited.maff.app/moonshine/runtime/moonshine.mjs?token=private', lineno: 7, colno: 12 } as ErrorEvent);
  assert.equal(workers[0].terminated, 1);
  await assert.rejects(pending, (error: Error & { diagnostic?: Record<string, unknown> }) => {
    assert.match(error.message, /Out of memory/);
    assert.doesNotMatch(error.message, /Disable the microphone|private/);
    assert.equal(error.diagnostic?.stage, 'loading-runtime');
    assert.equal(error.diagnostic?.file, '/moonshine/runtime/moonshine.mjs');
    assert.equal(error.diagnostic?.line, 7);
    return true;
  });
  assert.equal(errors.length, 1);
  assert.equal(workers[0].onerror, null);
});

test('an old worker cannot fail or report progress on a retried load', async t => {
  const { moonshine, workers, errors, progress } = setup(t);
  const first = moonshine.load();
  const staleError = workers[0].onerror!, staleMessage = workers[0].onmessage!;
  const rejected = assert.rejects(first, /stopped/);
  moonshine.close();
  const second = moonshine.load();
  staleError({ message: 'old worker failure' } as ErrorEvent);
  staleMessage({ data: { type: 'progress', loaded: 1, total: 2 } } as MessageEvent);
  assert.deepEqual(errors, []);
  assert.deepEqual(progress, []);
  assert.equal(workers[1].terminated, 0);
  workers[1].reply(); await second; await rejected;
  await assert.rejects(Promise.resolve().then(() => { moonshine.close(); return moonshine.start(); }), /not loaded|stopped/i);
});

test('caught SDK load failures retain stage and sanitized cause; a new load can succeed', async t => {
  const { moonshine, workers } = setup(t);
  const load = moonshine.load();
  workers[0].send({ type: 'error', id: workers[0].messages[0].id, stage: 'importing-sdk', message: 'Cannot import https://host.example/module.js?secret=hidden' });
  await assert.rejects(load, (error: Error & { diagnostic?: Record<string, unknown> }) => {
    assert.equal(error.diagnostic?.stage, 'importing-sdk');
    assert.doesNotMatch(error.message, /secret|hidden/);
    return true;
  });
  moonshine.close();
  const retry = moonshine.load(); workers[1].reply(); await retry;
});

test('diagnostics never export opaque URL contents, credentials or query strings', async t => {
  const { moonshine, workers } = setup(t);
  for (const filename of [
    'blob:https://synthetic-user:synthetic-password@example.test/id?private=value',
    'HTTPS://synthetic-user:synthetic-password@example.test/runtime.mjs?private=value',
    'data:text/javascript,synthetic-password',
  ]) {
    const pending = moonshine.load();
    workers.at(-1)!.onerror?.({ message: `Could not load ${filename}`, filename } as ErrorEvent);
    await assert.rejects(pending, (error: Error & { diagnostic?: object }) => {
      assert.doesNotMatch(JSON.stringify({ message: error.message, diagnostic: error.diagnostic }), /synthetic|private|value/);
      return true;
    });
  }
});
