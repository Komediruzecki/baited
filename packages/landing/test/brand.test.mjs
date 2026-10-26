import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewMark } from '../site/brand.js'

test('logo proofs are selectable only on the local and development hosts', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'dev.baited.maff.app']) {
    for (const mark of ['a', 'b', 'c']) assert.equal(reviewMark(host, `?mark=${mark}`), mark)
  }
  for (const host of [
    'baited.maff.app', 'baited.maff.app.', 'dev.baited.maff.app.example.com',
    'bait.maff.app', 'dev.bait.maff.app', 'dev.bait.maff.app.example.com', 'example.com',
  ]) {
    assert.equal(reviewMark(host, '?mark=a'), null)
  }
})

test('a proof query cannot choose an arbitrary asset path', () => {
  for (const query of ['', '?mark=d', '?mark=', '?mark=../../file', '?mark=https%3A%2F%2Fexample.com', '?mark=A']) {
    assert.equal(reviewMark('localhost', query), null)
  }
})
