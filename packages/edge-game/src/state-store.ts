import type { GameCheckpoint } from '@baited/game-core';
import { LIMITS } from './protocol.js';

// Split hot collections into individual records. A chat event never rewrites every
// channel or its entire participant/leaderboard map. The single-room base is bounded.
export function partition(state: GameCheckpoint): Map<string, string> {
  const copy = structuredClone(state) as unknown as Record<string, any>;
  const records = new Map<string, string>();
  const take = (name: string, owner: Record<string, any>, field: string, kind: 'map' | 'set' | 'object' | 'list') => {
    const value = owner[field];
    const entries: [string, unknown][] = kind === 'map' ? value
      : kind === 'set' ? value.map((key: string) => [key, true])
      : kind === 'object' ? Object.entries(value)
      : value.map((item: unknown, index: number) => [String(index), item]);
    for (const [key, item] of entries) records.set(JSON.stringify([name, key]), JSON.stringify(item));
    owner[field] = kind === 'object' ? {} : [];
  };
  take('leaders', copy.data, 'leaders', 'object');
  take('history', copy.data, 'history', 'list');
  for (const field of ['awardOwners', 'recentChat']) take(field, copy, field, 'map');
  take('chatIds', copy, 'chatIds', 'set');
  if (copy.round) {
    take('participants', copy.round, 'participants', 'map');
    for (const field of ['votes', 'seen']) take(field, copy.round, field, 'set');
    take('hints', copy.round, 'hints', 'list');
  }
  if (copy.review) take('reviewHints', copy.review, 'candidates', 'list');
  records.set('base', JSON.stringify(copy));
  const bytes = [...records].reduce((n, [k, v]) => n + new TextEncoder().encode(k + v).length, 0);
  if (bytes > LIMITS.stateBytes || records.size > LIMITS.stateRows) throw new Error('room_capacity');
  return records;
}

export function assemble(records: ReadonlyMap<string, string>): unknown {
  const base = records.get('base'); if (!base) throw new Error('missing_room_state');
  const state = JSON.parse(base);
  // Object.create(null) avoids user-controlled identity keys mutating prototypes.
  state.data.leaders = Object.create(null);
  const lists = new Map<string, [number, unknown][]>();
  for (const [key, value] of records) {
    if (key === 'base') continue;
    const decoded: unknown = JSON.parse(key);
    if (!Array.isArray(decoded) || decoded.length !== 2 || decoded.some((value) => typeof value !== 'string'))
      throw new Error('invalid_record');
    const [name, id] = decoded as [string, string]; const item = JSON.parse(value);
    if (name === 'leaders') {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('invalid_record');
      state.data.leaders[id] = item;
    }
    else if (name === 'awardOwners' || name === 'recentChat') state[name].push([id, item]);
    else if (name === 'chatIds') state.chatIds.push(id);
    else if (name === 'participants' && state.round) state.round.participants.push([id, item]);
    else if ((name === 'votes' || name === 'seen') && state.round) state.round[name].push(id);
    else if (['history', 'hints', 'reviewHints'].includes(name)) {
      if (!/^\d+$/.test(id)) throw new Error('invalid_record');
      const list = lists.get(name) ?? []; list.push([Number(id), item]); lists.set(name, list);
    } else throw new Error('unknown_record');
  }
  for (const [name, list] of lists) {
    list.sort((a, b) => a[0] - b[0]);
    if (list.some(([index], i) => index !== i)) throw new Error('invalid_record');
    const values = list.map(([, value]) => value);
    if (name === 'history') state.data.history = values;
    else if (name === 'hints' && state.round) state.round.hints = values;
    else if (name === 'reviewHints' && state.review) state.review.candidates = values;
    else throw new Error('orphan_record');
  }
  return state;
}

export class RoomStore {
  private records = new Map<string, string>();
  constructor(private sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS state_part (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), channel TEXT NOT NULL,
        revision INTEGER NOT NULL, generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipt (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
        body TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS receipt_expiry ON receipt(expires);
      CREATE TABLE IF NOT EXISTS approved_art (id TEXT PRIMARY KEY, descriptor TEXT NOT NULL);`);
    for (const row of sql.exec<{key:string;value:string}>('SELECT key,value FROM state_part')) this.records.set(row.key, row.value);
  }
  load(): unknown | null { return this.records.size ? assemble(this.records) : null; }
  metadata() { return this.sql.exec<{channel:string; revision:number; generation:number}>('SELECT channel,revision,generation FROM meta WHERE id=1').toArray()[0]; }
  /** Caller wraps mutations and receipts in storage.transactionSync. */
  save(state: GameCheckpoint, channel: string, revision: number, generation: number): Map<string,string> {
    const next = partition(state);
    for (const key of this.records.keys()) if (!next.has(key)) this.sql.exec('DELETE FROM state_part WHERE key=?', key);
    for (const [key,value] of next) if (this.records.get(key) !== value)
      this.sql.exec('INSERT INTO state_part(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,value);
    this.sql.exec('INSERT INTO meta(id,channel,revision,generation) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,generation=excluded.generation',channel,revision,generation);
    return next;
  }
  committed(next: Map<string,string>) { this.records = next; }
  receipt(key: string, now: number) {
    return this.sql.exec<{fingerprint:string; body:string}>('SELECT fingerprint,body FROM receipt WHERE key=? AND expires>?', key,now).toArray()[0];
  }
  prune(now: number) { this.sql.exec('DELETE FROM receipt WHERE expires<=?',now); }
  receiptCount() { return this.sql.exec<{n:number}>('SELECT count(*) AS n FROM receipt').one().n; }
  record(key: string, hash: string, body: unknown, now: number) {
    this.sql.exec('INSERT INTO receipt(key,fingerprint,body,expires) VALUES(?,?,?,?)',key,hash,JSON.stringify(body),now+LIMITS.receiptMs);
  }
  receiptDeadline(): number | null { return this.sql.exec<{at:number|null}>('SELECT min(expires) AS at FROM receipt').one().at; }
  art(id: string): unknown | null {
    const row = this.sql.exec<{descriptor:string}>('SELECT descriptor FROM approved_art WHERE id=?',id).toArray()[0];
    return row ? JSON.parse(row.descriptor) : null;
  }
}
