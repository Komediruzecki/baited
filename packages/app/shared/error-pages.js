/** Safe, authored error copy. Never interpolate a thrown error, URL or OAuth query. */
export const errorContent = Object.freeze({
  missing: { code: '404', title: 'That link was a decoy.', detail: 'We couldn’t find this page. Check the address, or take a fresh route back.', action: 'Back to Studio' },
  server: { code: '500', title: 'I dropped the deck.', detail: 'Baited couldn’t finish loading this page. Try again in a moment.', action: 'Try again' },
  unavailable: { code: '503', title: 'A little out of fuel.', detail: 'Baited is temporarily unavailable. Give it a moment, then try again.', action: 'Try again' },
  screen: { code: 'SCREEN ERROR', title: 'I dropped the deck.', detail: 'This screen stopped working. Reload it to try again.', action: 'Reload screen' },
  connection: { code: 'CONNECTION', title: 'Lost the signal.', detail: 'We couldn’t connect to Baited. Check your connection, then try again.', action: 'Try again' },
  auth: { code: 'TWITCH CONNECTION', title: 'Let’s reconnect.', detail: 'Your Twitch connection couldn’t be completed. Return to Studio and start a fresh connection.', action: 'Back to Studio' },
  forbidden: { code: '403', title: 'This seat is reserved.', detail: 'This page isn’t available to your account. Return to Studio to check your connection.', action: 'Back to Studio' },
  limited: { code: '429', title: 'One beat at a time.', detail: 'There have been too many requests. Wait a moment before trying again.', action: 'Back to Studio' },
  request: { code: 'REQUEST ERROR', title: 'That move didn’t land.', detail: 'Baited couldn’t accept this request. Return to Studio and try the action again.', action: 'Back to Studio' },
  stopped: { code: 'PILOT PAUSED', title: 'Taking a breather.', detail: 'This pilot has been paused. Try again when the test reopens.', action: 'Try again' },
  setup: { code: 'PILOT SETUP', title: 'The table isn’t ready.', detail: 'The pilot still needs its server setup. Contact the test host, then try again.', action: 'Try again' },
});

export function errorKindForStatus(status) {
  if (status === 404) return 'missing';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'limited';
  if (status >= 400 && status < 500) return 'request';
  return status === 503 ? 'unavailable' : 'server';
}

/** An expired/denied sign-in needs a fresh connection; capacity/outage errors need a wait. */
export function errorKindForDocument(pathname, status) {
  return pathname.startsWith('/auth/') && [400, 401, 403].includes(status) ? 'auth' : errorKindForStatus(status);
}

/** Known service states get precise guidance; arbitrary exception text never reaches the page. */
export function sessionErrorKind(failure) {
  if (['The pilot is stopped.', 'The pilot is stopped. Try again when the test reopens.'].includes(failure?.message)) return 'stopped';
  if (failure?.message === 'The hosted pilot is not configured.') return 'setup';
  return typeof failure?.status === 'number' ? errorKindForStatus(failure.status) : 'connection';
}

/** A fetch asking for JSON, an asset, or a write must never receive an HTML fallback. */
export function isDocumentNavigation(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const url = new URL(request.url);
  if (/^\/(?:api|v1|internal|health)(?:\/|$)/i.test(url.pathname)) return false;
  if (/\.[a-z0-9]{1,12}$/i.test(url.pathname) && !/\.html$/i.test(url.pathname)) return false;
  const destination = request.headers.get('sec-fetch-dest');
  if (destination) return destination === 'document' || destination === 'iframe';
  return (request.headers.get('accept') ?? '').split(',').some(part => {
    const [type, ...parameters] = part.trim().toLowerCase().split(';');
    return type === 'text/html' && !parameters.some(value => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(value));
  });
}

export function isKnownAppPath(pathname, edge = false) {
  // Exact shapes only. A mistyped nested route must not silently become Studio.
  if (pathname === '/index.html') return true;
  if (/^\/(?:studio(?:\/(?:setup|settings))?|privacy)?\/?$/.test(pathname)) return true;
  if (/^\/(?:overlay|play)\/[a-zA-Z0-9_-]{1,128}\/?$/.test(pathname)) {
    return !edge || /^\/(?:overlay|play)\/[1-9]\d{0,24}\/?$/.test(pathname);
  }
  return !edge && /^\/(?:about|studio\/cards|speech-lab|card-design-lab|card-lab|card-proofs|product-review)\/?$/.test(pathname);
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

/** No runtime JavaScript: remains readable when the app bundle cannot boot. */
export function renderErrorDocument(kind = 'missing', surface = 'app', overlay = false) {
  const copy = errorContent[kind] ?? errorContent.server;
  if (overlay && surface === 'app') {
    const detail = kind === 'missing' ? 'This overlay link isn’t valid. Copy a fresh one from Stream setup.' : 'Refresh this OBS source. If it stays offline, copy a fresh overlay link from Stream setup.';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Overlay unavailable · Baited</title><link rel="stylesheet" href="/error-page.css"></head><body class="baited-error-overlay-document"><main class="baited-error-overlay"><img src="/brand/baited-pixel-white.svg" alt="Baited" width="74" height="20"><h1>Overlay unavailable.</h1><p>${detail}</p></main></body></html>`;
  }
  const landing = surface === 'landing';
  const home = landing ? '/' : '/studio';
  const logo = landing ? '/assets/brand/baited-pixel-white.svg' : '/brand/baited-pixel-white.svg';
  const action = landing ? 'Back to Baited' : 'Back to Studio';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="dark"><title>${escapeHtml(copy.code)} · Baited</title><link rel="stylesheet" href="/error-page.css"></head>
<body class="baited-error-document"><main class="baited-error" aria-labelledby="error-title">
<a class="baited-error__brand" href="${home}" aria-label="Baited home"><img src="${logo}" alt="Baited" width="185" height="50"></a>
<div class="baited-error__scene" aria-hidden="true"><span class="baited-error__mark">${escapeHtml(copy.code === '404' ? '404' : '!')}</span></div>
<div class="baited-error__copy"><p class="baited-error__speaker">Baity says</p><h1 id="error-title">${escapeHtml(copy.title)}</h1><p class="baited-error__detail">${escapeHtml(copy.detail)}</p><div class="baited-error__actions"><a class="baited-error__primary" href="${home}">${action}<span aria-hidden="true">↗</span></a><a class="baited-error__secondary" href="mailto:hello@irchiinnuss.com">Get help</a></div><p class="baited-error__code">${escapeHtml(copy.code)} <span aria-hidden="true">/</span> Baited</p></div>
</main></body></html>`;
}

/** Keep response status, cookies and rate-limit headers; only replace a document's error body. */
export function withErrorDocument(request, response, surface = 'app') {
  if (response.status < 400 || !isDocumentNavigation(request)) return response;
  const kind = errorKindForDocument(new URL(request.url).pathname, response.status);
  const headers = new Headers(response.headers);
  for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('content-security-policy', "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  const vary = headers.get('vary');
  if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'accept')) headers.set('vary', vary ? `${vary}, Accept` : 'Accept');
  const overlay = /^\/overlay(?:\/|$)/.test(new URL(request.url).pathname);
  return new Response(request.method === 'HEAD' ? null : renderErrorDocument(kind, surface, overlay), { status: response.status, statusText: response.statusText, headers });
}
