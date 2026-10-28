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

test('the navigation and the white footer show the violet pixel logo', async () => {
  const { readFile, stat } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
  assert.match(header, /<nav class="site-nav"[^]*src="\/assets\/brand\/baited-pixel-violet\.svg"/)
  assert.doesNotMatch(header, /class="brand"|brand-hand/, 'the header brand and its card hand are gone')
  assert.match(footer, /src="\/assets\/brand\/baited-pixel-violet\.svg"/)
  assert.doesNotMatch(header + footer, /baited-logo[\w-]*\.webp|bait-bomb-logo/)
  for (const name of ['baited-pixel-black.svg', 'baited-pixel-white.svg', 'baited-pixel-violet.svg']) {
    assert.ok((await stat(new URL(`../site/assets/brand/${name}`, import.meta.url))).size > 0)
  }
})

test('no public page or card script uses the smooth logo files any more', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const file of ['site/index.html', 'site/terms/index.html', 'site/privacy/index.html', 'site/app.js', 'selected-cards/selected-cards.js', 'selected-cards/selected-cards.css']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /baited-logo[\w-]*\.webp/, file)
  }
})

test('public landing routes share the pixel B favicon and do not load retired branding', async () => {
  const { readFile } = await import('node:fs/promises')
  const { inflateSync } = await import('node:zlib')
  const { PIXEL_FAVICON, pixelFaviconSvg } = await import('../site/pixel-logo.js')
  for (const route of ['index.html', 'privacy/index.html', 'terms/index.html']) {
    const html = await readFile(new URL(`../site/${route}`, import.meta.url), 'utf8')
    assert.match(html, /<link rel="icon" href="\/assets\/brand\/baited-favicon\.png" type="image\/png" sizes="256x256"/)
    assert.match(html, /<link rel="icon" href="\/assets\/brand\/baited-favicon\.svg" type="image\/svg\+xml" sizes="any"/)
    assert.doesNotMatch(html, /bait-bomb-logo|emote-(?:grin|smirk|laugh)\.webp|>bait!</i, route)
    assert.doesNotMatch(html, /(?:src|href)="\/lab\/brand\//, `${route} must not load a hook proof`)
  }

  // The SVG is the wordmark's B on the violet, as built from the grid (scripts/build-pixel-logo.mjs).
  assert.equal((await readFile(new URL('../site/assets/brand/baited-favicon.svg', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'), pixelFaviconSvg())

  // A standalone PNG works under the landing's strict image CSP and in browser tabs: 256 px RGB, the
  // violet ground at its corner and the deep ink in the B's top left square.
  const favicon = await readFile(new URL('../site/assets/brand/baited-favicon.png', import.meta.url))
  assert.deepEqual(favicon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(favicon.readUInt32BE(16), 256)
  assert.equal(favicon.readUInt32BE(20), 256)
  const raw = inflateSync(favicon.subarray(41, 41 + favicon.readUInt32BE(33)))
  const pixel = (x, y) => '#' + [...raw.subarray(y * (256 * 3 + 1) + 1 + x * 3, y * (256 * 3 + 1) + 4 + x * 3)].map((v) => v.toString(16).padStart(2, '0')).join('')
  assert.equal(pixel(4, 4), PIXEL_FAVICON.ground)
  assert.equal(pixel(Math.round((4 * 256) / 13), Math.round((2 * 256) / 13)), PIXEL_FAVICON.ink)
})

test('animated card backs and example chat use the same plain BAITED artwork', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  for (const className of ['why-deal__back', 'why-stream__back']) {
    const back = html.match(new RegExp(`class="${className}"[^]*?</(?:div|span)>`))?.[0]
    assert.ok(back, `missing ${className}`)
    assert.match(back, /src="\/assets\/brand\/baited-pixel-white\.svg"/)
    assert.match(back, /width="370" height="100"/, 'preserve the pixel wordmark aspect ratio')
  }
  const emotes = [...html.matchAll(/class="why-chat__emote"[^]*?\/>/g)]
  assert.equal(emotes.length, 4)
  for (const [emote] of emotes) assert.match(emote, /src="\/assets\/brand\/baited-pixel-white\.svg"/)
})

test('runtime and static card faces use the original BAITED signature', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../site/app.js', import.meta.url), 'utf8')
  const staticFooter = html.match(/class="card-footer"[^]*?<\/span>/)?.[0]
  assert.ok(staticFooter, 'the example card has a brand footer')
  assert.match(staticFooter, /src="\/assets\/brand\/baited-pixel-white\.svg"/)
  assert.match(staticFooter, /alt="BAITED"/)
  const runtimeFooter = app.slice(app.indexOf("const footer = node('span', 'card-footer')"), app.indexOf("const shade = node('span', 'card-shade')"))
  assert.match(runtimeFooter, /signature\.src = '\/assets\/brand\/baited-pixel-white\.svg'/)
  assert.match(runtimeFooter, /signature\.alt = 'BAITED'/)
  assert.doesNotMatch(staticFooter + runtimeFooter, /them\.|bait!|node\('b'|<b>/i)
  for (const file of ['app.js', 'deck.js', 'card-expansion.js', 'footer.js']) {
    const source = await readFile(new URL(`../site/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /bait-bomb-logo|emote-(?:grin|smirk|laugh)\.webp|baited-wordmark-b\.png|bait!/i, file)
  }
})
