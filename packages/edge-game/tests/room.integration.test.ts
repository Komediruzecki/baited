import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { Miniflare } from 'miniflare';
import type { AwardBoard, GameView } from '../../app/shared/types.js';
import type { Command, Receipt } from '../src/protocol.js';
import { buildWorker } from '../scripts/build.mjs';
import {
  createLocalOptions,
  LOCAL_FIXTURE_SECRET_B64,
  LOOPBACK_ORIGIN,
} from '../scripts/local-options.mjs';

interface Actor {
  role: 'studio' | 'viewer' | 'overlay';
  sub: string;
  generation?: number;
}
interface Snapshot {
  type: 'snapshot';
  protocol: number;
  revision: number;
  generation: number;
  room: GameView | null;
  awardBoard?: AwardBoard | null;
}
interface CommandResponse extends Receipt { snapshot: Snapshot }
type LocalSocket = WebSocket;
const studio: Actor = { role: 'studio', sub: 'fixture:studio' };
const viewer: Actor = { role: 'viewer', sub: 'fixture:viewer' };
const overlay: Actor = { role: 'overlay', sub: 'fixture:overlay' };

let failureWorker: string;
before(async () => {
  await buildWorker();
  const fixture = await buildWorker({
    entryPoint: fileURLToPath(new URL('./fixtures/room-failure-worker.ts', import.meta.url)),
    write: false,
  });
  failureWorker = fixture.outputFiles[0].text;
});

