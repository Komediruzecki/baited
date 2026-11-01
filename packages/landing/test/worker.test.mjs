import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import worker from '../src/worker.ts'

const origin = 'https://dev.baited.maff.app'
const productionOrigin = 'https://baited.maff.app'
const environments = [
  { ENVIRONMENT: 'dev', origin },
  { ENVIRONMENT: 'prod', origin: productionOrigin },
]
const legacyEnvironments = [
  { ENVIRONMENT: 'dev', origin: 'https://dev.bait.maff.app', canonical: origin },
  { ENVIRONMENT: 'prod', origin: 'https://bait.maff.app', canonical: productionOrigin },
]

test('legacy hosts permanently redirect to their canonical host with the path and query intact', async () => {
  for (const { ENVIRONMENT, origin, canonical } of legacyEnvironments) {
    for (const method of ['GET', 'HEAD']) {
      for (const path of ['/', '/terms?from=twitch&return=%2Fprivacy', '/lab/brand/?mark=b', '/robots.txt', '/sitemap.xml']) {
        const response = await worker.fetch(new Request(`${origin}${path}`, { method }), {
          ENVIRONMENT,
          ASSETS: { fetch: async () => assert.fail('legacy hosts must not serve duplicate assets') },
        })
        assert.equal(response.status, 308)
        assert.equal(response.headers.get('location'), `${canonical}${path}`)
        assert.equal(await response.text(), '')
        assertHeaders(response)
      }
    }
  }
})

test('legacy redirect destinations cannot be changed by paths, query parameters or incoming ports', async () => {
  for (const { ENVIRONMENT, origin, canonical } of legacyEnvironments) {
    for (const path of ['//attacker.example/path?next=https%3A%2F%2Fattacker.example', '/%2F%2Fattacker.example/?host=attacker.example']) {
      const response = await worker.fetch(new Request(`${origin}:8443${path}`), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => assert.fail('redirects must bypass assets') },
      })
      assert.equal(response.status, 308)
      const destination = new URL(response.headers.get('location'))
      assert.equal(destination.origin, canonical)
      assert.equal(destination.pathname + destination.search, path)
    }
  }
})

test('legacy aliases still reject writes and unknown environments before redirecting', async () => {
  for (const { ENVIRONMENT, origin } of legacyEnvironments) {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const response = await worker.fetch(new Request(origin, { method }), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => assert.fail('writes must bypass assets') },
      })
      assert.equal(response.status, 405)
      assert.equal(response.headers.get('location'), null)
      assert.equal(response.headers.get('allow'), 'GET, HEAD')
      assertHeaders(response)
    }
    for (const ENVIRONMENT of [undefined, 'preview']) {
      const response = await worker.fetch(new Request(origin), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => assert.fail('unknown environments must bypass assets') },
      })
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('location'), null)
      assertHeaders(response)
    }
  }
})

test('document canonical links use the new production origin', async () => {
  for (const [file, path] of [['index.html', '/'], ['terms/index.html', '/terms'], ['privacy/index.html', '/privacy'], ['setup/index.html', '/setup/']]) {
    const html = await readFile(new URL(`../site/${file}`, import.meta.url), 'utf8')
    assert.equal(html.match(/<link rel="canonical" href="([^"]+)"/)[1], productionOrigin + path)
  }
})

test('the pilot guide and its stylesheet reach the assets binding with the landing security policy', async () => {
  for (const { ENVIRONMENT, origin } of environments) {
    for (const method of ['GET', 'HEAD']) {
      for (const [path, type] of [['/setup', 'text/html'], ['/setup/', 'text/html'], ['/setup/setup.css', 'text/css']]) {
        const url = `${origin}${path}?from=studio`
        let calls = 0
        const response = await worker.fetch(new Request(url, { method }), {
          ENVIRONMENT,
          ASSETS: { fetch: async request => {
            calls += 1
            assert.equal(request.url, url, 'the binding receives the original path and query')
            assert.equal(request.method, method)
            return new Response('Setup guide asset', { headers: { 'Content-Type': type } })
          } },
        })
        assert.equal(calls, 1)
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('content-type'), type)
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'Setup guide asset')
        assertHeaders(response, ENVIRONMENT === 'prod')
      }
    }
  }
})

