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

test('the navigation shows the black logo and the white footer the violet one', async () => {
  const { readFile, stat } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'))
  const footer = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'))
  assert.match(header, /<nav class="site-nav"[^]*src="\/assets\/brand\/baited-logo-black\.webp"/)
  assert.doesNotMatch(header, /class="brand"|brand-hand/, 'the header brand and its card hand are gone')
  assert.match(footer, /src="\/assets\/brand\/baited-logo-violet-large\.webp"/)
  assert.doesNotMatch(header + footer, /baited-logo\.webp|bait-bomb-logo/)
  for (const name of ['baited-logo-black.webp', 'baited-logo-white.webp', 'baited-logo-violet-large.webp']) {
    assert.ok((await stat(new URL(`../site/assets/brand/${name}`, import.meta.url))).size > 0)
  }
})

test('public landing routes share the original-letter favicon and do not load retired branding', async () => {
  const { readFile } = await import('node:fs/promises')
  for (const route of ['index.html', 'privacy/index.html', 'terms/index.html']) {
    const html = await readFile(new URL(`../site/${route}`, import.meta.url), 'utf8')
    assert.match(html, /<link rel="icon" href="\/assets\/brand\/baited-favicon\.png" type="image\/png" sizes="256x256"/)
    assert.doesNotMatch(html, /bait-bomb-logo|emote-(?:grin|smirk|laugh)\.webp|>bait!</i, route)
    assert.doesNotMatch(html, /(?:src|href)="\/lab\/brand\//, `${route} must not load a hook proof`)
  }

  // A standalone PNG works under the landing's strict image CSP and in browser tabs.
  const favicon = await readFile(new URL('../site/assets/brand/baited-favicon.png', import.meta.url))
  assert.deepEqual(favicon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  assert.equal(favicon.readUInt32BE(16), 256)
  assert.equal(favicon.readUInt32BE(20), 256)
})

test('animated card backs and example chat use the same plain BAITED artwork', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  for (const className of ['why-deal__back', 'why-stream__back']) {
    const back = html.match(new RegExp(`class="${className}"[^]*?</(?:div|span)>`))?.[0]
    assert.ok(back, `missing ${className}`)
    assert.match(back, /src="\/assets\/brand\/baited-logo-white\.webp"/)
    assert.match(back, /width="764" height="225"/, 'preserve the wordmark aspect ratio')
  }
  const emotes = [...html.matchAll(/class="why-chat__emote"[^]*?\/>/g)]
  assert.equal(emotes.length, 4)
  for (const [emote] of emotes) assert.match(emote, /src="\/assets\/brand\/baited-logo-white\.webp"/)
})

test('runtime and static card faces use the original BAITED signature', async () => {
  const { readFile } = await import('node:fs/promises')
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../site/app.js', import.meta.url), 'utf8')
  const staticFooter = html.match(/class="card-footer"[^]*?<\/span>/)?.[0]
  assert.ok(staticFooter, 'the example card has a brand footer')
  assert.match(staticFooter, /src="\/assets\/brand\/baited-logo-white\.webp"/)
  assert.match(staticFooter, /alt="BAITED"/)
  const runtimeFooter = app.slice(app.indexOf("const footer = node('span', 'card-footer')"), app.indexOf("const shade = node('span', 'card-shade')"))
  assert.match(runtimeFooter, /signature\.src = '\/assets\/brand\/baited-logo-white\.webp'/)
  assert.match(runtimeFooter, /signature\.alt = 'BAITED'/)
  assert.doesNotMatch(staticFooter + runtimeFooter, /them\.|bait!|node\('b'|<b>/i)
  for (const file of ['app.js', 'deck.js', 'card-expansion.js', 'footer.js']) {
    const source = await readFile(new URL(`../site/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /bait-bomb-logo|emote-(?:grin|smirk|laugh)\.webp|baited-wordmark-b\.png|bait!/i, file)
  }
})
