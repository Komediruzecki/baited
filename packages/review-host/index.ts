/**
 * How a review deploy stays out of search.
 *
 * Every landing has a review host: the dev or preview deploy, serving the same
 * build as production from a second origin. It must never be indexed, or it
 * competes with production for our own names.
 *
 * What keeps it out is `X-Robots-Tag: noindex` on every response, and that only
 * works if robots.txt ALLOWS the crawl. It reads backwards and it is the point:
 * noindex is a directive on the response, so a crawler learns it only by
 * fetching the URL. `Disallow: /` prevents the fetch, and a disallowed URL that
 * is linked from elsewhere can still be indexed from the link alone, as a bare
 * URL with no snippet, where no header or meta tag can reach it. Google
 * documents both halves: noindex is never seen on a page robots.txt blocks, and
 * a blocked page can still appear in results. Disallow plus noindex, which these
 * hosts served until now, has the two layers cancelling each other out.
 *
 * So robots.txt allows everything and names no sitemap (the build's copy points
 * at production's, which a duplicate origin has no business handing out), and
 * noindex goes on every response.
 *
 * Each worker decides what counts as its review host (its hostname, compared
 * through `hostOf`, or an ENVIRONMENT var), and that environment must run the
 * worker first (`assets.run_worker_first: true` in wrangler.jsonc).
 * Without it the asset layer answers robots.txt and every page before this code
 * runs, and the host serves the build's robots.txt, production sitemap included.
 */

const X_ROBOTS_TAG = 'noindex, nofollow'

/**
 * Serves one request on a review host. robots.txt is answered here, so `next`
 * never gets to serve the build's copy; every other response is whatever `next`
 * returns, with the noindex header set. robots.txt names `productionHost` as
 * the site to index instead.
 */
export async function serveReviewHost(request: Request, productionHost: string, next: () => Promise<Response>): Promise<Response> {
  if (new URL(request.url).pathname === '/robots.txt') {
    return new Response(robotsTxt(productionHost), {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': X_ROBOTS_TAG,
      },
    })
  }

  const response = await next()
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', X_ROBOTS_TAG)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

/**
 * The host a request was made to, spelled the way a wrangler route spells it.
 * The URL parser already lowercases it and drops the port, but it keeps a
 * trailing dot, and `dev.irchiinnuss.com.` is the same host to DNS and to
 * Cloudflare's routing. Compared as-is, that spelling reads as some other host,
 * and the review host serves the build's robots.txt with no noindex.
 */
export function hostOf(request: Request): string {
  return new URL(request.url).hostname.replace(/\.+$/u, '')
}

function robotsTxt(productionHost: string): string {
  return [
    `# Review deploy. ${productionHost} is the one to index.`,
    '# The crawl is allowed on purpose: every response here carries X-Robots-Tag: noindex,',
    '# and a crawler only reads that on a page it is allowed to fetch.',
    'User-agent: *',
    'Allow: /',
    '',
  ].join('\n')
}
