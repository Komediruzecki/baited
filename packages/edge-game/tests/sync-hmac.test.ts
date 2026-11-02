import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { base64url, hmacSha256, sha256 } from '../src/sync-hmac.js';

test('sha256 matches node:crypto across block boundaries', () => {
  for (const length of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 70_000]) {
    const data = randomBytes(length);
    assert.equal(Buffer.from(sha256(data)).toString('hex'), createHash('sha256').update(data).digest('hex'), `length ${length}`);
  }
  assert.equal(Buffer.from(sha256(new TextEncoder().encode('abc'))).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('hmacSha256 matches node:crypto and RFC 4231', () => {
  for (const keyLength of [0, 1, 20, 32, 63, 64, 65, 131]) for (const length of [0, 9, 64, 200]) {
    const key = randomBytes(keyLength), message = randomBytes(length);
    assert.equal(Buffer.from(hmacSha256(key, message)).toString('hex'), createHmac('sha256', key).update(message).digest('hex'), `key ${keyLength}, message ${length}`);
  }
  // RFC 4231 test case 2.
  assert.equal(Buffer.from(hmacSha256(new TextEncoder().encode('Jefe'), new TextEncoder().encode('what do ya want for nothing?'))).toString('hex'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
});

test('base64url matches node and gives 43 characters for a signature', () => {
  for (const length of [0, 1, 2, 3, 31, 32, 33]) {
    const bytes = randomBytes(length);
    assert.equal(base64url(bytes), bytes.toString('base64url'), `length ${length}`);
  }
  assert.match(base64url(randomBytes(32)), /^[A-Za-z0-9_-]{43}$/);
});
