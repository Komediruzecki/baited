import test from 'node:test';
import assert from 'node:assert/strict';

const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element extends EventTarget {
  dataset = {};
  hidden = false;
  children = [];
  attributes = new Map();
  style = { setProperty(name, value) { this[name] = value; } };
  content = '';
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Untrusted state must not be inserted as HTML.'); }
  replaceChildren(...children) { this.children = children; this.content = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

test('the overlay result card names the streamer’s pick, lists the top three MVPs and returns for a new pick', async () => {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch, now: Date.now };
  const windowMock = new EventTarget();
  const documentMock = new EventTarget();
  const elements = new Map();
  const calls = [];
  let authorize;
  let now = 1_000_000;
  Date.now = () => now;
  documentMock.visibilityState = 'visible';
  documentMock.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  documentMock.createElement = () => new Element();
  windowMock.BAITED_EXTENSION_CONFIG = { clientId: 'fixtureclient', apiBaseUrl: 'https://game.example' };
  windowMock.Twitch = { ext: { onAuthorized: (callback) => { authorize = callback; } } };
  globalThis.window = windowMock;
  globalThis.document = documentMock;
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({ resolve });
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const mvps = [
    { name: 'Blake', rounds: 2, baits: 3 },
    { name: 'Alex', rounds: 9, baits: 1 },
    { name: 'Casey', rounds: 4, baits: 1 },
    { name: 'Drew', rounds: 1, baits: 1 },
  ];
  const caught = (award, outcome = 'caught') => ({ version: '0.0.1', configured: true, room: {
    phase: 'cooldown', channel: 'streamer', serverTime: 10000, round: null, mvps,
    result: { id: 'round-one', word: 'VOLCANO', outcome, ...(award ? { award } : {}) },
  } });
  let call = 0;
  const show = async (value) => {
    authorize({ clientId: 'fixtureclient', channelId: '12345', token: `token-${call}` });
    calls[call++].resolve({ status: 200, ok: true, text: async () => JSON.stringify(value) });
    await flush();
  };
  const visible = () => elements.get('table').dataset.visible === 'true';
  const award = () => elements.get('front-award');
  try {
    await import('../overlay.js');
    await show(caught(null));
    assert.equal(visible(), true);
    assert.equal(award().hidden, true);
    assert.equal(elements.get('front-mvps').hidden, false);
    assert.deepEqual(elements.get('front-mvp-list').children.map((item) => item.textContent), ['@Blake 3 picks', '@Alex 1 pick', '@Casey 1 pick']);

    // The finished card leaves after 12 seconds.
    now += 13_000;
    await show(caught(null));
    assert.equal(visible(), false);

    // The streamer's pick arrives later and brings the card back to show it.
    await show(caught({ name: 'Alex', at: now }));
    assert.equal(visible(), true);
    assert.equal(award().hidden, false);
    assert.equal(award().textContent, 'Streamer’s pick: @Alex');
    assert.match(elements.get('announcement').textContent, /Streamer’s pick: @Alex/);
    now += 13_000;
    await show(caught({ name: 'Alex', at: now - 13_000 }));
    assert.equal(visible(), false, 'the same pick does not return again');

    // A pick that is taken back does not bring the card back.
    await show(caught(null));
    assert.equal(visible(), false);

    // A rejected catch shows neither the pick nor the board.
    await show({ ...caught(null, 'overturned'), room: { ...caught(null, 'overturned').room, result: { id: 'round-two', word: 'PENGUIN', outcome: 'overturned' } } });
    assert.equal(visible(), true);
    assert.equal(award().hidden, true);
    assert.equal(elements.get('front-mvps').hidden, true);
    assert.equal(elements.get('front-mvp-list').children.length, 0);

    // A renewed Helper token clears the card before its response arrives.
    await show({ ...caught({ name: 'Alex', at: now }), room: { ...caught({ name: 'Alex', at: now }).room, result: { id: 'round-three', word: 'DISCO', outcome: 'caught', award: { name: 'Alex', at: now } } } });
    assert.equal(award().textContent, 'Streamer’s pick: @Alex');
    authorize({ clientId: 'fixtureclient', channelId: '12345', token: 'renewed' });
    assert.equal(award().hidden, true);
    assert.equal(elements.get('front-mvps').hidden, true);
    assert.doesNotMatch([...elements.values()].map((element) => element.textContent).join(' '), /Alex|Blake|Casey/);
  } finally {
    windowMock.dispatchEvent(new Event('pagehide'));
    await flush();
    Date.now = original.now;
    globalThis.window = original.window;
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
  }
});
