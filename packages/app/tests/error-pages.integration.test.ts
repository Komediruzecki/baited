import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { appDocumentFallback, terminalError, unknownDocument, sendErrorDocument } from '../server/error-pages.js';

test('Express navigation errors keep HTTP status while APIs keep JSON and OBS keeps transparency', async () => {
  const app = express();
  app.get('/api/missing', (_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.get('/studio', () => { throw new Error('private failure with internal detail'); });
  app.get('/auth/twitch/limited', () => { throw Object.assign(new Error('private rate cause'), { status: 429 }); });
  app.get('/auth/twitch/unavailable', () => { throw Object.assign(new Error('private provider cause'), { statusCode: 503 }); });
  app.get('/auth/twitch/expired', (req, res) => { sendErrorDocument(req, res, 400); });
  app.use(unknownDocument);
  app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use(terminalError);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const method of ['GET', 'HEAD']) {
      for (const [path, status, expected] of [['/mistyped', 404, 'That link was a decoy'], ['/studio', 500, 'I dropped the deck'], ['/overlay/missing/extra', 404, 'baited-error-overlay-document']] as const) {
        const response = await fetch(origin + path, { method, headers: { accept: 'text/html' } });
        assert.equal(response.status, status);
        assert.match(response.headers.get('content-type')!, /text\/html/);
        const html = await response.text();
        if (method === 'GET') assert.ok(html.includes(expected));
        else assert.equal(html, '');
        assert.doesNotMatch(html, /private failure|internal detail/);
      }
    }
    const api = await fetch(origin + '/api/missing', { headers: { accept: 'text/html' } });
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { error: 'Route not found.' });
    const asset = await fetch(origin + '/missing.js', { headers: { accept: 'text/html' } });
    assert.equal(asset.status, 404);
    assert.doesNotMatch(asset.headers.get('content-type')!, /text\/html/);
    for (const [path, status, title] of [['limited', 429, 'One beat at a time.'], ['unavailable', 503, 'A little out of fuel.'], ['expired', 400, 'Let’s reconnect.']] as const) {
      const response = await fetch(`${origin}/auth/twitch/${path}`, { headers: { accept: 'text/html' } });
      assert.equal(response.status, status);
      const html = await response.text();
      assert.ok(html.includes(title));
      if (status !== 400) assert.doesNotMatch(html, /start a fresh connection/);
      assert.doesNotMatch(html, /private rate cause|private provider cause/);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('custom development fallback never bootstraps missing files or service routes', async () => {
  const app = express();
  const transformed: string[] = [];
  // The real Vite middleware runs first and owns these legitimate module URLs.
  app.get(['/client/main.tsx', '/@vite/client', '/node_modules/dependency.js'], (_req, res) => res.type('js').send('export {};'));
  app.use(appDocumentFallback({ template: async () => '<h1>Studio bootstrap</h1>', transform: async (url, html) => { transformed.push(url); return html; } }));
  app.use(terminalError);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of ['/missing.js', '/v1/unknown', '/internal/unknown', '/api/missing']) {
      const response = await fetch(origin + path, { headers: { accept: '*/*' } });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Route not found.' });
    }
    for (const path of ['/client/main.tsx', '/@vite/client', '/node_modules/dependency.js']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'export {};');
    }
    const page = await fetch(origin + '/studio?fixture=disconnected');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Studio bootstrap/);
    assert.deepEqual(transformed, ['/studio?fixture=disconnected']);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
