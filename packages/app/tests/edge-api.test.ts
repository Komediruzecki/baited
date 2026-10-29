import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeEdgeBot, canAuthorizeEdgeBot, request } from '../client/api';

test('edge chat controls use the session CSRF endpoint and bot sign-in verifies its destination', async () => {
  const previous = { fetch: globalThis.fetch, location: Object.getOwnPropertyDescriptor(globalThis, 'location'), socket: globalThis.WebSocket };
  const calls: { path: string; body?: unknown; csrf: string | null }[] = [];
  let revision = 1, canAuthorize = true, redirect = 'https://id.twitch.tv/oauth2/authorize?client_id=fixture';
  const state = () => ({ type: 'snapshot', protocol: 1, revision, generation: 1,
    room: { serverTime: Date.now(), phase: 'idle', score: {}, settings: {}, connection: { status: 'connected' } } });
  class Socket {
    readyState = 1; bufferedAmount = 0;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(state()) })); }
    send() {}
    close() { this.readyState = 3; this.onclose?.(); }
  }
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://pilot.test' } });
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), 'https://pilot.test').pathname;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, csrf: new Headers(init?.headers).get('x-csrf-token') });
    if (path === '/api/session') return Response.json({ runtime: 'edge', authenticated: true });
    if (path === '/api/edge/session') return Response.json({ channelId: '123', token: 'signed.fixture.token',
      tokenExpiresAt: Date.now() + 300000, csrf: 'fixture-csrf', bot: { configured: true, authorized: false, channelAllowed: true, canAuthorize } });
    if (path === '/api/edge/chat') { revision++; return Response.json({ ok: true }); }
    if (path === '/v1/rooms/123/state') return Response.json(state());
    if (path === '/api/bot/authorize') return Response.json({ url: redirect });
    if (path === '/api/logout') return Response.json({ ok: true });
    return Response.json({ error: 'Unexpected request.' }, { status: 404 });
  };
  try {
    await request('/api/session'); await request('/api/studio');
    await request('/api/studio/action', { action: 'disconnect' });
    await request('/api/studio/action', { action: 'connect' });
    assert.deepEqual(calls.filter((call) => call.path === '/api/edge/chat'), [
      { path: '/api/edge/chat', body: { connected: false }, csrf: 'fixture-csrf' },
      { path: '/api/edge/chat', body: { connected: true }, csrf: 'fixture-csrf' },
    ]);
    assert.equal(calls.filter((call) => call.path.endsWith('/state')).length, 2);
    assert.ok(calls.every((call) => !call.path.endsWith('/commands')));
    assert.equal(canAuthorizeEdgeBot(), true);
    assert.match(await authorizeEdgeBot(), /^https:\/\/id\.twitch\.tv\/oauth2\/authorize/);
    assert.equal(calls.at(-1)?.csrf, 'fixture-csrf');
    redirect = 'https://untrusted.test/authorize';
    await assert.rejects(authorizeEdgeBot(), /could not be verified/);
    await request('/api/logout', {});
    canAuthorize = false;
    await request('/api/studio');
    assert.equal(canAuthorizeEdgeBot(), false);
    await assert.rejects(authorizeEdgeBot(), /operator connects/);
  } finally {
    await request('/api/logout', {});
    globalThis.fetch = previous.fetch; globalThis.WebSocket = previous.socket;
    if (previous.location) Object.defineProperty(globalThis, 'location', previous.location);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});