async function runtime(statePath: string | false = false, script?: string): Promise<Miniflare> {
  const options = createLocalOptions({ port: 0, statePath, script });
  const mf = new Miniflare(options);
  try {
    const ready = await mf.ready;
    // dispatchFetch uses the actual listener's Host header. Preserve that port
    // and allowlist its exact host; never relax the gateway's destination check.
    options.port = Number(ready.port);
    options.workers[0].config.env.EDGE_ALLOWED_HOSTS.value = ready.host;
    await mf.setOptions(options);
    return mf;
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

async function url(mf: Miniflare, path: string): Promise<string> {
  return `${(await mf.ready).origin}/v1/rooms/123/${path}`;
}

function capability(actor: Actor, expiresAt = Math.floor(Date.now() / 1000) + 300): string {
  const payload = {
    iss: 'baited-local-fixture', aud: 'baited-edge-local', channel_id: '123',
    role: actor.role, sub: actor.sub, generation: actor.generation ?? 1,
    iat: Math.floor(Date.now() / 1000), exp: expiresAt,
  };
  const content = [{ alg: 'HS256', typ: 'JWT' }, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  const signature = createHmac('sha256', Buffer.from(LOCAL_FIXTURE_SECRET_B64, 'base64'))
    .update(content).digest('base64url');
  return `${content}.${signature}`;
}

function headers(actor: Actor): Record<string, string> {
  return { authorization: `Bearer ${capability(actor)}`, origin: LOOPBACK_ORIGIN };
}

async function state(mf: Miniflare, actor = viewer, status = 200): Promise<Snapshot> {
  const response = await mf.dispatchFetch(await url(mf, 'state'), { headers: headers(actor) });
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  if (status === 200) assert.equal(response.headers.get('access-control-allow-origin'), LOOPBACK_ORIGIN);
  return await response.json() as Snapshot;
}

function live(snapshot: Snapshot): GameView & { round: NonNullable<GameView['round']> } {
  assert.ok(snapshot.room);
  assert.ok(snapshot.room.round);
  return snapshot.room as GameView & { round: NonNullable<GameView['round']> };
}

function command(action: Command['action'], expectedRevision: number, id = randomUUID(), generation = 1): Command {
  return { id, generation, expectedRevision, action };
}

function receiptMetadata(response: CommandResponse): Receipt {
  const { snapshot: _snapshot, ...receipt } = response;
  return receipt;
}

async function send(mf: Miniflare, actor: Actor, input: Command, status = 200): Promise<CommandResponse> {
  const response = await mf.dispatchFetch(await url(mf, 'commands'), {
    method: 'POST',
    headers: { ...headers(actor), 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json() as CommandResponse;
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(body.snapshot.type, 'snapshot');
  assert.equal(body.snapshot.protocol, 1);
  assert.equal(body.snapshot.generation, body.generation);
  // Replayed receipt metadata stays fixed, but its attached projection describes
  // the current room and must not rewind the client to the original command.
  assert.ok(body.snapshot.revision >= body.revision);
  if (actor.role !== 'studio') assert.equal('awardBoard' in body.snapshot, false);
  if (actor.role !== 'viewer' && body.snapshot.room?.round &&
      ['active', 'paused', 'settling'].includes(body.snapshot.room.phase)) hidden(body.snapshot);
  return body;
}

async function start(mf: Miniflare): Promise<Snapshot> {
  const receipt = await send(mf, studio, command({ type: 'start' }, 0));
  assert.deepEqual(receiptMetadata(receipt), { ok: true, revision: 1, generation: 1 });
  assert.equal(receipt.snapshot.revision, 1);
  assert.equal(live(receipt.snapshot).phase, 'active');
  hidden(receipt.snapshot);
  const visible = await state(mf);
  assert.equal(live(receipt.snapshot).round.id, live(visible).round.id);
  return visible;
}

function hidden(snapshot: Snapshot): void {
  const room = live(snapshot);
  for (const key of ['target', 'forbiddenClues', 'artId', 'cardId', 'artUrl', 'ink', 'example']) {
    assert.equal(key in room.round, false, `${key} leaked to a hidden projection`);
  }
}

function inbox(ws: LocalSocket) {
  const messages: string[] = [];
  const pending: { resolve: (value: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }[] = [];
  let closed: { code: number; reason: string } | undefined;
  const closeWaiters: { resolve: (value: { code: number; reason: string }) => void; timer: NodeJS.Timeout }[] = [];
  ws.addEventListener('message', (event) => {
    const waiter = pending.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(String(event.data)); }
    else messages.push(String(event.data));
  });
  ws.addEventListener('close', (event) => {
    closed = { code: event.code, reason: event.reason };
    for (const waiter of closeWaiters.splice(0)) { clearTimeout(waiter.timer); waiter.resolve(closed); }
    for (const waiter of pending.splice(0)) {
      clearTimeout(waiter.timer); waiter.reject(new Error('Socket closed before the expected message.'));
    }
  });
  return {
    messages,
    next(timeoutMs = 2_000): Promise<string> {
      if (messages.length) return Promise.resolve(messages.shift()!);
      if (closed) return Promise.reject(new Error('Socket has closed.'));
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: setTimeout(() => {
          pending.splice(pending.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for a local socket message.'));
        }, timeoutMs) };
        pending.push(waiter);
      });
    },
    close(timeoutMs = 15_000): Promise<{ code: number; reason: string }> {
      if (closed) return Promise.resolve(closed);
      return new Promise((resolve, reject) => {
        const waiter = { resolve, timer: setTimeout(() => {
          closeWaiters.splice(closeWaiters.indexOf(waiter), 1);
          reject(new Error('Timed out waiting for local authorization expiry.'));
        }, timeoutMs) };
        closeWaiters.push(waiter);
      });
    },
  };
}

async function closingPromptly(ws: WebSocket, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (ws.readyState < WebSocket.CLOSING && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(ws.readyState >= WebSocket.CLOSING, 'Authorization loss must promptly stop the open connection.');
}

async function connect(mf: Miniflare, actor: Actor, token = capability(actor)) {
  // Verify delivery of the close frame over an actual loopback connection.
  const endpoint = new URL(await url(mf, 'socket'));
  endpoint.protocol = 'ws:';
  const ws = new WebSocket(endpoint, ['baited.v1', `baited.auth.${token}`]);
  const queue = inbox(ws);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local WebSocket did not open.')), 2_000);
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timer); reject(new Error('Local WebSocket handshake failed.'));
    }, { once: true });
  });
  assert.equal(ws.protocol, 'baited.v1');
  const initial = JSON.parse(await queue.next()) as Snapshot;
  return { ws, queue, initial };
}

