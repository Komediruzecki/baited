import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CHAT_PACE, ROUND_LENGTH, ROUND_SECONDS, TALK_BEATS, clockText } from '../site/why-scenes.js'

// Timing and copy rules for the scenes inside the "How it plays" cards. Their drawing is checked in a browser.

test('the round clock reads like the film and never goes below zero', () => {
  assert.equal(clockText(ROUND_SECONDS), '01:42')
  assert.equal(clockText(ROUND_LENGTH), '02:00')
  assert.equal(clockText(9), '00:09')
  assert.equal(clockText(-3), '00:00')
})

test('chat messages arrive slower than the chat scrolls, so a new line never cuts off the last one', () => {
  const scroll = 0.45 // seconds, the feed's slide-up
  for (const gap of CHAT_PACE) assert.ok(gap > scroll + 0.2, `${gap}s between messages`)
})

test('the facecam alternates talking and resting, so its loop repeats cleanly', () => {
  assert.equal(TALK_BEATS.length % 2, 0)
  assert.ok(TALK_BEATS.every((beat) => beat > 0 && beat < 1))
})

test("the chat is the trailer's: it steers toward the word and never types it", async () => {
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const feed = html.match(/<ol class="why-chat__feed">([\s\S]*?)<\/ol>/)[1]
  const lines = [...feed.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
  assert.ok(lines.length >= 12)
  assert.equal(lines.filter((line) => /birthday/i.test(line)).length, 0)
  for (const hint of ['happy special day king', 'make a wish', 'cake']) {
    assert.ok(lines.some((line) => line.includes(hint)), `chat hints "${hint}"`)
  }
})
