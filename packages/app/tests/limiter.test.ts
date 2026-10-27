import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Limiter } from '../server/security.js';

test('a limiter tracking more than 10,000 live keys still admits a new viewer', () => {
  const limiter = new Limiter();
  // Two keys per Extension viewer used to fill the table at about 5,000 viewers.
  for (let i = 0; i < 20_000; i++) assert.equal(limiter.hit(`viewer:1:U${i}`, 180), true, `key ${i}`);
  assert.equal(limiter.hit('viewer:1:Unewcomer', 180), true);
});

test('each key keeps its own limit and window', () => {
  let time = 0;
  const limiter = new Limiter({ now: () => time });
  for (let i = 0; i < 3; i++) assert.equal(limiter.hit('busy', 3), true);
  assert.equal(limiter.hit('busy', 3), false);
  assert.equal(limiter.hit('other', 3), true, 'an unrelated key is unaffected');
  time += 59_999;
  assert.equal(limiter.hit('busy', 3), false, 'the minute is not over');
  time += 1;
  assert.equal(limiter.hit('busy', 3), true, 'a new minute starts a new count');
});

test('memory stays bounded and a newcomer is admitted when the table is full', () => {
  let time = 0;
  const limiter = new Limiter({ maxKeys: 100, now: () => time });
  for (let i = 0; i < 10_000; i++) {
    assert.equal(limiter.hit(`flood:${i}`, 1), true, `key ${i}`);
    assert.ok(limiter.size <= 200, `size ${limiter.size} after ${i + 1} keys`);
    time += 1;
  }
});

test('a key that keeps hitting stays limited through a flood of new keys', () => {
  let time = 0;
  const limiter = new Limiter({ maxKeys: 100, now: () => time });
  for (let i = 0; i < 5; i++) limiter.hit('abuser', 5);
  for (let i = 0; i < 1_000; i++) {
    limiter.hit(`flood:${i}`, 5);
    // The abuser is refused on every try, so the flood never resets its count.
    assert.equal(limiter.hit('abuser', 5), false, `after ${i + 1} flood keys`);
    time += 10;
  }
});

test('ended windows are dropped without waiting for the table to fill', () => {
  let time = 0;
  const limiter = new Limiter({ now: () => time });
  for (let i = 0; i < 1_000; i++) limiter.hit(`viewer:${i}`, 1);
  assert.equal(limiter.size, 1_000);
  time += 60_000;
  limiter.hit('viewer:0', 1);
  assert.ok(limiter.size <= 1_001, `size ${limiter.size} one window later`);
  time += 60_000;
  assert.equal(limiter.hit('viewer:0', 1), true);
  assert.equal(limiter.size, 1, 'two windows later only the active key remains');
});