test('the real gateway authenticates local fixtures and sends private targets only to viewers', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const unauthenticated = await mf.dispatchFetch(await url(mf, 'state'));
    assert.equal(unauthenticated.status, 401);
    const missing = await state(mf, viewer, 404);
    assert.equal(missing.room, null);
    assert.equal(missing.revision, 0);
    const started = await start(mf);
    const visible = live(started);
    assert.equal(visible.phase, 'active');
    assert.equal(typeof visible.round.target, 'string');
    assert.ok(visible.round.target!.length > 0);
    assert.ok(Array.isArray(visible.round.forbiddenClues));
    assert.equal(started.protocol, 1);
    assert.equal(started.generation, 1);
    for (const actor of [studio, overlay]) {
      const snapshot = await state(mf, actor);
      hidden(snapshot);
      assert.equal(live(snapshot).round.id, visible.round.id);
      assert.equal(snapshot.revision, started.revision);
    }
    // Cached projections retain their revision but must not freeze the countdown.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const later = await state(mf);
    assert.equal(later.revision, started.revision);
    assert.ok(live(later).serverTime > visible.serverTime);
    assert.ok(live(later).round.remaining < visible.round.remaining);
  } finally { await mf.dispose(); }
});

test('cached mission countdown advances while running and stays frozen during pause or catch review', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const first = live(await start(mf));
    await send(mf, studio, command({ type: 'settings', settings: { ...first.settings, mission: 'three', cooldown: 5 } }, 1));
    await send(mf, studio, command({ type: 'end', roundId: first.round.id, epoch: first.round.epoch }, 2));
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    const idle = await state(mf);
    await send(mf, studio, command({ type: 'start' }, idle.revision));
    const initial = await state(mf);
    const running = live(initial);
    assert.ok(running.mission?.endsAt);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const later = await state(mf);
    assert.equal(later.revision, initial.revision);
    assert.ok(live(later).mission!.remaining < running.mission.remaining);

    await send(mf, studio, command({ type: 'pause', roundId: running.round.id, epoch: running.round.epoch }, later.revision));
    const paused = await state(mf);
    assert.equal(live(paused).mission!.endsAt, null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(live(await state(mf)).mission!.remaining, live(paused).mission!.remaining);

    await send(mf, studio, command({ type: 'resume', roundId: running.round.id, epoch: live(paused).round.epoch }, paused.revision));
    const resumed = await state(mf);
    await send(mf, studio, command({ type: 'fixture-transcript', roundId: running.round.id,
      epoch: live(resumed).round.epoch, text: running.round.target! }, resumed.revision));
    const review = await state(mf);
    assert.equal(live(review).result?.outcome, 'review');
    assert.equal(live(review).mission!.endsAt, null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(live(await state(mf)).mission!.remaining, live(review).mission!.remaining);
  } finally { await mf.dispose(); }
});

test('viewer and overlay capabilities cannot control the room or forge gateway identities', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    assert.equal((await send(mf, viewer, command({ type: 'start' }, 0), 403)).code, 'role');
    const started = await start(mf);
    const round = live(started).round;
    const actions: Command['action'][] = [
      { type: 'pause', roundId: round.id, epoch: round.epoch },
      { type: 'end', roundId: round.id, epoch: round.epoch },
      { type: 'fixture-transcript', roundId: round.id, epoch: round.epoch, text: round.target! },
      { type: 'revoke-connections' },
    ];
    for (const actor of [viewer, overlay]) {
      for (const action of actions) {
        assert.equal((await send(mf, actor, command(action, 1), 403)).code, 'role');
      }
    }
    const forged = await mf.dispatchFetch(await url(mf, 'commands'), {
      method: 'POST', headers: { ...headers(viewer), 'content-type': 'application/json',
        'x-edge-identity': JSON.stringify({ role: 'studio', canControl: true, channelId: '123' }) },
      body: JSON.stringify(command({ type: 'pause', roundId: round.id, epoch: round.epoch }, 1)),
    });
    assert.equal(forged.status, 403);
    const unchanged = await state(mf);
    assert.equal(unchanged.revision, 1);
    assert.equal(live(unchanged).phase, 'active');
    assert.equal(live(unchanged).voters, 0);
  } finally { await mf.dispose(); }
});

