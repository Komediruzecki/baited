import test from 'node:test';
import assert from 'node:assert/strict';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const artPath = `/api/card-art/round/fixture-room/4891561a-8bad-459d-8e08-7f698910a72b/31ab82b5-809d-4bc4-8272-ac914b3bcc3f/${'c'.repeat(43)}.png`;
class Element extends EventTarget {
  dataset = {};
  hidden = false;
  children = [];
  attributes = new Map();
  writes = [];
  style = { setProperty(name, value) { this[name] = value; } };
  content = '';
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('State must not be inserted as HTML.'); }
  replaceChildren(...children) { this.children = children; this.content = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); this.writes.push([name, value]); }
  removeAttribute(name) { this.attributes.delete(name); }
}

for (const surface of ['viewer', 'overlay']) test(`${surface}: uploaded images clear on role change and pending results, without re-fetching each poll`, async () => {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const windowMock = new EventTarget(), documentMock = new EventTarget(), elements = new Map(), calls = [];
  let authorize, visibility;
  documentMock.visibilityState = 'visible';
  documentMock.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  documentMock.createElement = () => new Element();
  windowMock.BAITED_EXTENSION_CONFIG = { clientId: 'fixtureclient', apiBaseUrl: 'https://game.example' };
  windowMock.matchMedia = () => ({ matches: true });
  windowMock.Twitch = { ext: {
    onAuthorized: (callback) => { authorize = callback; },
    onVisibilityChanged: (callback) => { visibility = callback; },
  } };
  globalThis.window = windowMock;
  globalThis.document = documentMock;
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({ url, options, resolve });
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const state = (visible = true, outcome = null) => ({ version: '0.0.1', configured: true, room: {
    phase: outcome ? 'cooldown' : 'active', channel: 'streamer', serverTime: 1000,
    round: outcome ? null : { id: 'round-one', number: 1, duration: 60000, remaining: 45000, endsAt: 46000,
      ...(visible ? { target: 'RADISH', forbiddenClues: ['root', 'salad'], artUrl: artPath } : {}) },
    result: outcome ? { id: 'round-one', word: 'RADISH', outcome, artUrl: artPath } : null,
  } });
  const auth = () => authorize({ clientId: 'fixtureclient', channelId: '12345', token: 'fixture-private-token' });
  const respond = async (index, value) => {
    assert.ok(calls[index], `Expected request ${index}`);
    calls[index].resolve({ status: 200, ok: true, text: async () => JSON.stringify(value) });
    await flush();
  };
  const art = () => elements.get(surface === 'viewer' ? 'word-art' : 'front-art');
  try {
    await import(`../${surface}.js?custom-art-privacy`);
    auth();
    await respond(0, state());
    assert.equal(art().attributes.get('src'), `https://game.example${artPath}`);
    assert.equal(art().attributes.get('crossorigin'), 'anonymous');
    assert.equal(art().attributes.get('referrerpolicy'), 'no-referrer');
    const writes = art().writes.filter(([key]) => key === 'src').length;
    visibility(false); visibility(true);
    await respond(1, state());
    assert.equal(art().writes.filter(([key]) => key === 'src').length, writes, 'unchanged capability must not re-fetch');
    art().dispatchEvent(new Event('error'));
    assert.equal(art().hidden, true, 'network/CSP image failure keeps the word readable without a broken image');
    visibility(false); visibility(true);
    await respond(2, state());
    assert.equal(art().hidden, true, 'polling must not redisplay a failed image');
    auth();
    assert.equal(art().attributes.has('src'), false, 'reauthorization clears the prior capability before responding');
    assert.equal(art().attributes.has('crossorigin'), false);
    await respond(3, state(false));
    assert.equal(art().attributes.has('src'), false);
    auth();
    await respond(4, state(true, 'caught'));
    assert.equal(art().attributes.get('src'), `https://game.example${artPath}`);
    auth();
    await respond(5, state(true, 'review'));
    assert.equal(art().attributes.has('src'), false, 'pending result never receives upload URL');
    auth();
    await respond(6, state(true, 'overturned'));
    assert.equal(art().attributes.has('src'), false, 'rejected result never receives upload URL');
  } finally {
    windowMock.dispatchEvent(new Event('pagehide'));
    await flush();
    globalThis.window = original.window;
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
  }
});
