import type { GameCheckpoint } from '@baited/game-core';
import { LIMITS } from './protocol.js';

const listLimits = new Map([['history', 100], ['hints', 60], ['reviewHints', 60]]);

// Split hot collections into individual records. A chat event never rewrites every
// channel or its entire participant/leaderboard map. Lists use stable IDs plus a
// bounded order record, so evicting their oldest entry does not rewrite the rest.
export function partition(state: GameCheckpoint): Map<string, string> {
  const copy = structuredClone(state) as unknown as Record<string, any>;
  const records = new Map<string, string>();
  const take = (name: string, owner: Record<string, any>, field: string, kind: 'map' | 'set' | 'object' | 'list') => {
    const value = owner[field];
    if (kind === 'list') {
      if (!Array.isArray(value) || value.length > (listLimits.get(name) ?? 0)) throw new Error('invalid_record');
      const order: string[] = [];
      for (const item of value) {
        if (!item || typeof item.id !== 'string' || order.includes(item.id)) throw new Error('invalid_record');
        order.push(item.id);
        records.set(JSON.stringify(['list-item', name, item.id]), JSON.stringify(item));
      }
      records.set(JSON.stringify(['list-order', name]), JSON.stringify(order));
      owner[field] = [];
      return;
    }
    const entries: [string, unknown][] = kind === 'map' ? value
      : kind === 'set' ? value.map((key: string) => [key, true])
      : Object.entries(value);
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
  const legacyLists = new Map<string, [number, unknown][]>();
  const listItems = new Map<string, Map<string, unknown>>();
  const listOrders = new Map<string, string[]>();
  for (const [key, value] of records) {
    if (key === 'base') continue;
    const decoded: unknown = JSON.parse(key);
    if (!Array.isArray(decoded) || decoded.some((value) => typeof value !== 'string'))
      throw new Error('invalid_record');
    if (decoded[0] === 'list-item') {
      const [, name, id] = decoded;
      if (decoded.length !== 3 || !listLimits.has(name)) throw new Error('invalid_record');
      const item = JSON.parse(value);
      if (!item || typeof item !== 'object' || Array.isArray(item) || item.id !== id) throw new Error('invalid_record');
      const items = listItems.get(name) ?? new Map<string, unknown>();
      items.set(id, item);
      if (items.size > listLimits.get(name)!) throw new Error('invalid_record');
      listItems.set(name, items);
      continue;
    }
    if (decoded[0] === 'list-order') {
      const [, name] = decoded;
      const order: unknown = JSON.parse(value);
      if (decoded.length !== 2 || !listLimits.has(name) || !Array.isArray(order) ||
          order.length > listLimits.get(name)! || order.some((id) => typeof id !== 'string') ||
          new Set(order).size !== order.length) throw new Error('invalid_record');
      listOrders.set(name, order);
      continue;
    }
    if (decoded.length !== 2) throw new Error('invalid_record');
    const [name, id] = decoded as [string, string]; const item = JSON.parse(value);
    if (name === 'leaders') {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('invalid_record');
      state.data.leaders[id] = item;
    }
    else if (name === 'awardOwners' || name === 'recentChat') state[name].push([id, item]);
    else if (name === 'chatIds') state.chatIds.push(id);
    else if (name === 'participants' && state.round) state.round.participants.push([id, item]);
    else if ((name === 'votes' || name === 'seen') && state.round) state.round[name].push(id);
    else if (listLimits.has(name)) {
      if (!/^\d+$/.test(id)) throw new Error('invalid_record');
      const list = legacyLists.get(name) ?? []; list.push([Number(id), item]);
      if (list.length > listLimits.get(name)!) throw new Error('invalid_record');
      legacyLists.set(name, list);
    } else throw new Error('unknown_record');
  }
  for (const name of new Set([...legacyLists.keys(), ...listOrders.keys(), ...listItems.keys()])) {
    const legacy = legacyLists.get(name), order = listOrders.get(name), items = listItems.get(name);
    let values: unknown[];
    if (legacy) {
      // Existing indexed checkpoints are read without mutation; the next atomic
      // save replaces them. Mixed formats indicate an incomplete/corrupt save.
      if (order || items) throw new Error('invalid_record');
      legacy.sort((a, b) => a[0] - b[0]);
      if (legacy.some(([index], i) => index !== i)) throw new Error('invalid_record');
      values = legacy.map(([, value]) => value);
    } else {
      if (!order || order.length !== (items?.size ?? 0) || order.some((id) => !items?.has(id)))
        throw new Error('invalid_record');
      values = order.map((id) => items!.get(id));
    }
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
