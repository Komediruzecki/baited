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
  get textContent() { return this.content + this.children.map((child) => (typeof child === 'string' ? child : child.textContent)).join(''); }
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

    // A win that lands on a badge draws the flame as an image, not a text glyph.
    await show(room({ result: { id: 'round-badge', word: 'VOLCANO', outcome: 'caught', milestone: 3, newBadge: true },
      score: { streak: 3, best: 3 } }));
    const detail = elements.get('card-detail');
    assert.equal(detail.textContent, 'The catch is confirmed. Chat got the word.  New streak badge: Heating up, 3 in a row.');
    const flame = detail.children.find((child) => typeof child !== 'string');
    assert.equal(flame.attributes.get('src'), './assets/streak-flame.svg');
    assert.equal(flame.attributes.get('alt'), '');
    assert.equal(flame.attributes.get('aria-hidden'), 'true');
    assert.doesNotMatch(detail.textContent, /[\u{2190}-\u{2BFF}\u{1F000}-\u{1FAFF}\u{FE0F}]/u);

    // A gifted win is explicit, even when it also earns a streak badge.
    await show(room({ result: { id: 'round-gift', word: 'VOLCANO', outcome: 'caught', reason: 'baity-chaos', milestone: 5, newBadge: true },
      score: { streak: 5, best: 5 } }));
    assert.equal(elements.get('card-kicker').textContent, 'Baity’s call.');
    assert.match(detail.textContent, /The streamer guessed correctly\. Baity gave chat the win\./);
    assert.match(detail.textContent, /New streak badge/);
    assert.doesNotMatch(detail.textContent, /catch is confirmed|They said it/);
    assert.match(elements.get('announcement').textContent, /guessed correctly/);
    assert.equal(award().hidden, true, 'The gift does not invent a streamer pick.');
    await show(room({ result: { id: 'round-gift', word: 'Hidden', outcome: 'overturned', reason: 'baity-chaos' } }));
    assert.equal(elements.get('card-kicker').textContent, 'Gift reversed.');
    assert.equal(detail.textContent, 'Baity’s gifted win was removed.');
    assert.doesNotMatch(elements.get('announcement').textContent, /Catch rejected|catch does not count/);

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