test('all lab pages and assets bypass production assets even through encoded prefixes', async () => {
  const paths = [
    '/lab', '/lab/brand/', '/lab/brand/baited-a.png', '/l%61b/brand/', '/lab%2Fbrand%2Fbaited-c.png',
    '/card-lab', '/card-lab/', '/card-lab?edition=foil', '/card-lab/index.html',
    '/card-lab/assets/index-AbC123.js', '/card-lab/assets/style-AbC123.css', '/card-lab/assets/index.js.map',
    '/card-lab/cards/proofs/banana.png', '/card-lab/finishes/foil.webp', '/card-lab/assets/font.woff2',
    '/CARD-LAB/assets/index.js', '/%63ard-lab/', '/card-lab%2Fassets/index.js',
    '/%2Fcard-lab/assets/index.js', '//card-lab/assets/index.js', '/%5Ccard-lab/assets/index.js', '/%zz',
  ]
  for (const path of paths) {
    for (const method of ['GET', 'HEAD']) {
      const response = await worker.fetch(new Request(`${productionOrigin}${path}`, { method }), {
        ENVIRONMENT: 'prod',
        ASSETS: { fetch: async () => assert.fail('lab assets must bypass production assets') },
      })
      assert.equal(response.status, 404, `${method} ${path}`)
      assertHeaders(response)
    }
  }
})

test('dev card lab permits style attributes only and keeps networking and scripts restricted', async () => {
  for (const path of ['/card-lab/', '/card-lab?edition=glance-reveal', '/card-lab/assets/index.js']) {
    const response = await worker.fetch(new Request(`${origin}${path}`), {
      ENVIRONMENT: 'dev',
      ASSETS: { fetch: async () => new Response('Card lab') },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    const policy = response.headers.get('content-security-policy')
    assert.match(policy, /default-src 'none'/)
    assert.match(policy, /script-src 'self'/)
    assert.match(policy, /style-src 'self'/)
    assert.match(policy, /style-src-attr 'unsafe-inline'/)
    assert.doesNotMatch(policy, /unsafe-eval|https?:|script-src[^;]*unsafe-inline/)
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
  }
})

test('lab query flags and similar names do not change the normal landing policy', async () => {
  for (const { ENVIRONMENT, origin } of environments) {
    for (const path of ['/?lab=cards', '/card-laboratory', '/labyrinth']) {
      const response = await worker.fetch(new Request(`${origin}${path}`), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => new Response('Landing') },
      })
      assert.equal(response.status, 200)
      assertHeaders(response, ENVIRONMENT === 'prod')
    }
  }
})

