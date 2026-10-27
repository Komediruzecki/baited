import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import { buildCardPreviews } from '../scripts/card-previews.mjs'

test('landing derivatives cap decode dimensions, preserve pixel colours and leave masters intact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'baited-art-preview-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  const destination = join(root, 'output')
  await mkdir(source)
  const master = join(source, 'pixel-proof.png')
  await sharp({ create: { width: 1254, height: 1254, channels: 4, background: '#9146ff' } }).png().toFile(master)
  const original = await readFile(master)
  assert.equal(await buildCardPreviews({ source, destination }), 1)
  const image = sharp(join(destination, 'pixel-proof.webp'))
  const metadata = await image.metadata()
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 640, 640])
  const expected = await sharp(original).resize({ width: 640, height: 640, kernel: 'nearest' }).ensureAlpha().raw().toBuffer()
  assert.deepEqual(await image.ensureAlpha().raw().toBuffer(), expected, 'lossless encoding introduces no new colours or ringing')
  assert.deepEqual(await readFile(master), original)
})