test('receipts are idempotent and reject conflicting IDs, stale revisions, generations, rounds and epochs', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const first = command({ type: 'start' }, 0, 'start-once');
    const accepted = await send(mf, studio, first);
    const replayedStart = await send(mf, studio, first);
    assert.deepEqual(receiptMetadata(replayedStart), receiptMetadata(accepted));
    assert.equal(replayedStart.snapshot.revision, accepted.snapshot.revision);
    assert.equal(live(replayedStart.snapshot).round.id, live(accepted.snapshot).round.id);
    assert.ok(live(replayedStart.snapshot).serverTime >= live(accepted.snapshot).serverTime);
    const initial = await state(mf);
    const round = live(initial).round;
    const pause = { type: 'pause', roundId: round.id, epoch: round.epoch } as const;
    assert.equal((await send(mf, studio, command(pause, 1, first.id), 409)).code, 'id_conflict');
    assert.equal((await send(mf, studio, command(pause, 0), 409)).code, 'stale_revision');
    assert.equal((await send(mf, studio, command(pause, 1, randomUUID(), 2), 409)).code, 'stale_revision');
    await state(mf, { ...viewer, generation: 2 }, 401);
    for (const action of [{ ...pause, roundId: randomUUID() }, { ...pause, epoch: 999 }]) {
      assert.equal((await send(mf, studio, command(action, 1), 409)).code, 'action_unavailable');
    }
    assert.equal((await state(mf)).revision, 1);
    const pauseCommand = command(pause, 1, 'pause-once');
    const pausedReceipt = await send(mf, studio, pauseCommand);
    const paused = live(await state(mf));
    assert.equal(paused.phase, 'paused');
    assert.equal(paused.round.epoch, round.epoch + 1);
    assert.equal((await send(mf, studio, command(pause, 2), 409)).code, 'action_unavailable');
    await send(mf, studio, command({ type: 'resume', roundId: round.id, epoch: paused.round.epoch }, 2));
    const replayedPause = await send(mf, studio, pauseCommand);
    assert.deepEqual(receiptMetadata(replayedPause), receiptMetadata(pausedReceipt));
    assert.equal(replayedPause.snapshot.revision, 3);
    assert.equal(live(replayedPause.snapshot).phase, 'active', 'A replayed pause receipt must carry the current resumed projection.');
    assert.equal(live(replayedPause.snapshot).round.epoch, round.epoch + 2);
    const resumed = await state(mf);
    assert.equal(resumed.revision, 3);
    assert.equal(live(resumed).phase, 'active');
    assert.equal(live(resumed).round.epoch, round.epoch + 2);
  } finally { await mf.dispose(); }
});

test('two viewers may reuse a client command ID without losing either vote', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const initial = await start(mf);
    const round = live(initial).round;
    const vote = command({ type: 'fixture-chat', roundId: round.id, epoch: round.epoch, text: '!skip' }, 1, 'client-1');
    const alice = { ...viewer, sub: 'fixture:alice' };
    const bob = { ...viewer, sub: 'fixture:bob' };
    const first = await send(mf, alice, vote);
    const replayed = await send(mf, alice, vote);
    assert.deepEqual(receiptMetadata(replayed), receiptMetadata(first));
    assert.equal(live(replayed.snapshot).voters, 1);
    assert.equal(live(replayed.snapshot).round.target, round.target);
    const second = await send(mf, bob, vote);
    assert.equal(second.revision, first.revision + 1);
    const twoVotes = await state(mf);
    assert.equal(live(twoVotes).voters, 2);
    assert.equal(live(twoVotes).participants, 2);
    assert.equal(live(twoVotes).phase, 'active');
    await send(mf, { ...viewer, sub: '__proto__' }, vote);
    const skipped = live(await state(mf));
    assert.equal(skipped.voters, 3);
    assert.equal(skipped.participants, 3);
    assert.equal(skipped.result?.outcome, 'skipped');
    assert.equal(skipped.leaders.length, 3);
    assert.ok(skipped.leaders.every((leader) => leader.rounds === 1));
  } finally { await mf.dispose(); }
});

