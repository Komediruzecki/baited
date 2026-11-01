import assert from 'node:assert/strict';
import test from 'node:test';
import { errorKindForStatus, isDocumentNavigation, isKnownAppPath, renderErrorDocument, withErrorDocument, sessionErrorKind } from '../shared/error-pages.js';

test('error documents are only negotiated for real HTML navigation', () => {
  const document = (path: string, headers: Record<string, string> = { accept: 'text/html,application/xhtml+xml' }, method = 'GET') =>
    isDocumentNavigation(new Request(`https://baited.invalid${path}`, { method, headers }));
  assert.equal(document('/mistyped'), true);
  assert.equal(document('/mistyped', { 'sec-fetch-dest': 'document' }, 'HEAD'), true);
  assert.equal(document('/auth/twitch/callback?code=never-show-this'), true);
  for (const path of ['/api/session', '/v1/rooms/123/state', '/internal/control', '/health', '/missing.js', '/brand/missing.png']) {
    assert.equal(document(path), false, path);
  }
  const nonDocumentHeaders: Record<string, string>[] = [{ accept: '*/*' }, { accept: 'application/json' }, { accept: 'text/html;q=0' }, { 'sec-fetch-dest': 'script', accept: 'text/html' }];
  for (const headers of nonDocumentHeaders) {
    assert.equal(document('/missing', headers), false);
  }
  assert.equal(document('/missing', { accept: 'text/html' }, 'POST'), false);
});

test('bootstrap failures preserve known pilot pause/setup meaning without exposing arbitrary errors', () => {
  assert.equal(sessionErrorKind({ message: 'The pilot is stopped.', status: 503 }), 'stopped');
  assert.equal(sessionErrorKind({ message: 'The hosted pilot is not configured.', status: 503 }), 'setup');
  assert.equal(sessionErrorKind({ message: 'Sensitive internal exception: secret' }), 'connection');
  assert.equal(sessionErrorKind({ status: 429 }), 'limited');
});

test('only exact app destinations are recognized and pilot keeps its smaller route surface', () => {
  for (const path of ['/', '/studio', '/studio/', '/studio/cards', '/speech-lab', '/product-review', '/about', '/privacy', '/play/local_room-A', '/overlay/123']) {
    assert.equal(isKnownAppPath(path), true, path);
  }
  for (const path of ['/studio/mistyped', '/studio/cards/extra', '/play', '/privacy/extra', '/speech-lab/extra', '/unknown', '/overlay/a/b']) {
    assert.equal(isKnownAppPath(path), false, path);
  }
  assert.equal(isKnownAppPath('/overlay/123', true), true);
  for (const path of ['/studio/cards', '/card-lab', '/speech-lab', '/product-review', '/overlay/abc']) assert.equal(isKnownAppPath(path, true), false, path);
});

test('standalone error HTML has recovery without JavaScript or sensitive dynamic values', () => {
  const html = renderErrorDocument('auth');
  assert.match(html, /href="\/studio"/);
  assert.match(html, /start a fresh connection/);
  assert.match(html, /noindex, nofollow/);
  assert.match(html, /href="\/error-page.css"/);
  assert.doesNotMatch(html, /<script|<style|onclick|location\.reload|callback\?|stack|token/i);
  assert.match(renderErrorDocument('missing', 'landing'), /href="\/"/);
  assert.doesNotMatch(renderErrorDocument('missing', 'landing'), /bomb|__orbit/);
});

test('HTTP failures retain distinct user guidance instead of being labelled missing pages', () => {
  assert.equal(errorKindForStatus(404), 'missing');
  assert.equal(errorKindForStatus(401), 'auth');
  assert.equal(errorKindForStatus(403), 'forbidden');
  assert.equal(errorKindForStatus(429), 'limited');
  assert.equal(errorKindForStatus(500), 'server');
  assert.equal(errorKindForStatus(503), 'unavailable');
  assert.equal(errorKindForStatus(400), 'request');
  assert.equal(errorKindForStatus(405), 'request');
});

test('OBS failures use a compact transparent surface, never the full page illustration', async () => {
  const response = withErrorDocument(new Request('https://baited.invalid/overlay/missing/extra', { headers: { accept: 'text/html' } }), new Response(null, { status: 404 }));
  const html = await response.text();
  assert.match(html, /baited-error-overlay-document/);
  assert.match(html, /Copy a fresh one from Stream setup/);
  assert.doesNotMatch(html, /baited-error__scene|baited-error__bomb|baited-error__mark/);
});

test('document error responses retain status and auth cookies without leaking the original error', async () => {
  for (const method of ['GET', 'HEAD']) {
    const request = new Request('https://baited.invalid/auth/twitch/callback?code=private-code', { method, headers: { accept: 'text/html' } });
    const response = withErrorDocument(request, new Response('private-provider-error', { status: 400, headers: { 'set-cookie': 'pending=; Max-Age=0; HttpOnly', 'retry-after': '30', 'content-length': '22' } }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), 'pending=; Max-Age=0; HttpOnly');
    assert.equal(response.headers.get('retry-after'), '30');
    assert.equal(response.headers.get('content-length'), null);
    const html = await response.text();
    if (method === 'GET') assert.match(html, /start a fresh connection/);
    else assert.equal(html, '');
    assert.doesNotMatch(html, /private-code|private-provider-error/);
  }
  const json = new Response('{"error":"not found"}', { status: 404 });
  assert.equal(withErrorDocument(new Request('https://baited.invalid/api/missing', { headers: { accept: 'text/html' } }), json), json);
});

test('OAuth429 and503 keep wait guidance rather than asking for a fresh connection', async () => {
  for (const [status, title] of [[429, 'One beat at a time.'], [503, 'A little out of fuel.']] as const) {
    const response = withErrorDocument(new Request('https://baited.invalid/auth/twitch/callback?code=never-echo', { headers: { accept: 'text/html' } }), new Response('private cause', { status, headers: { 'retry-after': '60', 'set-cookie': 'pending=; Max-Age=0' } }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(response.headers.get('set-cookie'), 'pending=; Max-Age=0');
    const html = await response.text();
    assert.ok(html.includes(title));
    assert.doesNotMatch(html, /start a fresh connection|never-echo|private cause/);
  }
});
