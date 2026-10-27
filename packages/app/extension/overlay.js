import { clockValue, connectToTwitch, readState } from './client.js';
import { cardArtFile, wordSize } from './presentation.js';

const byId = (id) => document.getElementById(id);
// A finished card stays on the video briefly, then the overlay is transparent again.
const RESULT_MS = 12000;
const TURN_MS = 520;
const COLLAPSED_KEY = 'baited-overlay-collapsed';
let current = null;
let receivedAt = 0;
let connected = false;
let announcementKey = '';
let dealtRound = '';
let turnTimer = null;
let landing;
let shownResult = { key: '', since: 0 };

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readCollapsed() {
  try {
    return window.localStorage?.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value) {
  try {
    window.localStorage?.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    /* Storage can be blocked inside the Twitch frame. The toggle still works. */
  }
}

function announce(key, text) {
  if (key === announcementKey) return;
  announcementKey = key;
  byId('announcement').textContent = text;
}

function setFace(face) {
  byId('card').dataset.face = face;
  byId('face-front').setAttribute('aria-hidden', String(face !== 'front'));
  byId('face-back').setAttribute('aria-hidden', String(face !== 'back'));
}

function setArt(word) {
  const file = cardArtFile(word);
  const art = byId('front-art');
  art.hidden = !file;
  // A filename can reveal the word too. Remove it whenever the face is cleared.
  if (file) art.setAttribute('src', `./assets/${file}`);
  else art.removeAttribute('src');
}

function setWord(word) {
  byId('front-word').textContent = word;
  byId('front-word').dataset.wordSize = wordSize(word);
}

function setClues(clues) {
  byId('front-clues').hidden = clues.length === 0;
  byId('front-clues').replaceChildren(
    ...clues.map((clue) => {
      const item = document.createElement('li');
      item.textContent = clue;
      return item;
    }),
  );
}

/** Removes every secret the front face may hold: word, artwork filename and clues. */
function clearFront() {
  byId('front-word').textContent = '';
  byId('front-word').dataset.wordSize = 'message';
  byId('front-detail').textContent = '';
  byId('front-kicker').textContent = "Chat's secret";
  byId('front-stamp').textContent = 'Only chat knows';
  setArt(null);
  setClues([]);
}

function setVisible(visible) {
  byId('table').dataset.visible = String(visible);
}

function cancelTurn() {
  clearTimeout(turnTimer);
  turnTimer = null;
}

function hide(resetAnnouncement = false) {
  cancelTurn();
  landing?.cancel();
  setVisible(false);
  clearFront();
  setFace('back');
  dealtRound = '';
  byId('card').dataset.state = 'waiting';
  delete byId('card').dataset.outcome;
  if (resetAnnouncement) {
    announcementKey = '';
    byId('announcement').textContent = '';
  }
}

function deal(roundId, face) {
  if (dealtRound === roundId) {
    if (turnTimer === null) setFace(face);
    return;
  }
  dealtRound = roundId;
  cancelTurn();
  landing?.cancel();
  // Every card lands face down. Only a viewer's card turns over.
  setFace('back');
  const card = byId('card');
  if (!reducedMotion() && typeof card.animate === 'function') {
    landing = card.animate(
      [
        { opacity: 0, transform: 'translateX(36px) rotate(4deg)' },
        { opacity: 1, transform: 'translateX(0) rotate(0deg)' },
      ],
      { duration: 360, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  }
  if (face === 'front') {
    turnTimer = setTimeout(
      () => {
        turnTimer = null;
        if (dealtRound === roundId) setFace('front');
      },
      reducedMotion() ? 0 : TURN_MS,
    );
  }
}

function resultVisible(result) {
  if (result.outcome === 'review') return true;
  const key = `${result.id}:${result.outcome}`;
  if (shownResult.key !== key) shownResult = { key, since: Date.now() };
  return Date.now() - shownResult.since < RESULT_MS;
}

function showRound(room) {
  const round = room.round;
  const visible = typeof round.target === 'string';
  const card = byId('card');
  setVisible(true);
  card.dataset.state = room.phase;
  delete card.dataset.outcome;
  if (visible) {
    byId('front-kicker').textContent =
      room.phase === 'paused' ? 'Paused' : room.phase === 'settling' ? 'Checking' : "Chat's secret";
    setWord(round.target);
    setArt(round.target);
    setClues(round.forbiddenClues);
    byId('front-detail').textContent =
      room.phase === 'active'
        ? "Make them say it. Don't type it."
        : room.phase === 'paused'
          ? 'Hold that thought.'
          : 'Checking the last words.';
    byId('front-stamp').textContent = 'Only chat knows';
  } else clearFront();
  byId('back-copy').textContent =
    room.phase === 'paused'
      ? 'Round paused.'
      : room.phase === 'settling'
        ? 'Checking final words.'
        : 'Chat has the word.';
  deal(round.id, visible ? 'front' : 'back');
  announce(
    `round:${round.id}:${room.phase}:${visible}`,
    visible
      ? `Round ${round.number}. Your word is ${round.target}. Don't type it in chat.`
      : `Round ${round.number}. Your viewers have the word. The card stays face down for you.`,
  );
  renderClock();
}

function showResult(room) {
  const result = room.result;
  const copy = {
    caught: ['Baited.', 'Chat got the word.', 'They said it'],
    escaped:
      result.reason === 'guess'
        ? ['Bait called.', 'The streamer guessed it.', 'Streamer escapes']
        : ['Got away.', 'Time ran out.', 'Next round soon'],
    skipped: ['New bait next.', 'Chat skipped this word.', 'Next round soon'],
    ended: ['Round ended.', 'The streamer ended it.', 'Next round soon'],
    overturned: ['Catch rejected.', 'That catch does not count.', 'Next round soon'],
    review: ['Catch pending.', 'The streamer is checking.', 'Did they say it?'],
  }[result.outcome];
  const card = byId('card');
  setVisible(true);
  cancelTurn();
  card.dataset.state = result.outcome === 'review' ? 'review' : 'result';
  card.dataset.outcome = result.outcome;
  byId('front-kicker').textContent = copy[0];
  setWord(result.word);
  setArt(result.word);
  setClues([]);
  byId('front-detail').textContent = copy[1];
  byId('front-stamp').textContent = copy[2];
  // The decided card turns over for everyone, including the broadcaster.
  if (!dealtRound) dealtRound = result.id;
  setFace('front');
  announce(`result:${result.id}:${result.outcome}`, `${copy[0]} The word was ${result.word}.`);
}

function paint() {
  const room = current;
  if (!room) {
    hide();
    return;
  }
  if (['active', 'paused', 'settling'].includes(room.phase) && room.round) {
    showRound(room);
    return;
  }
  if (room.result && resultVisible(room.result)) {
    showResult(room);
    return;
  }
  hide();
}

function render({ configured, room }) {
  current = configured ? room : null;
  receivedAt = Date.now();
  paint();
}

function renderClock() {
  const card = byId('card');
  if (!current?.round || !['active', 'paused', 'settling'].includes(current.phase)) {
    byId('card-progress').style.width = '0%';
    return;
  }
  const clock = clockValue(current, receivedAt);
  const label = connected ? clock.label : '--';
  byId('front-clock').textContent = label;
  byId('back-clock').textContent = label;
  byId('card-progress').style.width = `${clock.fraction * 100}%`;
  card.dataset.urgent = String(
    connected && current.phase === 'active' && clock.milliseconds <= 15000,
  );
}

function setCollapsed(value) {
  byId('deal').dataset.collapsed = String(value);
  byId('collapse').setAttribute('aria-expanded', String(!value));
  byId('collapse-label').textContent = value ? 'Show card' : 'Hide card';
}

let collapsed = readCollapsed();
setCollapsed(collapsed);
byId('collapse').addEventListener('click', () => {
  collapsed = !collapsed;
  setCollapsed(collapsed);
  writeCollapsed(collapsed);
});

connectToTwitch({
  path: '/api/extension/state',
  parse: readState,
  onData: render,
  onStatus(status) {
    connected = status.kind === 'connected';
    byId('card').dataset.stale = String(status.kind === 'reconnecting');
    // A fresh Helper JWT can change account or role. Clear before the new response arrives.
    if (['invalid', 'authorization', 'forbidden', 'connecting'].includes(status.kind)) {
      current = null;
      hide(true);
    }
    renderClock();
  },
});

let tick;
function startClock() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (document.visibilityState !== 'hidden') {
      renderClock();
      // Let a finished card leave on time even between polls.
      if (current?.result && !['active', 'paused', 'settling'].includes(current.phase)) paint();
    }
  }, 250);
}
startClock();
window.addEventListener('pagehide', () => clearInterval(tick));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) startClock();
});
