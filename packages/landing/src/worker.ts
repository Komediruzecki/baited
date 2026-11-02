import { withErrorDocument } from '../../app/shared/error-pages.js'
import { serveReviewHost } from '@irchiinnuss/review-host'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  ENVIRONMENT?: string
}

const PRODUCTION_HOST = 'baited.maff.app'
const PRODUCTION_ORIGIN = `https://${PRODUCTION_HOST}`
const DEVELOPMENT_ORIGIN = 'https://dev.baited.maff.app'
const LEGACY_PRODUCTION_HOST = 'bait.maff.app'
const LEGACY_DEVELOPMENT_HOST = 'dev.bait.maff.app'

function redirectLocation(url: URL, origin: string): string {
  // Assign path and query to a fixed origin. A path beginning with // must not
  // become a protocol-relative redirect to a visitor-controlled host.
  const target = new URL(origin)
  target.pathname = url.pathname
  target.search = url.search
  return target.href
}

function normalizedPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname).replaceAll('\\', '/').replace(/^\/+/, '/')
  } catch {
    return null
  }
}

function isUnpublishedPath(pathname: string): boolean {
  const path = normalizedPath(pathname)
  return path === null || /^\/(?:lab|card-lab)(?:\/|$)/i.test(path)
}

const CONTENT_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "media-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ')

// Safari plays a film only from a server that answers byte ranges (it asks for bytes 0-1 first), and
// every browser needs them to seek, as the film's arrow keys do. The assets binding answers a range
// with the whole file, so a film or a sound is cut to the asked range here, and says it can be.
async function withRange(request: Request, response: Response): Promise<Response> {
  if (response.status !== 200 || !/^(?:video|audio)\//i.test(response.headers.get('Content-Type') ?? '')) return response
  const headers = new Headers(response.headers)
  headers.set('Accept-Ranges', 'bytes')
  // One range only; a malformed, reversed or multi-part one gets the whole file, as the standard allows.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range')?.trim() ?? '')
  const [first = '', last = ''] = range?.slice(1) ?? []
  if (request.method !== 'GET' || !range || (!first && !last) || (first && last && Number(last) < Number(first)))
    return new Response(response.body, { status: 200, statusText: response.statusText, headers })
  const body = await response.arrayBuffer()
  const size = body.byteLength
  const start = first ? Number(first) : Math.max(0, size - Number(last))
  const end = first && last ? Math.min(Number(last), size - 1) : size - 1
  headers.delete('Content-Length')
  if (start >= size) {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  return new Response(body.slice(start, end + 1), { status: 206, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const isProduction = env.ENVIRONMENT === 'prod' && url.hostname === PRODUCTION_HOST
    const legacyOrigin =
      env.ENVIRONMENT === 'prod' && url.hostname === LEGACY_PRODUCTION_HOST
        ? PRODUCTION_ORIGIN
        : env.ENVIRONMENT === 'dev' && url.hostname === LEGACY_DEVELOPMENT_HOST
          ? DEVELOPMENT_ORIGIN
          : null
    let response: Response
    try {
      if (env.ENVIRONMENT !== 'dev' && !isProduction && !legacyOrigin) {
        response = new Response('Not found.', { status: 404 })
      } else if (request.method !== 'GET' && request.method !== 'HEAD') {
        response = new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } })
      } else if (legacyOrigin) {
        response = new Response(null, { status: 308, headers: { Location: redirectLocation(url, legacyOrigin) } })
      } else if (!isProduction) {
        response = await serveReviewHost(request, PRODUCTION_HOST, () => env.ASSETS.fetch(request))
      } else if (isUnpublishedPath(url.pathname)) {
        response = new Response('Not found.', { status: 404 })
      } else if (url.pathname === '/robots.txt') {
        response = new Response(`User-agent: *\nAllow: /\n\nSitemap: ${PRODUCTION_ORIGIN}/sitemap.xml\n`, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      } else if (url.pathname === '/sitemap.xml') {
        response = new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${PRODUCTION_ORIGIN}/</loc></url></urlset>\n`,
          { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
        )
      } else {
        response = await env.ASSETS.fetch(request)
      }
    } catch {
      response = new Response('Baited is temporarily unavailable.', { status: 503 })
    }
    if (env.ENVIRONMENT === 'dev' || isProduction) response = withErrorDocument(request, response, 'landing')
    response = await withRange(request, response)

    const headers = new Headers(response.headers)
    headers.set('X-Robots-Tag', isProduction && response.ok ? 'index, follow' : 'noindex, nofollow')
    // React uses style attributes for card dimensions and motion controls. The
    // exception is confined to the dev-only gallery; scripts still need self.
    const isCardLab = env.ENVIRONMENT === 'dev' && /^\/card-lab(?:\/|$)/i.test(normalizedPath(url.pathname) ?? '')
    headers.set('Content-Security-Policy', isCardLab ? `${CONTENT_POLICY}; style-src-attr 'unsafe-inline'` : CONTENT_POLICY)
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    // no-transform keeps Cloudflare's zone-wide Web Analytics from injecting its
    // beacon, which the content policy blocks and the privacy notice rules out.
    headers.set('Cache-Control', 'no-store, no-transform')
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
