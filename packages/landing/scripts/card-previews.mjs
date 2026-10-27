import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

// Landing art never displays above 196 CSS pixels. 640px covers that at 3x
// without downloading and decoding the 1254px source on every new card.
// Masters stay untouched; these lossless, nearest-neighbour copies are dev-only.
export async function buildCardPreviews({ source, destination }) {
  const files = (await readdir(source, { withFileTypes: true })).filter(entry => entry.name.endsWith('.png'))
  if (files.some(entry => !entry.isFile() || !/^[a-z0-9-]+\.png$/.test(entry.name))) throw new Error('Card artwork must be ordinary named PNG files')
  await mkdir(destination, { recursive: true })
  // Bound the build's own decoder concurrency as well as the browser's cache.
  for (let offset = 0; offset < files.length; offset += 4) {
    await Promise.all(files.slice(offset, offset + 4).map(entry => sharp(join(source, entry.name))
      .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true, kernel: 'nearest' })
      .webp({ lossless: true, effort: 4 })
      .toFile(join(destination, entry.name.replace(/\.png$/, '.webp')))))
  }
  return files.length
}
