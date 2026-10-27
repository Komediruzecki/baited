import { clockValue, connectToTwitch, readState } from './client.js';
import { cardArtFile, finishArt, glassRules, nextStreakTier, streakMilestone, wordSize } from './presentation.js';

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
// The ink a viewer's card was dealt with, kept for the same card's reveal.
let dealtInk = { id: '', ink: '' };

const rules = glassRules();
byId('field-rules').setAttribute('d', rules);
byId('lens-rules').setAttribute('d', rules);

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

function setWord(word, ink = '') {
  byId('front-word').textContent = word;
  byId('front-word').dataset.wordSize = wordSize(word);
  // The ink names the word as surely as the word does; it is cleared with it.
  byId('front-word').style.color = ink;
}

function setLevel(difficulty) {
  const level = { easy: 1, medium: 2, hard: 3 }[difficulty] ?? 0;
  byId('front-pips').hidden = level === 0;
  byId('front-pips').dataset.level = String(level);
}

/** Exact playable clues under the landing's rail, or the easy rule when there are none. */
function setRules(clues) {
  byId('front-rules').hidden = clues.length === 0;
  byId('front-clues').replaceChildren(
    ...clues.map((clue) => {
      const item = document.createElement('li');
      item.textContent = clue;
      return item;
    }),
  );
}

/** Chat's streak is public, so both faces show it from two wins on. */
function setStreak(streak) {
  const show = streak >= 2;
  const copy = `${streak} in a row`;
  byId('front-streak').hidden = !show;
  byId('back-streak').hidden = !show;
  byId('front-streak-copy').textContent = show ? copy : '';
  byId('back-streak-copy').textContent = show ? copy : '';
}

/** A milestone win reprints the card in its streak finish; every other card is Glass. */
function setFinish(tier) {
  const card = byId('card');
  const image = byId('front-finish');
  const file = tier ? finishArt(tier.finish, 'extension') : null;
  if (tier) card.dataset.finish = tier.finish;
  else delete card.dataset.finish;
  image.hidden = !file;
  if (file) image.setAttribute('src', `./assets/${file}`);
  else image.removeAttribute('src');
}

/** Removes every secret the front face may hold: word, ink, artwork filename, clues and question. */
function clearFront() {
  setWord('');
  byId('front-word').dataset.wordSize = 'short';
  byId('front-chip').textContent = '';
  byId('front-note').textContent = '';
  byId('front-question').textContent = '';
  setLevel(null);
  setArt(null);
  setRules([]);
  setFinish(null);
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
  setStreak(0);
  setFace('back');
  dealtRound = '';
  dealtInk = { id: '', ink: '' };
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
      { duration: 280, easing: 'cubic-bezier(.16,1,.3,1)' },
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
  setFinish(null);
  setStreak(room.score.streak);
  if (visible) {
    byId('front-chip').textContent =
      room.phase === 'paused'
        ? 'Paused'
        : room.phase === 'settling'
          ? 'Checking'
          : `Round ${round.number}`;
    setWord(round.target, round.ink ?? '');
    setLevel(round.difficulty);
    setArt(round.target);
    setRules(round.forbiddenClues);
    byId('front-note').textContent = round.forbiddenClues.length ? '' : 'Only this word is off limits.';
    byId('front-question').textContent = round.example ?? '';
    dealtInk = { id: round.id, ink: round.ink ?? '' };
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
  const streak = room.score.streak;
  const copy = {
    caught: ['They said it', streak >= 2 ? `Chat wins · ${streak} in a row` : 'Chat wins'],
    escaped:
      result.reason === 'guess'
        ? ['Bait called', 'The streamer guessed it']
        : ['Time’s up', 'The streamer got away'],
    skipped: ['Skipped', 'New bait next'],
    ended: ['Round ended', 'New bait next'],
    overturned: ['Catch rejected', 'That catch does not count'],
    review: ['Catch pending', 'The streamer is checking'],
  }[result.outcome];
  const card = byId('card');
  setVisible(true);
  cancelTurn();
  card.dataset.state = result.outcome === 'review' ? 'review' : 'result';
  card.dataset.outcome = result.outcome;
  setWord(result.word, dealtInk.id === result.id ? dealtInk.ink : '');
  setLevel(null);
  setArt(result.word);
  setRules([]);
  setStreak(0);
  // A win that lands on a streak tier is reprinted in that tier's finish.
  const caught = result.outcome === 'caught';
  const tier = caught && result.milestone ? streakMilestone(result.milestone) : null;
  const next = caught ? nextStreakTier(tier?.count ?? streak) : null;
  setFinish(tier);
  byId('front-chip').textContent = tier ? (result.newBadge ? 'New streak card' : 'Streak card') : copy[0];
  byId('front-note').textContent = tier ? `${tier.name} edition · ${tier.count} in a row` : copy[1];
  byId('front-question').textContent = !caught
    ? ''
    : next
      ? `${next.count - streak} more in a row for the ${next.name} card.`
      : 'Chat holds the rarest card.';
  // The decided card turns over for everyone, including the broadcaster.
  if (!dealtRound) dealtRound = result.id;
  setFace('front');
  announce(
    `result:${result.id}:${result.outcome}`,
    `${copy[0]}. The word was ${result.word}.${tier ? ` New ${tier.name} streak card.` : ''}`,
  );
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
    card.style.setProperty('--progress', '0');
    return;
  }
  const clock = clockValue(current, receivedAt);
  const label = connected ? clock.label : '--:--';
  byId('front-clock').textContent = label;
  byId('back-clock').textContent = label;
  card.style.setProperty('--progress', String(connected ? clock.fraction : 0));
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
