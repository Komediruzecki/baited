import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { EdgeArtError, pngInfo } from '../src/card-art.js';
import { chunk, concat, ihdr, png, SIGNATURE } from './png-fixture.js';

const code = (bytes: Uint8Array) => {
  try { pngInfo(bytes); return 'accepted'; } catch (error) { assert.ok(error instanceof EdgeArtError); return error.code; }
};

test('pngInfo accepts fitted PNGs up to 512 px and 1 MB', () => {
  assert.deepEqual(pngInfo(png(1, 1)), { width: 1, height: 1 });
  assert.deepEqual(pngInfo(png(512, 300)), { width: 512, height: 300 });
  // Ancillary chunks a browser or OS encoder may add still pass (Apple writes iDOT).
  assert.equal(code(png(8, 8, { before: [chunk('sRGB', new Uint8Array([0])), chunk('iDOT', new Uint8Array(28)), chunk('pHYs', new Uint8Array(9))] })), 'accepted');
  // The framing check does not decode pixels, so the size cap is what bounds IDAT.
  assert.equal(code(png(512, 512, { idat: randomBytes(1024 * 1024 - 100) })), 'accepted');
});

test('pngInfo refuses what Studio never uploads', () => {
  assert.equal(code(png(513, 10)), 'image_dimensions');
  assert.equal(code(png(10, 513)), 'image_dimensions');
  assert.equal(code(png(512, 512, { idat: randomBytes(1024 * 1024) })), 'invalid_image', 'over 1 MB');
  for (const type of ['acTL', 'fcTL', 'tEXt', 'zTXt', 'iTXt', 'eXIf'])
    assert.equal(code(png(4, 4, { before: [chunk(type, new Uint8Array(8))] })), 'invalid_image', type);
  assert.equal(code(png(4, 4, { before: [chunk('ABCD', new Uint8Array(4))] })), 'invalid_image', 'unknown critical chunk');
  assert.equal(code(png(4, 4, { after: [new Uint8Array([1, 2, 3])] })), 'invalid_image', 'bytes after IEND');
  assert.equal(code(png(4, 4, { after: [chunk('IEND')] })), 'invalid_image', 'a second IEND');
  assert.equal(code(concat([SIGNATURE, ihdr(4, 4), chunk('IEND')])), 'invalid_image', 'no IDAT');
  assert.equal(code(png(4, 4).subarray(0, -12)), 'invalid_image', 'no IEND');
  assert.equal(code(concat([SIGNATURE, chunk('sRGB', new Uint8Array([0])), ihdr(4, 4), chunk('IDAT', new Uint8Array(40)), chunk('IEND')])), 'invalid_image', 'IHDR not first');
  assert.equal(code(concat([SIGNATURE, ihdr(4, 4, 8, 1), chunk('IDAT', new Uint8Array(40)), chunk('IEND')])), 'invalid_image', 'colour type 1');
  assert.equal(code(concat([SIGNATURE, ihdr(4, 4, 4, 6), chunk('IDAT', new Uint8Array(40)), chunk('IEND')])), 'invalid_image', '4-bit RGBA');
  assert.equal(code(concat([SIGNATURE, ihdr(0, 4), chunk('IDAT', new Uint8Array(40)), chunk('IEND')])), 'invalid_image', 'zero width');
  const truncated = png(4, 4); new DataView(truncated.buffer).setUint32(33, 0x7fffffff);
  assert.equal(code(truncated), 'invalid_image', 'chunk length past the end');
  const jpeg = new Uint8Array(200); jpeg.set([255, 216, 255]);
  assert.equal(code(jpeg), 'invalid_image');
});