test('the development brand lab keeps preview security and noindex headers', async () => {
  const response = await worker.fetch(new Request(`${origin}/lab/brand/`), {
    ENVIRONMENT: 'dev',
    ASSETS: { fetch: async () => new Response('Logo proofs') },
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'Logo proofs')
  assertHeaders(response)
})

function assertHeaders(response, indexable = false) {
  assert.equal(response.headers.get('x-robots-tag'), indexable ? 'index, follow' : 'noindex, nofollow')
  const policy = response.headers.get('content-security-policy')
  assert.match(policy, /default-src 'none'/)
  assert.match(policy, /script-src 'self'/)
  assert.match(policy, /style-src 'self'/)
  assert.match(policy, /media-src 'self'/)
  assert.match(policy, /frame-ancestors 'none'/)
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
}

test('successful assets keep their body, status and content type with preview headers', async () => {
  const response = await worker.fetch(new Request(origin), {
    ENVIRONMENT: 'dev',
    ASSETS: { fetch: async () => new Response('<h1>BAIT</h1>', { headers: { 'Content-Type': 'text/html' } }) },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/html')
  assert.equal(await response.text(), '<h1>BAIT</h1>')
  assertHeaders(response)
})

test('asset errors retain their status and body without becoming indexable in either environment', async () => {
  for (const { ENVIRONMENT, origin } of environments) {
    for (const status of [404, 500]) {
      const response = await worker.fetch(new Request(`${origin}/missing`), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => new Response('Asset error', { status, headers: { 'Content-Type': 'text/plain' } }) },
      })
      assert.equal(response.status, status)
      assert.equal(await response.text(), 'Asset error')
      assertHeaders(response)
    }
  }
})

test('robots allows crawling to discover noindex and never advertises a sitemap', async () => {
  const response = await worker.fetch(new Request(`${origin}/robots.txt`), {
    ENVIRONMENT: 'dev',
    ASSETS: { fetch: async () => assert.fail('robots must bypass assets') },
  })
  const body = await response.text()
  assert.equal(response.status, 200)
  assert.match(body, /^User-agent: \*$/m)
  assert.match(body, /^Allow: \/$/m)
  assert.doesNotMatch(body, /^Disallow:|^Sitemap:/im)
  assertHeaders(response)
})

test('writes are rejected before assets or generated resources in either environment', async () => {
  for (const { ENVIRONMENT, origin } of environments) {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      for (const path of ['/', '/robots.txt', '/sitemap.xml']) {
        const response = await worker.fetch(new Request(`${origin}${path}`, { method }), {
          ENVIRONMENT,
          ASSETS: { fetch: async () => assert.fail('unsupported methods must bypass assets') },
        })
        assert.equal(response.status, 405)
        assert.equal(response.headers.get('allow'), 'GET, HEAD')
        assertHeaders(response)
      }
    }
  }
})

test('absent and unknown environments fail closed even on the production hostname', async () => {
  for (const ENVIRONMENT of [undefined, 'production', 'preview']) {
    for (const host of [origin, productionOrigin]) {
      for (const path of ['/', '/robots.txt', '/sitemap.xml']) {
        const response = await worker.fetch(new Request(`${host}${path}`), {
          ENVIRONMENT,
          ASSETS: { fetch: async () => assert.fail('unsupported environments must bypass assets') },
        })
        assert.equal(response.status, 404)
        assertHeaders(response)
      }
    }
  }
})

test('production only serves its exact configured hostname and does not redirect lookalikes', async () => {
  for (const host of [
    'dev.baited.maff.app', 'baited.maff.app.', 'baited.maff.app.example.com',
    'dev.bait.maff.app', 'bait.maff.app.', 'bait.maff.app.example.com', 'localhost',
  ]) {
    for (const path of ['/', '/robots.txt', '/sitemap.xml']) {
      const response = await worker.fetch(new Request(`https://${host}${path}`), {
        ENVIRONMENT: 'prod',
        ASSETS: { fetch: async () => assert.fail('other hosts must bypass assets') },
      })
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('location'), null)
      assertHeaders(response)
    }
  }
})

