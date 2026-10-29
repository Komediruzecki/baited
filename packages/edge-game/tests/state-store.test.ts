import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { defaults, Game, type GameCheckpoint } from '@baited/game-core';
import { assemble, partition, RoomStore } from '../src/state-store.js';
import { LIMITS } from '../src/protocol.js';

// Real in-memory SQLite exercises SQL commit/rollback and row updates. This shim
// implements only RoomStore's cursor surface; it does not simulate Workerd alarms.
function storage() {
  const db = new DatabaseSync(':memory:');
  const calls: { query: string; bindings: unknown[] }[] = [];
  let fail: ((query: string, bindings: unknown[]) => boolean) | undefined;
  const sql = {
    exec(query: string, ...bindings: (string | number | null)[]) {
      calls.push({ query, bindings });
      if (fail?.(query, bindings)) throw new Error('injected SQL failure');
      let rows: Record<string, unknown>[];
      if (query.trimStart().startsWith('CREATE TABLE')) { db.exec(query); rows = []; }
      else rows = db.prepare(query).all(...bindings);
      return {
        toArray: () => rows,
        one: () => { assert.equal(rows.length, 1); return rows[0]; },
        [Symbol.iterator]: () => rows[Symbol.iterator](),
      };
    },
  };
  const transaction = <T>(operation: () => T): T => {
    db.exec('BEGIN');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  return {
    db, sql: sql as unknown as SqlStorage, calls, transaction,
    inject: (value?: typeof fail) => { fail = value; },
    writes: () => calls.filter(({ query }) => /^(INSERT|DELETE|UPDATE)/.test(query)),
    stateWrites: () => calls.filter(({ query }) => /^(INSERT INTO|DELETE FROM) state_part/.test(query))
      .map(({ bindings }) => bindings[0] as string),
  };
}

function fixture() {
  let now = 100000, serial = 0;
  const clock = () => now;
  const uuid = () => `00000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
  const game = new Game({ id: 'room', owner: '123', channel: 'synthetic', mode: 'demo',
    overlayKey: 'private-capability', settings: { ...defaults }, history: [],
    priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {} }, clock, () => 0, uuid);
  return {
    game, clock, uuid, add: (ms: number) => { now += ms; },
    chat: (id: string, subject: string, text = 'a subtle clue') => game.chat(id, subject, subject, text, now),
    transcript: () => ({ roundId: game.round!.id, epoch: game.round!.epoch, text: game.round!.word,
      id: `speech-${serial}`, final: true, confidence: 1, capturedAt: now }),
  };
}

function save(h: ReturnType<typeof storage>, store: RoomStore, game: Game, revision: number) {
  const records = h.transaction(() => store.save(game.checkpoint(), '123', revision, 1));
  store.committed(records);
}

function restored(store: RoomStore, f: ReturnType<typeof fixture>) {
  return Game.restore(store.load(), f.clock, () => 0, f.uuid);
}

function plain(state: GameCheckpoint) { return JSON.parse(JSON.stringify(state)); }
const listItem = (name: string, id: string) => JSON.stringify(['list-item', name, id]);
const listOrder = (name: string) => JSON.stringify(['list-order', name]);

/** The indexed record layout written before stable list IDs were introduced. */
function legacyPartition(state: GameCheckpoint) {
  const records = partition(state);
  for (const name of ['history', 'hints', 'reviewHints']) {
    const orderText = records.get(listOrder(name));
    if (!orderText) continue;
    const order = JSON.parse(orderText) as string[];
    order.forEach((id, index) => {
      records.set(JSON.stringify([name, String(index)]), records.get(listItem(name, id))!);
      records.delete(listItem(name, id));
    });
    records.delete(listOrder(name));
  }
  return records;
}

test('partition/assemble retains active immutable card metadata, private hints, dedupe and map/set state', () => {
  const f = fixture();
  f.game.deckFor = () => [{ target: 'penguin', difficulty: 'medium', blockedClues: ['bird', 'ice'],
    acceptedSpellings: ['pingu'], cardId: 'private-card', revision: 7, artId: 'private-art' }];
  f.game.begin();
  f.chat('vote', 'user:a', '!skip');
  for (let n = 1; n <= 4; n++) { f.chat(`hint-${n}`, 'user:a', `clue number ${n}`); f.add(3000); }
  assert.equal(f.chat('spoiler', 'user:b', 'p1ngu'), false);
  assert.equal(f.game.transcript({ ...f.transcript(), text: 'unrelated' }), false);
  const checkpoint = f.game.checkpoint();
  const records = partition(checkpoint);
  assert.equal(JSON.parse(records.get('base')!).round.participants.length, 0);
  const game = Game.restore(assemble(records), f.clock, () => 0, f.uuid);
  assert.deepEqual(plain(game.checkpoint()), plain(checkpoint));
  assert.deepEqual(game.round!.hints.filter((hint) => hint.eligible).map((hint) => hint.text),
    ['clue number 2', 'clue number 3', 'clue number 4']);
  assert.equal(game.chat('spoiler', 'user:c', 'C', 'not a spoiler anymore', f.clock()), false);
  assert.equal(game.round!.votes.has('user:a'), true);
  for (const role of ['studio', 'overlay'] as const) {
    const view = JSON.stringify(game.view(role));
    for (const privateText of ['penguin', 'pingu', 'private-card', 'private-art', 'private-capability'])
      assert.equal(view.includes(privateText), false);
  }
});

test('SQLite wake preserves pending catch, private award review and result/history aliases for reversal', (t) => {
  const h = storage(); t.after(() => h.db.close());
  let store = new RoomStore(h.sql);
  const f = fixture(); f.game.begin(); f.chat('hint', 'user:a');
  f.game.transcript(f.transcript(), 'confirm');
  save(h, store, f.game, 1);
  store = new RoomStore(h.sql);
  let game = restored(store, f);
  assert.equal(game.pendingCatch, true);
  assert.equal(game.score.wins, 0);
  assert.equal(game.round!.hints[0].messageId, 'hint');
  game.decideCatch(game.round!.id, 'confirm');
  const board = game.awardBoard!;
  game.award(board.roundId, board.candidates[0].id);
  save(h, store, game, 2);
  store = new RoomStore(h.sql); game = restored(store, f);
  assert.equal(game.result, game.data.history[0]);
  assert.equal(game.awardBoard!.selectedHintId, board.candidates[0].id);
  assert.equal(game.checkpoint().awardOwners[0][1], 'user:a');
  game.award(board.roundId, board.candidates[0].id);
  assert.equal(game.data.leaders['user:a'].baits, 1);
  game.reverse(); save(h, store, game, 3);
  game = restored(new RoomStore(h.sql), f);
  assert.equal(game.data.history[0].outcome, 'overturned');
  assert.equal(game.result, game.data.history[0]);
  assert.equal(game.data.history[0].award, undefined);
  assert.equal(game.data.leaders['user:a'].baits, 0);
  assert.equal(game.score.wins, 0);
});

test('new round removes old hot records while preserving the previous round award board across wake', (t) => {
  const h = storage(); t.after(() => h.db.close());
  const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); f.chat('first-hint', 'user:a'); f.chat('vote', 'user:a', '!skip');
  f.game.transcript(f.transcript());
  const board = f.game.awardBoard!;
  save(h, store, f.game, 1);
  f.add(10000); f.game.tick(); f.game.start(); save(h, store, f.game, 2);
  const game = restored(new RoomStore(h.sql), f);
  assert.equal(game.round!.participants.size, 0);
  assert.equal(game.round!.votes.size, 0);
  assert.equal(game.round!.seen.size, 0);
  assert.equal(game.checkpoint().chatIds.length, 0);
  assert.equal(game.awardBoard!.roundId, board.roundId);
  game.award(board.roundId, board.candidates[0].id);
  assert.equal(game.data.history[0].award!.name, 'user:a');
  save(h, store, game, 3);
  assert.equal(restored(new RoomStore(h.sql), f).data.leaders['user:a'].baits, 1);
});

test('ordinary chat writes only changed participant, hint, throttle and dedupe rows', (t) => {
  const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); f.chat('first', 'user:a'); save(h, store, f.game, 1);
  h.calls.length = 0;
  f.chat('second', 'user:b'); save(h, store, f.game, 2);
  assert.deepEqual(h.stateWrites().sort(), [
    JSON.stringify(['chatIds', 'second']), listItem('hints', f.game.round!.hints[1].id), listOrder('hints'),
    JSON.stringify(['participants', 'user:b']), JSON.stringify(['recentChat', 'user:b']),
  ].sort());
  assert.equal(h.stateWrites().includes('base'), false, 'clean chat must not rewrite the room base');
  assert.equal(h.writes().some(({ query }) => query.startsWith('DELETE')), false);
  assert.equal(h.writes().some(({ query }) => query.startsWith('INSERT INTO meta')), true);
  h.calls.length = 0;
  assert.equal(f.chat('throttled', 'user:b'), false);
  save(h, store, f.game, 3);
  assert.deepEqual(h.stateWrites(), [JSON.stringify(['chatIds', 'throttled'])]);
  const game = restored(new RoomStore(h.sql), f);
  assert.equal(game.chat('throttled', 'user:c', 'C', 'a later retry', f.clock()), false);
});

test('false-return spoiler mutation writes its bounded evidence and survives SQLite wake', (t) => {
  const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); save(h, store, f.game, 1); h.calls.length = 0;
  assert.equal(f.chat('spoiler', 'user:a', f.game.round!.word), false);
  save(h, store, f.game, 2);
  assert.deepEqual(h.stateWrites().sort(), ['base', JSON.stringify(['chatIds', 'spoiler']),
    listItem('hints', f.game.round!.hints[0].id), listOrder('hints')].sort());
  const game = restored(new RoomStore(h.sql), f);
  assert.equal(game.round!.violations, 1);
  assert.equal(game.round!.hints[0].eligible, false);
  assert.equal(game.round!.participants.size, 0);
});

test('a saturated 60-hint list writes only the new hint, evicted hint and bounded order', (t) => {
  const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin();
  for (let n = 0; n < 40; n++) f.chat(`valid:${n}`, `valid-user:${n}`);
  for (let n = 0; n < 20; n++) f.chat(`spoiled:${n}`, `spoiled-user:${n}`, f.game.round!.word);
  assert.equal(f.game.round!.hints.length, 60);
  save(h, store, f.game, 1);
  const removed = f.game.round!.hints[0].id;
  const retained = f.game.round!.hints.slice(1).map((hint) => hint.id);
  h.calls.length = 0;
  f.chat('newest', 'new-user'); save(h, store, f.game, 2);
  const added = f.game.round!.hints.at(-1)!.id;
  assert.equal(f.game.round!.hints.length, 60);
  assert.deepEqual(h.stateWrites().filter((key) => key.includes('list-')).sort(), [
    listItem('hints', removed), listItem('hints', added), listOrder('hints'),
  ].sort());
  for (const id of retained) assert.equal(h.stateWrites().includes(listItem('hints', id)), false);
  assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), plain(f.game.checkpoint()));
});

test('a new history result does not rewrite retained history rows when their display order shifts', (t) => {
  const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); f.game.end('ended'); save(h, store, f.game, 1);
  const retained = f.game.data.history[0].id;
  f.add(10000); f.game.tick(); f.game.start(); h.calls.length = 0;
  f.game.end('ended'); save(h, store, f.game, 2);
  const added = f.game.data.history[0].id;
  assert.notEqual(added, retained);
  assert.deepEqual(h.stateWrites().filter((key) => key.includes('history')).sort(), [
    listItem('history', added), listOrder('history'),
  ].sort());
  assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), plain(f.game.checkpoint()));
});

test('indexed v1 lists load unchanged and migrate atomically on the next successful save', (t) => {
  const h = storage(); t.after(() => h.db.close()); new RoomStore(h.sql); const f = fixture();
  f.game.begin(); f.chat('hint', 'user:a'); f.game.transcript(f.transcript());
  const before = plain(f.game.checkpoint());
  const legacy = legacyPartition(f.game.checkpoint());
  h.transaction(() => {
    for (const [key, value] of legacy) h.sql.exec('INSERT INTO state_part(key,value) VALUES(?,?)', key, value);
    h.sql.exec('INSERT INTO meta(id,channel,revision,generation) VALUES(1,?,?,?)', '123', 1, 1);
  });
  const store = new RoomStore(h.sql);
  const game = restored(store, f);
  assert.deepEqual(plain(game.checkpoint()), before);
  assert.equal(game.result, game.data.history[0]);
  h.inject((query, bindings) => query.startsWith('INSERT INTO state_part') && bindings[0] === listOrder('history'));
  assert.throws(() => save(h, store, game, 2), /injected SQL failure/);
  h.inject();
  assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), before);
  assert.deepEqual(plain(restored(store, f).checkpoint()), before);
  save(h, store, game, 2);
  const keys = h.db.prepare('SELECT key FROM state_part').all().map((row) => row.key);
  for (const name of ['history', 'hints', 'reviewHints']) {
    assert.ok(keys.includes(listOrder(name)));
    assert.equal(keys.some((key) => (key as string).startsWith(`["${name}",`)), false);
  }
  assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), before);
});

test('state byte and row limits reject before any SQL mutation or cache publication', (t) => {
  const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); save(h, store, f.game, 1); const before = plain(f.game.checkpoint());
  const bytes = f.game.checkpoint(); bytes.connection.detail = 'x'.repeat(LIMITS.stateBytes);
  const rows = f.game.checkpoint();
  rows.round!.participants = Array.from({ length: 10000 }, (_, i) => [`user:${i}`, 'Viewer']);
  rows.recentChat = Array.from({ length: 10000 }, (_, i) => [`user:${i}`, f.clock()]);
  rows.chatIds = Array.from({ length: 10001 }, (_, i) => `message:${i}`);
  // All individual core collection bounds are valid; the storage aggregate is not.
  Game.restore(rows, f.clock);
  for (const state of [bytes, rows]) {
    h.calls.length = 0;
    assert.throws(() => h.transaction(() => store.save(state, '123', 2, 1)), /room_capacity/);
    assert.equal(h.writes().length, 0);
    assert.deepEqual(plain(restored(store, f).checkpoint()), before);
    assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), before);
    assert.equal(store.metadata().revision, 1);
  }
});

for (const failure of ['state-row', 'receipt'] as const) {
  test(`SQL transaction rolls back game, revision and receipt after ${failure} failure; retry commits once`, (t) => {
    const h = storage(); t.after(() => h.db.close()); const store = new RoomStore(h.sql); const f = fixture();
    f.game.begin(); save(h, store, f.game, 1);
    const before = plain(f.game.checkpoint());
    f.chat('new-clue', 'user:a');
    const receipt = { ok: true, revision: 2, generation: 1 };
    let inserted = 0;
    h.inject((query) => failure === 'receipt' ? query.startsWith('INSERT INTO receipt')
      : query.startsWith('INSERT INTO state_part') && ++inserted === 2);
    assert.throws(() => h.transaction(() => {
      store.save(f.game.checkpoint(), '123', 2, 1);
      store.record('receipt-a', 'fingerprint', receipt, f.clock());
    }), /injected SQL failure/);
    h.inject();
    assert.deepEqual(plain(restored(store, f).checkpoint()), before, 'cache is published only after successful commit');
    assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), before, 'durable state rolled back');
    assert.equal(store.metadata().revision, 1);
    assert.equal(store.receiptCount(), 0);
    assert.equal(store.receipt('receipt-a', f.clock()), undefined);
    const records = h.transaction(() => {
      const next = store.save(f.game.checkpoint(), '123', 2, 1);
      store.record('receipt-a', 'fingerprint', receipt, f.clock());
      return next;
    });
    store.committed(records);
    assert.deepEqual(plain(restored(new RoomStore(h.sql), f).checkpoint()), plain(f.game.checkpoint()));
    assert.equal(store.metadata().revision, 2);
    assert.deepEqual(JSON.parse(store.receipt('receipt-a', f.clock())!.body), receipt);
    assert.equal(store.receiptCount(), 1);
  });
}

test('receipt expiry is exact, bounded and survives store reconstruction', (t) => {
  const h = storage(); t.after(() => h.db.close()); let store = new RoomStore(h.sql); const f = fixture();
  f.game.begin(); save(h, store, f.game, 1);
  h.transaction(() => store.record('command', 'hash', { ok: true, revision: 1, generation: 1 }, f.clock()));
  store = new RoomStore(h.sql);
  assert.equal(store.receiptDeadline(), f.clock() + LIMITS.receiptMs);
  assert.ok(store.receipt('command', f.clock() + LIMITS.receiptMs - 1));
  assert.equal(store.receipt('command', f.clock() + LIMITS.receiptMs), undefined);
  h.transaction(() => store.prune(f.clock() + LIMITS.receiptMs));
  assert.equal(store.receiptCount(), 0);
  assert.equal(store.receiptDeadline(), null);
});

test('malformed records fail closed and hostile leader keys cannot mutate an object prototype', () => {
  const f = fixture(); f.game.begin(); f.chat('hint', 'user:a');
  const records = partition(f.game.checkpoint());
  assert.throws(() => assemble(new Map([...records].filter(([key]) => key !== 'base'))), /missing_room_state/);
  const unknown = new Map(records); unknown.set(JSON.stringify(['unexpected', 'id']), '{}');
  assert.throws(() => assemble(unknown), /unknown_record/);
  for (const key of [JSON.stringify(['leaders', 'user:a', 'extra']), JSON.stringify(['leaders']), JSON.stringify(['leaders', 42])]) {
    const invalid = new Map(records); invalid.set(key, JSON.stringify({ name: 'bad', rounds: 1 }));
    assert.throws(() => assemble(invalid), /invalid_record/);
  }
  const gap = legacyPartition(f.game.checkpoint()); gap.delete(JSON.stringify(['hints', '0'])); gap.set(JSON.stringify(['hints', '1']), JSON.stringify(f.game.round!.hints[0]));
  assert.throws(() => assemble(gap), /invalid_record/);
  const hostile = new Map(records); hostile.set(JSON.stringify(['leaders', '__proto__']), JSON.stringify({ name: 'bad', rounds: 1 }));
  assert.throws(() => Game.restore(assemble(hostile)));
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'name'), false);
});

test('stable list records reject missing, duplicate, mismatched, mixed and orphaned ordering', () => {
  const f = fixture(); f.game.begin(); f.chat('hint', 'user:a');
  const original = partition(f.game.checkpoint()), id = f.game.round!.hints[0].id;
  const mutations = [
    (records: Map<string, string>) => records.delete(listOrder('hints')),
    (records: Map<string, string>) => records.delete(listItem('hints', id)),
    (records: Map<string, string>) => records.set(listOrder('hints'), JSON.stringify([id, id])),
    (records: Map<string, string>) => records.set(listOrder('hints'), JSON.stringify(['unknown'])),
    (records: Map<string, string>) => records.set(listItem('hints', 'wrong-id'), records.get(listItem('hints', id))!),
    (records: Map<string, string>) => records.set(JSON.stringify(['hints', '0']), records.get(listItem('hints', id))!),
    (records: Map<string, string>) => records.set(listOrder('reviewHints'), '[]'),
    (records: Map<string, string>) => records.set(listOrder('hints'), JSON.stringify(Array.from({ length: 61 }, (_, n) => `id:${n}`))),
  ];
  for (const mutate of mutations) {
    const records = new Map(original); mutate(records);
    assert.throws(() => assemble(records), /invalid_record|orphan_record/);
  }
});
