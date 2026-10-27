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

test('overlay shows the face to viewers, only the back to the broadcaster, and clears on role change', async () => {
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
  const card = () => elements.get('card');
  const state = (secret = true, word = 'VOLCANO', phase = 'active', result = null) => ({
    version: '0.0.1', configured: true, room: {
      phase, channel: 'streamer', serverTime: 10000, result,
      round: phase === 'cooldown' ? null : { id: 'round-one', number: 1, duration: 60000, remaining: 45000, endsAt: 55000,
        ...(secret ? { target: word, forbiddenClues: ['Lava', 'Eruption'] } : {}) },
    },
  });
  const respond = async (index, value) => {
    calls[index].resolve({ status: 200, ok: true, text: async () => JSON.stringify(value) });
    await flush();
  };
  const auth = (token) => ({ clientId: 'fixtureclient', channelId: '12345', token });
  try {
    await import('../overlay.js');
    // Nothing is drawn before a round exists.
    assert.notEqual(elements.get('table')?.dataset.visible, 'true');

    authorize(auth('viewer-private-token'));
    await respond(0, state());
    assert.equal(elements.get('table').dataset.visible, 'true');
    assert.equal(elements.get('front-word').textContent, 'VOLCANO');
    assert.equal(elements.get('front-art').attributes.get('src'), './assets/card-volcano.png');
    assert.match(allText(), /Lava/);
    assert.doesNotMatch(allText(), /private-token/);
    // The card lands face down, then turns over for a viewer.
    assert.equal(card().dataset.face, 'back');
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(card().dataset.face, 'front');

    // A fresh Helper JWT can change account or role. Clear the face before awaiting its response.
    authorize(auth('broadcaster-private-token'));
    assert.doesNotMatch(allText(), /VOLCANO|Lava|Eruption/);
    assert.equal(elements.get('front-art').attributes.has('src'), false);
    assert.equal(elements.get('table').dataset.visible, 'false');
    await respond(1, state(false));
    assert.equal(elements.get('table').dataset.visible, 'true');
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(card().dataset.face, 'back');
    assert.equal(elements.get('face-front').attributes.get('aria-hidden'), 'true');
    assert.equal(elements.get('back-copy').textContent, 'Chat has the word.');
    assert.doesNotMatch(allText(), /VOLCANO|Lava|Eruption|private-token/);

    // A decided round turns over for everyone, the broadcaster included.
    authorize(auth('broadcaster-result-token'));
    await respond(2, state(false, 'VOLCANO', 'cooldown', { id: 'round-one', word: 'VOLCANO', outcome: 'caught' }));
    assert.equal(card().dataset.face, 'front');
    assert.equal(card().dataset.outcome, 'caught');
    assert.equal(elements.get('front-word').textContent, 'VOLCANO');

    authorize(auth('viewer-again-private-token'));
    await respond(3, state(true, 'PENGUIN'));
    assert.match(allText(), /PENGUIN/);
    helperError(new Error('Do not expose Helper details'));
    assert.doesNotMatch(allText(), /PENGUIN|Lava|Helper details|private-token/);
    assert.equal(elements.get('front-art').attributes.has('src'), false);
    assert.equal(elements.get('table').dataset.visible, 'false');
  } finally {
    windowMock.dispatchEvent(new Event('pagehide'));
    await flush();
    globalThis.window = original.window;
    globalThis.document = original.document;
    globalThis.fetch = original.fetch;
  }
});
