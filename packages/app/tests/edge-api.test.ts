import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeEdgeBot, canAuthorizeEdgeBot, isEdgeRuntime, request } from '../client/api';

test('edge chat controls use the session CSRF endpoint and bot sign-in verifies its destination', async () => {
  const previous = { fetch: globalThis.fetch, location: Object.getOwnPropertyDescriptor(globalThis, 'location'), socket: globalThis.WebSocket };
  const calls: { path: string; body?: unknown; csrf: string | null }[] = [];
  let revision = 1, canAuthorize = true, botAuthorized=false, redirect = 'https://id.twitch.tv/oauth2/authorize?client_id=fixture';
  let roundResult: {id:string;reason:string;outcome:string} | undefined;
  const frames: unknown[] = [];
  const state = () => ({ type: 'snapshot', protocol: 1, revision, generation: 1,
    room: { result: roundResult, serverTime: Date.now(), phase: 'idle', score: {}, settings: {chatBot:true}, connection: { status: 'connected' } } });
  class Socket {
    readyState = 1; bufferedAmount = 0;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(state()) })); }
    send(value: string) {
      frames.push(value);
      assert.equal(value, 'resync');
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(state()) }));
    }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://pilot.test' } });
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input), 'https://pilot.test').pathname;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, csrf: new Headers(init?.headers).get('x-csrf-token') });
    if (path === '/api/session') return Response.json({ runtime: 'edge', authenticated: true });
    if (path === '/api/edge/session') return Response.json({ channelId: '123', token: 'signed.fixture.token',
      tokenExpiresAt: Date.now() + 300000, csrf: 'fixture-csrf', bot: { configured: true, authorized: botAuthorized, channelAllowed: true, canAuthorize } });
    if (path === '/api/edge/chat') { revision++; return Response.json({ ok: true }); }
    if (path === '/v1/rooms/123/state') return Response.json({ error: 'Same-origin GET has no Origin.' }, { status: 403 });
    if (path === '/api/bot/authorize') return Response.json({ url: redirect });
    if (path === '/v1/rooms/123/commands') { revision++; return Response.json({ok:true,revision,generation:1,snapshot:state()}); }
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
    assert.equal(calls.filter((call) => call.path.endsWith('/state')).length, 0);
    assert.deepEqual(frames, ['resync', 'resync']);
    assert.ok(calls.every((call) => !call.path.endsWith('/commands')));
    const takeId = crypto.randomUUID();
    await request('/api/recording/restart', { takeId });
    const resetCall = calls.find(call => call.path.endsWith('/commands'))!;
    assert.deepEqual((resetCall.body as {action:unknown}).action, {type:'restart-take', takeId});
    assert.equal((resetCall.body as {expectedRevision:number}).expectedRevision, 3);
    assert.equal(calls.some(call => call.path === '/api/recording/restart'), false);
    const draft={roundId:crypto.randomUUID(),epoch:1,word:'banana',draftId:crypto.randomUUID(),expiresAt:Date.now()+15000};
    assert.equal((await request<{status:string}>('/api/studio/voice-guess-draft',draft)).status,'unavailable');
    assert.equal(calls.filter(call=>call.path.endsWith('/commands')).length,1,'Unavailable bot does not submit anything.');
    assert.equal(canAuthorizeEdgeBot(), true);
    assert.match(await authorizeEdgeBot(), /^https:\/\/id\.twitch\.tv\/oauth2\/authorize/);
    assert.equal(calls.at(-1)?.csrf, 'fixture-csrf');
    redirect = 'https://untrusted.test/authorize';
    await assert.rejects(authorizeEdgeBot(), /could not be verified/);
    await request('/api/logout', {});
    botAuthorized=true;
    canAuthorize = false;
    await request('/api/studio');
    assert.deepEqual(await request('/api/studio/voice-guess-draft',draft),{status:'requested'});
    const draftCall=[...calls].reverse().find(call=>call.path.endsWith('/commands'))!;
    assert.deepEqual((draftCall.body as {action:unknown}).action,{type:'voice-guess-draft',roundId:draft.roundId,epoch:1,text:'banana',draftId:draft.draftId,expiresAt:draft.expiresAt});
    assert.equal(canAuthorizeEdgeBot(), false);
    await assert.rejects(authorizeEdgeBot(), /operator connects/);
    await request('/api/studio/chaos/reset', {sessionId:'chaos-session'});
    const chaosReset = calls.filter(call => call.path.endsWith('/commands')).at(-1)!;
    assert.deepEqual((chaosReset.body as {action:unknown}).action, {type:'reset-chaos-session',sessionId:'chaos-session'});
    assert.equal(calls.some(call=>call.path==='/api/studio/chaos/reset'), false);
    roundResult={id:draft.roundId,reason:'baity-chaos',outcome:'caught'};
    const gifted = await request<{correct:boolean;intervened?:boolean;bonus:number}>('/api/studio/guess', draft);
    assert.equal(gifted.correct,true); assert.equal(gifted.intervened,true); assert.equal(gifted.bonus,0);
    roundResult={id:draft.roundId,reason:'guess',outcome:'escaped'};
    const escaped = await request<{correct:boolean;intervened?:boolean}>('/api/studio/guess', draft);
    assert.equal(escaped.correct,true); assert.equal(escaped.intervened,undefined);
    roundResult={id:'older-round',reason:'baity-chaos',outcome:'caught'};
    const stale = await request<{correct:boolean;intervened?:boolean}>('/api/studio/guess', draft);
    assert.equal(stale.correct,false); assert.equal(stale.intervened,undefined);

  } finally {
    await request('/api/logout', {});
    globalThis.fetch = previous.fetch; globalThis.WebSocket = previous.socket;
    if (previous.location) Object.defineProperty(globalThis, 'location', previous.location);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test('edge bootstrap timeout works without AbortSignal static helpers and clears successful timers', async (t) => {
  const originalFetch = globalThis.fetch;
  const descriptors = ['timeout', 'any'].map((name) => [name, Object.getOwnPropertyDescriptor(AbortSignal, name)] as const);
  const signals: AbortSignal[] = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    for (const [name] of descriptors) Object.defineProperty(AbortSignal, name, { configurable: true, value: undefined });
    globalThis.fetch = async (_input, init) => { signals.push(init!.signal!); return Response.json({ ok: true }); };
    assert.deepEqual(await request('/api/edge/overlay', { channelId: '123', key: 'fixture' }), { ok: true });
    t.mock.timers.tick(20000);
    assert.equal(signals[0].aborted, false, 'A completed fetch leaves no timeout behind.');
    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      signals.push(init!.signal!);
      init!.signal!.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
    });
    const pending = request('/api/edge/overlay', { channelId: '123', key: 'fixture' });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    t.mock.timers.tick(9999); assert.equal(signals[1].aborted, false);
    t.mock.timers.tick(1); await rejected;
    assert.equal(signals[1].aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of descriptors) if (descriptor) Object.defineProperty(AbortSignal, name, descriptor);
    t.mock.timers.reset();
  }
});

test('initial runtime discovery accepts cancellation before edge mode is known and ignores a late response', async () => {
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  try {
    globalThis.fetch = async () => Response.json({ authenticated: false });
    await request('/api/session'); assert.equal(isEdgeRuntime(), false);
    globalThis.fetch = async (_input, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => { finish = resolve; });
    };
    const controller = new AbortController();
    const pending = request('/api/session', undefined, undefined, controller.signal);
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    assert.equal(signal?.aborted, false); controller.abort(); assert.equal(signal?.aborted, true);
    finish(Response.json({ runtime: 'edge', authenticated: true })); await rejected;
    assert.equal(isEdgeRuntime(), false, 'A disposed page must not change the active runtime.');
  } finally { globalThis.fetch = originalFetch; }
});