test('production assets are indexable and preserve content and security headers', async () => {
  const response = await worker.fetch(new Request(productionOrigin), {
    ENVIRONMENT: 'prod',
    ASSETS: { fetch: async () => new Response('<h1>BAIT</h1>', { headers: { 'Content-Type': 'text/html' } }) },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/html')
  assert.equal(await response.text(), '<h1>BAIT</h1>')
  assertHeaders(response, true)
})

test('development remains noindex even if requested using the production hostname', async () => {
  const response = await worker.fetch(new Request(productionOrigin), {
    ENVIRONMENT: 'dev',
    ASSETS: { fetch: async () => new Response('<h1>BAIT</h1>') },
  })
  assert.equal(response.status, 200)
  assertHeaders(response)
})

test('production robots advertises the canonical sitemap', async () => {
  const response = await worker.fetch(new Request(`${productionOrigin}/robots.txt`), {
    ENVIRONMENT: 'prod',
    ASSETS: { fetch: async () => assert.fail('robots must bypass assets') },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8')
  assert.equal(await response.text(), `User-agent: *\nAllow: /\n\nSitemap: ${productionOrigin}/sitemap.xml\n`)
  assertHeaders(response, true)
})

test('production sitemap includes only the canonical landing page', async () => {
  const response = await worker.fetch(new Request(`${productionOrigin}/sitemap.xml`), {
    ENVIRONMENT: 'prod',
    ASSETS: { fetch: async () => assert.fail('sitemap must bypass assets') },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/xml; charset=utf-8')
  const body = await response.text()
  assert.match(body, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/)
  assert.deepEqual(
    [...body.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    [`${productionOrigin}/`]
  )
  assertHeaders(response, true)
})

test('films answer byte ranges, so Safari plays them and every browser can seek', async () => {
  const film = Uint8Array.from({ length: 10 }, (_, i) => i)
  for (const { ENVIRONMENT, origin } of environments) {
    const serve = (range, method = 'GET') =>
      worker.fetch(new Request(`${origin}/media/hero-desktop.mp4`, { method, headers: range ? { Range: range } : {} }), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => new Response(film, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '10' } }) },
      })
    for (const [range, from, to] of [['bytes=0-1', 0, 1], ['bytes=2-5', 2, 5], ['bytes=7-', 7, 9], ['bytes=-3', 7, 9], ['bytes=4-99', 4, 9], ['bytes=0-', 0, 9], ['bytes=-99', 0, 9]]) {
      const response = await serve(range)
      assert.equal(response.status, 206, range)
      assert.equal(response.headers.get('content-range'), `bytes ${from}-${to}/10`)
      assert.equal(response.headers.get('accept-ranges'), 'bytes')
      assert.equal(response.headers.get('content-type'), 'video/mp4')
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...film.slice(from, to + 1)])
      assertHeaders(response, ENVIRONMENT === 'prod')
    }
    for (const range of ['bytes=10-', 'bytes=-0']) {
      const response = await serve(range)
      assert.equal(response.status, 416, range)
      assert.equal(response.headers.get('content-range'), 'bytes */10')
      assert.equal((await response.arrayBuffer()).byteLength, 0)
    }
    // No range, a reversed, multi-part or foreign one, or a HEAD: the whole film, saying ranges work.
    for (const [range, method] of [[null, 'GET'], ['bytes=5-2', 'GET'], ['bytes=0-1,4-5', 'GET'], ['items=0-1', 'GET'], ['bytes=0-1', 'HEAD']]) {
      const response = await serve(range, method)
      assert.equal(response.status, 200, `${method} ${range}`)
      assert.equal(response.headers.get('accept-ranges'), 'bytes')
      assert.equal(response.headers.get('content-range'), null)
      assert.equal((await response.arrayBuffer()).byteLength, method === 'HEAD' ? 0 : 10)
    }
  }
})

test('pages, images and missing files ignore byte ranges', async () => {
  for (const [type, status] of [['text/html', 200], ['image/avif', 200], ['video/mp4', 404]]) {
    const response = await worker.fetch(new Request(`${origin}/media/x`, { headers: { Range: 'bytes=0-3' } }), {
      ENVIRONMENT: 'dev',
      ASSETS: { fetch: async () => new Response('<h1>BAIT</h1>', { status, headers: { 'Content-Type': type } }) },
    })
    assert.equal(response.status, status, type)
    assert.equal(await response.text(), '<h1>BAIT</h1>')
    assert.equal(response.headers.get('accept-ranges'), null)
  }
})

test('HEAD keeps status and environment headers without a body', async () => {
  for (const { ENVIRONMENT, origin } of environments) {
    for (const path of ['/', '/robots.txt', '/sitemap.xml', '/missing']) {
      const status = path === '/missing' || (ENVIRONMENT === 'dev' && path === '/sitemap.xml') ? 404 : 200
      const response = await worker.fetch(new Request(`${origin}${path}`, { method: 'HEAD' }), {
        ENVIRONMENT,
        ASSETS: { fetch: async () => new Response('body', { status }) },
      })
      assert.equal(response.status, status)
      assert.equal(await response.text(), '')
      assertHeaders(response, ENVIRONMENT === 'prod' && status === 200)
    }
  }
})