test('two control commands with the same expected revision commit only one transition', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const initial = await start(mf);
    const round = live(initial).round;
    const action = { type: 'pause', roundId: round.id, epoch: round.epoch } as const;
    const results = await Promise.all(['simultaneous-a', 'simultaneous-b'].map(async (id) => {
      const response = await mf.dispatchFetch(await url(mf, 'commands'), {
        method: 'POST', headers: { ...headers(studio), 'content-type': 'application/json' },
        body: JSON.stringify(command(action, 1, id)),
      });
      return { status: response.status, body: await response.json() as Receipt };
    }));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(results.find((result) => result.status === 409)?.body.code, 'stale_revision');
    const final = await state(mf);
    assert.equal(final.revision, 2);
    assert.equal(live(final).phase, 'paused');
    assert.equal(live(final).round.epoch, round.epoch + 1);
  } finally { await mf.dispose(); }
});

test('an injected alarm failure rolls back state and receipt before a same-ID retry', { timeout: 15_000 }, async () => {
  const mf = await runtime(false, failureWorker);
  try {
    const namespace = await mf.getDurableObjectNamespace('ROOMS');
    const stub = namespace.get(namespace.idFromName('channel:123')) as unknown as {
      armFailure(): Promise<void>;
      inspectFixture(): Promise<{ alarm: number | null; receipts: number; meta: unknown[] }>;
    };
    const before = await stub.inspectFixture();
    assert.equal(before.alarm, null);
    assert.equal(before.receipts, 0);
    assert.deepEqual(before.meta, []);
    await stub.armFailure();
    const input = command({ type: 'start' }, 0, 'retry-after-alarm-failure');
    const failed = await mf.dispatchFetch(await url(mf, 'commands'), {
      method: 'POST', headers: { ...headers(studio), 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    assert.ok(failed.status >= 400, 'Injected failure must not acknowledge a committed command.');
    await failed.arrayBuffer();
    const rolledBack = await stub.inspectFixture();
    assert.equal(rolledBack.alarm, null);
    assert.equal(rolledBack.receipts, 0);
    assert.deepEqual(rolledBack.meta, []);
    assert.equal((await state(mf, viewer, 404)).revision, 0);
    const retry = await send(mf, studio, input);
    assert.deepEqual(receiptMetadata(retry), { ok: true, revision: 1, generation: 1 });
    assert.equal(retry.snapshot.revision, 1);
    assert.equal(live(retry.snapshot).phase, 'active');
    hidden(retry.snapshot);
    const committed = await stub.inspectFixture();
    assert.ok(committed.alarm !== null);
    assert.equal(committed.receipts, 1);
    assert.equal(live(await state(mf)).phase, 'active');
  } finally { await mf.dispose(); }
});

test('SQLite recovery retains paused rounds, votes, pending catches and replay receipts', { timeout: 20_000 }, async () => {
  const outputRoot = process.env.BAITED_EDGE_TEST_OUTPUT ?? tmpdir();
  assert.ok(isAbsolute(outputRoot), 'BAITED_EDGE_TEST_OUTPUT must be an absolute scratch directory.');
  await mkdir(outputRoot, { recursive: true });
  const persistence = await mkdtemp(join(outputRoot, 'baited-edge-recovery-'));
  let mf: Miniflare | undefined;
  let passed = false;
  try {
    mf = await runtime(persistence);
    const initial = await start(mf);
    const round = live(initial).round;
    const vote = command({ type: 'fixture-chat', roundId: round.id, epoch: round.epoch, text: '!skip' }, 1, 'persistent-vote');
    const voteReceipt = await send(mf, viewer, vote);
    const pause = command({ type: 'pause', roundId: round.id, epoch: round.epoch }, 2, 'persistent-pause');
    const pauseReceipt = await send(mf, studio, pause);
    const beforeRestart = await state(mf);
    await mf.dispose();
    mf = await runtime(persistence);
    const recovered = await state(mf);
    assert.equal(recovered.revision, beforeRestart.revision);
    assert.equal(recovered.generation, beforeRestart.generation);
    assert.deepEqual(live(recovered).round, live(beforeRestart).round);
    assert.equal(live(recovered).phase, 'paused');
    assert.equal(live(recovered).voters, 1);
    assert.equal(live(recovered).participants, 1);
    const recoveredVote = await send(mf, viewer, vote);
    const recoveredPause = await send(mf, studio, pause);
    assert.deepEqual(receiptMetadata(recoveredVote), receiptMetadata(voteReceipt));
    assert.deepEqual(receiptMetadata(recoveredPause), receiptMetadata(pauseReceipt));
    for (const replay of [recoveredVote, recoveredPause]) {
      assert.equal(replay.snapshot.revision, recovered.revision);
      assert.equal(live(replay.snapshot).phase, 'paused');
      assert.equal(live(replay.snapshot).voters, 1);
      assert.equal(live(replay.snapshot).round.id, round.id);
    }
    await send(mf, studio, command({ type: 'resume', roundId: round.id, epoch: live(recovered).round.epoch }, 3));
    const resumed = await state(mf);
    await send(mf, studio, command({ type: 'fixture-transcript', roundId: round.id,
      epoch: live(resumed).round.epoch, text: round.target! }, 4, 'persistent-transcript'));
    const pending = await state(mf);
    assert.equal(live(pending).result?.outcome, 'review');
    assert.equal(live(pending).score.wins, 0);
    assert.equal(live(pending).history.length, 0);
    await mf.dispose();
    mf = await runtime(persistence);
    const recoveredCatch = await state(mf);
    assert.equal(recoveredCatch.revision, 5);
    assert.deepEqual(live(recoveredCatch).result, live(pending).result);
    assert.equal(live(recoveredCatch).score.wins, 0);
    const confirm = command({ type: 'catch', roundId: round.id, decision: 'confirm' }, 5, 'persistent-confirm');
    const confirmed = await send(mf, studio, confirm);
    const replayedConfirm = await send(mf, studio, confirm);
    assert.deepEqual(receiptMetadata(replayedConfirm), receiptMetadata(confirmed));
    assert.equal(live(replayedConfirm.snapshot).score.wins, 1);
    assert.equal(live(replayedConfirm.snapshot).history.length, 1);
    const final = live(await state(mf));
    assert.equal(final.score.wins, 1);
    assert.equal(final.score.played, 1);
    assert.equal(final.history.length, 1);
    assert.equal(final.result?.outcome, 'caught');
    passed = true;
  } finally {
    try { await mf?.dispose(); }
    finally {
      // Keep failing recovery evidence in the explicitly selected output run.
      if (passed || !process.env.BAITED_EDGE_TEST_OUTPUT) await rm(persistence, { recursive: true });
    }
  }
});

test('only Studio receives the award board and may credit the prior caught round during the next round', { timeout: 15_000 }, async () => {
  const mf = await runtime();
  try {
    const initial = await start(mf);
    const room = live(initial);
    await send(mf, studio, command({ type: 'settings', settings: { ...room.settings, cooldown: 5 } }, 1));
    await send(mf, viewer, command({ type: 'fixture-chat', roundId: room.round.id,
      epoch: room.round.epoch, text: '?' }, 2));
    await send(mf, studio, command({ type: 'fixture-transcript', roundId: room.round.id,
      epoch: room.round.epoch, text: room.round.target! }, 3));
    await send(mf, studio, command({ type: 'catch', roundId: room.round.id, decision: 'confirm' }, 4));
    const caught = await state(mf, studio);
    assert.ok(caught.awardBoard);
    assert.equal(caught.awardBoard.roundId, room.round.id);
    const hint = caught.awardBoard.candidates.find((candidate) => candidate.eligible);
    assert.ok(hint);
    assert.equal('userId' in hint, false);
    assert.equal('messageId' in hint, false);
    for (const actor of [viewer, overlay]) {
      assert.equal('awardBoard' in await state(mf, actor), false);
    }
    const delay = Math.max(0, (live(caught).nextAt ?? 0) - Date.now() + 30);
    assert.ok(delay <= 6_000, 'Only the minimum five-second cooldown is exercised.');
    await new Promise((resolve) => setTimeout(resolve, delay));
    const idle = await state(mf, studio);
    await send(mf, studio, command({ type: 'start' }, idle.revision));
    const next = await state(mf, studio);
    assert.equal(live(next).phase, 'active');
    assert.notEqual(live(next).round.id, room.round.id);
    hidden(next);
    assert.equal(next.awardBoard?.roundId, room.round.id);
    await send(mf, studio, command({ type: 'award', roundId: room.round.id, hintId: hint.id }, next.revision));
    const awarded = await state(mf, studio);
    assert.equal(awarded.awardBoard?.selectedHintId, hint.id);
    assert.equal(live(awarded).history[0].id, room.round.id);
    assert.equal(live(awarded).history[0].award?.name, viewer.sub);
    assert.equal(live(awarded).round.id, live(next).round.id);
    assert.equal(live(awarded).phase, 'active');
    hidden(awarded);
  } finally { await mf.dispose(); }
});

test('WebSocket snapshots stay role-specific and generation revocation closes existing sockets', { timeout: 25_000 }, async () => {
  const mf = await runtime(false, failureWorker);
  const clients: WebSocket[] = [];
  try {
    const initial = await start(mf);
    const viewerConnection = await connect(mf, viewer);
    clients.push(viewerConnection.ws);
    const studioConnection = await connect(mf, studio);
    clients.push(studioConnection.ws);
    assert.equal(live(viewerConnection.initial).round.target, live(initial).round.target);
    hidden(studioConnection.initial);
    viewerConnection.ws.send('ping');
    assert.equal(await viewerConnection.queue.next(), 'pong');
    const closingViewer = viewerConnection.queue.close();
    const closingStudio = studioConnection.queue.close();
    const revoked = await send(mf, studio, command({ type: 'revoke-connections' }, 1));
    assert.equal(revoked.generation, 2);
    const [closures] = await Promise.all([
      Promise.all([closingViewer, closingStudio]),
      Promise.all([closingPromptly(viewerConnection.ws), closingPromptly(studioConnection.ws)]),
    ]).catch(async (error: Error) => {
      const namespace = await mf.getDurableObjectNamespace('ROOMS');
      const stub = namespace.get(namespace.idFromName('channel:123')) as unknown as {
        inspectFixture(): Promise<unknown>;
      };
      error.message += ` Runtime state: ${JSON.stringify(await stub.inspectFixture())}`;
      throw error;
    });
    assert.equal(closures[0].code, 1008);
    assert.equal(closures[1].code, 1008);
    assert.equal(viewerConnection.queue.messages.length, 0);
    assert.equal(studioConnection.queue.messages.length, 0);
    await state(mf, viewer, 401);
    const refreshed = await state(mf, { ...viewer, generation: 2 });
    assert.equal(refreshed.revision, 2);
    assert.equal(refreshed.generation, 2);
    assert.equal(live(refreshed).round.id, live(initial).round.id);
  } finally {
    for (const ws of clients) if (ws.readyState < WebSocket.CLOSING) ws.close();
    await mf.dispose();
  }
});

test('an idle private WebSocket closes at capability expiry without a client action', { timeout: 25_000 }, async () => {
  const mf = await runtime(false, failureWorker);
  let client: WebSocket | undefined;
  try {
    await start(mf);
    const expiresAt = Math.floor(Date.now() / 1000) + 2;
    const token = capability(viewer, expiresAt);
    const connection = await connect(mf, viewer, token);
    client = connection.ws;
    assert.equal(connection.initial.type, 'snapshot');
    const [closed] = await Promise.all([
      connection.queue.close(15_000),
      closingPromptly(connection.ws, Math.max(0, expiresAt * 1000 - Date.now()) + 2_000),
    ]).catch(async (error: Error) => {
      const namespace = await mf.getDurableObjectNamespace('ROOMS');
      const stub = namespace.get(namespace.idFromName('channel:123')) as unknown as {
        inspectFixture(): Promise<unknown>;
      };
      error.message += ` Runtime state: ${JSON.stringify(await stub.inspectFixture())}`;
      throw error;
    });
    assert.equal(closed.code, 1008);
    assert.ok(Date.now() >= expiresAt * 1000);
    assert.equal(connection.queue.messages.length, 0);
    const response = await mf.dispatchFetch(await url(mf, 'state'), {
      headers: { authorization: `Bearer ${token}`, origin: LOOPBACK_ORIGIN },
    });
    assert.equal(response.status, 401);
  } finally {
    if (client && client.readyState < WebSocket.CLOSING) client.close();
    await mf.dispose();
  }
});
