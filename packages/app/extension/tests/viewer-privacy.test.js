import test from 'node:test';
import assert from 'node:assert/strict';

const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element extends EventTarget {
  dataset = {};
  hidden = false;
  children = [];
  attributes = new Map();
  content = '';
  set textContent(value) { this.content = String(value); this.children = []; }
  get textContent() { return this.content + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Untrusted state must not be inserted as HTML.'); }
  replaceChildren(...children) { this.children = children; this.content = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

test('viewer clears visible and accessible secrets on Helper renewal, role change and authorization error', async () => {
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  const windowMock = new EventTarget();
  const documentMock = new EventTarget();
  const elements = new Map();
  const calls = [];
  let authorize;
  let helperError;
  documentMock.visibilityState = 'visible';
  documentMock.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  documentMock.createElement = () => new Element();
  windowMock.BAITED_EXTENSION_CONFIG = { clientId: 'fixtureclient', apiBaseUrl: 'https://game.example' };
  windowMock.Twitch = { ext: {
    onAuthorized: (callback) => { authorize = callback; },
    onError: (callback) => { helperError = callback; },
  } };
  globalThis.window = windowMock;
  globalThis.document = documentMock;
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({ url, options, resolve });
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const allText = () => [...elements.values()].map((element) => element.textContent).join(' ');
  const state = (secret = true, word = '<Pineapple>') => ({ version: '0.0.1', configured: true, room: {
    phase: 'active', channel: 'streamer', serverTime: 10000, result: null,
    round: { id: 'round-one', number: 1, duration: 60000, remaining: 45000, endsAt: 55000,
      ...(secret ? { target: word, forbiddenClues: ['Pizza', 'Fruit'] } : {}) },
  } });
  const respond = async (index, secret = true, word = '<Pineapple>') => {
    calls[index].resolve({ status: 200, ok: true, text: async () => JSON.stringify(state(secret, word)) });
    await flush();
  };
  const auth = (token) => ({ clientId: 'fixtureclient', channelId: '12345', token });
  try {
    await import('../viewer.js');
    authorize(auth('viewer-private-token'));
    await respond(0);
    assert.equal(elements.get('card-title').textContent, '<Pineapple>');
    assert.match(elements.get('announcement').textContent, /<Pineapple>/);
    assert.match(allText(), /Pizza/);
    assert.doesNotMatch(allText(), /private-token/);

    authorize(auth('art-viewer-private-token'));
    await respond(1, true, 'VOLCANO');
    assert.equal(elements.get('word-art').hidden, false);
    assert.equal(elements.get('word-art').attributes.get('src'), './assets/card-volcano.png');
    assert.equal(elements.get('bomb').hidden, true);

    // A fresh Helper JWT can change account or role. Clear the old view before awaiting its response.
    authorize(auth('broadcaster-private-token'));
    assert.doesNotMatch(allText(), /Pineapple|Pizza|Fruit/);
    assert.equal(elements.get('word-art').hidden, true);
    assert.equal(elements.get('word-art').attributes.has('src'), false);
    assert.doesNotMatch(allText(), /VOLCANO/);
    await respond(2, false);
    assert.equal(elements.get('card-title').textContent, 'Your viewers have the word.');
    assert.doesNotMatch(allText(), /Pineapple|Pizza|Fruit|private-token/);

    authorize(auth('viewer-again-private-token'));
    await respond(3, true, 'VOLCANO');
    assert.match(allText(), /VOLCANO/);
    helperError(new Error('Do not expose Helper details'));
    assert.doesNotMatch(allText(), /Pineapple|Pizza|Fruit|private-token|Helper details/);
    assert.equal(elements.get('clock').hidden, true);
    assert.equal(elements.get('word-art').hidden, true);
    assert.equal(elements.get('word-art').attributes.has('src'), false);
    assert.doesNotMatch(allText(), /VOLCANO/);
  } finally {
    windowMock.dispatchEvent(new Event('pagehide'));
    await flush();
    globalThis.window = original.window;
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
  }
});
