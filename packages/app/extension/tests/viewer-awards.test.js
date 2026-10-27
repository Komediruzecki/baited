import test from 'node:test';
import assert from 'node:assert/strict';

const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element extends EventTarget {
  dataset = {};
  hidden = false;
  children = [];
  attributes = new Map();
  style = {};
  content = '';
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Untrusted state must not be inserted as HTML.'); }
  replaceChildren(...children) { this.children = children; this.content = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

test('the panel shows the streamer’s pick and the top three MVPs between rounds, and clears them', async () => {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const windowMock = new EventTarget();
  const documentMock = new EventTarget();
  const elements = new Map();
  const calls = [];
  let authorize;
  documentMock.visibilityState = 'visible';
  documentMock.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  documentMock.createElement = () => new Element();
  windowMock.BAITED_EXTENSION_CONFIG = { clientId: 'fixtureclient', apiBaseUrl: 'https://game.example' };
  windowMock.matchMedia = () => ({ matches: true });
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
  const room = (patch) => ({ version: '0.0.1', configured: true, room: {
    phase: 'cooldown', channel: 'streamer', serverTime: 10000, round: null, result: null, mvps, ...patch,
  } });
  const caught = (award) => room({ result: { id: 'round-one', word: 'VOLCANO', outcome: 'caught', ...(award ? { award } : {}) } });
  const live = room({ phase: 'active', round: { id: 'round-two', number: 2, duration: 60000, remaining: 45000, endsAt: 55000,
    target: 'PENGUIN', forbiddenClues: ['Ice', 'Bird', 'Tuxedo', 'Waddle'] } });
  let call = 0;
  const show = async (value) => {
    authorize({ clientId: 'fixtureclient', channelId: '12345', token: `token-${call}` });
    calls[call++].resolve({ status: 200, ok: true, text: async () => JSON.stringify(value) });
    await flush();
  };
  const award = () => elements.get('card-award');
  const list = () => elements.get('mvp-list');
  try {
    await import('../viewer.js');
    await show(caught({ name: 'Alex', at: 9000 }));
    assert.equal(award().hidden, false);
    assert.equal(award().textContent, 'Streamer’s pick: @Alex');
    assert.equal(elements.get('mvps').hidden, false);
    assert.deepEqual(list().children.map((item) => item.textContent), ['@Blake 3 picks', '@Alex 1 pick', '@Casey 1 pick']);
    assert.match(elements.get('announcement').textContent, /Streamer’s pick: @Alex/);

    // Before the streamer picks, the result carries no award.
    await show(caught(null));
    assert.equal(award().hidden, true);
    assert.equal(award().textContent, '');

    // A live round needs the room for the word, clues and clock.
    await show(live);
    assert.equal(award().hidden, true);
    assert.equal(elements.get('mvps').hidden, true);
    assert.equal(list().children.length, 0);

    // Between rounds the board comes back.
    await show(room({ phase: 'idle' }));
    assert.equal(elements.get('mvps').hidden, false);
    assert.equal(list().children.length, 3);

    // A renewed Helper token clears the view before its response arrives.
    await show(caught({ name: 'Alex' }));
    authorize({ clientId: 'fixtureclient', channelId: '12345', token: 'renewed' });
    assert.equal(award().hidden, true);
    assert.equal(elements.get('mvps').hidden, true);
    assert.doesNotMatch([...elements.values()].map((element) => element.textContent).join(' '), /Alex|Blake|Casey/);
  } finally {
    windowMock.dispatchEvent(new Event('pagehide'));
    await flush();
    globalThis.window = original.window;
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
  }
});
