import { describe, expect, it, vi } from 'vitest'
import { hostOf, serveReviewHost } from './index'

const REVIEW_ORIGIN = 'https://review.example.net'
const PRODUCTION_HOST = 'www.example.org'
// What the build ships in public/robots.txt, which is right for production only.
const BUILD_ROBOTS_TXT = 'User-agent: *\nAllow: /\n\nSitemap: https://www.example.org/sitemap.xml\n'

/** The lines a crawler acts on: everything but comments and blank lines. */
function directives(robotsTxt: string): string[] {
  return robotsTxt.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'))
}

describe('serveReviewHost', () => {
  it('answers robots.txt with an allow-all and no sitemap, never the build copy', async () => {
    const next = vi.fn(async () => new Response(BUILD_ROBOTS_TXT, { headers: { 'content-type': 'text/plain' } }))
    const response = await serveReviewHost(new Request(`${REVIEW_ORIGIN}/robots.txt`), PRODUCTION_HOST, next)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(directives(body)).toEqual(['User-agent: *', 'Allow: /'])
    expect(body).toContain(PRODUCTION_HOST)
    expect(next).not.toHaveBeenCalled()
  })

  it('sets noindex on every other response and keeps its status, headers and body', async () => {
    const page = '<!doctype html><title>Not found</title>'
    const next = vi.fn(
      async () =>
        new Response(page, {
          status: 404,
          statusText: 'Not Found',
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
        })
    )
    const response = await serveReviewHost(new Request(`${REVIEW_ORIGIN}/missing/`), PRODUCTION_HOST, next)

    expect(next).toHaveBeenCalledOnce()
    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate')
    expect(await response.text()).toBe(page)
  })

  it('keeps a redirect target, and a 304 without a body', async () => {
    const redirect = await serveReviewHost(
      new Request(`${REVIEW_ORIGIN}/support`),
      PRODUCTION_HOST,
      async () => new Response(null, { status: 307, headers: { location: '/support/' } })
    )
    expect(redirect.status).toBe(307)
    expect(redirect.headers.get('location')).toBe('/support/')
    expect(redirect.headers.get('x-robots-tag')).toBe('noindex, nofollow')

    const unchanged = await serveReviewHost(
      new Request(`${REVIEW_ORIGIN}/`, { headers: { 'if-none-match': '"v1"' } }),
      PRODUCTION_HOST,
      async () => new Response(null, { status: 304, headers: { etag: '"v1"' } })
    )
    expect(unchanged.status).toBe(304)
    expect(unchanged.body).toBeNull()
    expect(unchanged.headers.get('etag')).toBe('"v1"')
    expect(unchanged.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('replaces an X-Robots-Tag the response already carries rather than adding to it', async () => {
    const response = await serveReviewHost(
      new Request(`${REVIEW_ORIGIN}/`),
      PRODUCTION_HOST,
      async () => new Response('ok', { headers: { 'X-Robots-Tag': 'all' } })
    )

    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})

describe('hostOf', () => {
  it('names the host the way a route does: no trailing dot, port or capitals', () => {
    expect(hostOf(new Request('https://Review.Example.NET.:8443/robots.txt'))).toBe('review.example.net')
  })
})
