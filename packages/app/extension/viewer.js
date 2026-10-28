import { clockValue, connectToTwitch, connectionView, readState } from './client.js';
import { cardArtFile, cardWordSize, glassRules, streakMilestone } from './presentation.js';
import { revealPixels } from './pixel-reveal.js';

const byId = (id) => document.getElementById(id);
let current = null;
let receivedAt = 0;
let connected = false;
let announcementKey = '';
let dealtRound = '';
let dealAnimation;
// The ink this viewer's card was dealt with, kept for the same card's reveal.
let dealtInk = { id: '', ink: '' };
// The art of a newly dealt card resolves from pixels once, as on the landing.
let stopReveal = () => {};
let pendingReveal = null;
let artFile = '';
byId('field-rules').setAttribute('d', glassRules());

function announce(key, text) {
  if (key === announcementKey) return;
  announcementKey = key;
  byId('announcement').textContent = text;
}

function setTitle(value, secret = false, ink = '') {
  byId('card-title').textContent = value;
  byId('card-title').dataset.wordSize = secret ? cardWordSize(value) : 'message';
  // The ink names the word as surely as the word does; it is cleared with it.
  byId('card-title').style.color = secret ? ink : '';
}

function setQuestion(text) {
  byId('card-question').textContent = text ?? '';
  byId('card-question').hidden = !text;
}

function cancelReveal() {
  if (pendingReveal) byId('word-art').removeEventListener('load', pendingReveal);
  pendingReveal = null;
  stopReveal();
  stopReveal = () => {};
}

function revealArt() {
  cancelReveal();
  const image = byId('word-art');
  const file = artFile;
  if (!file) return;
  const play = () => {
    pendingReveal = null;
    if (artFile !== file) return;
    stopReveal = revealPixels({ holder: byId('art-reveal'), image, canvas: byId('art-pixels') });
  };
  if (image.complete && image.naturalWidth) play();
  else {
    pendingReveal = play;
    image.addEventListener('load', play, { once: true });
  }
}

function setArt(word) {
  const file = cardArtFile(word);
  const art = byId('word-art');
  // The canvas holds pixels of the artwork, so it is emptied with the image.
  if ((file ?? '') !== artFile) cancelReveal();
  artFile = file ?? '';
  art.hidden = !file;
  // A filename can reveal the word too. Remove it when authorization or role changes.
  if (file) art.setAttribute('src', `./assets/${file}`);
  else art.removeAttribute('src');
  byId('card-back').hidden = typeof word === 'string';
}

function setDifficulty(value) {
  const level = { easy: 1, medium: 2, hard: 3 }[value];
  const element = byId('difficulty');
  element.hidden = !level;
  element.replaceChildren();
  element.removeAttribute('aria-label');
  if (!level) return;
  element.setAttribute('aria-label', `${value[0].toUpperCase()}${value.slice(1)} difficulty`);
  element.replaceChildren(...Array.from({ length: 3 }, (_, index) => {
    const pip = document.createElement('i');
    pip.dataset.filled = String(index < level);
    pip.setAttribute('aria-hidden', 'true');
    return pip;
  }));
}

/** The streamer's pick: one chatter's name, never their hint. */
function setAward(award) {
  byId('card-award').hidden = !award;
  byId('card-award').textContent = award ? `Streamer’s pick: @${award.name}` : '';
}

/** Chat's top three bait MVPs. Shown between rounds, when the card has room for them. */
function setMvps(mvps) {
  byId('mvps').hidden = mvps.length === 0;
  byId('mvp-list').replaceChildren(
    ...mvps.map((mvp) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `@${mvp.name}`;
      const picks = document.createElement('span');
      picks.textContent = mvp.baits === 1 ? ' 1 pick' : ` ${mvp.baits} picks`;
      item.replaceChildren(name, picks);
      return item;
    }),
  );
}

function deal(roundId) {
  if (dealtRound === roundId) return;
  dealtRound = roundId;
  dealAnimation?.cancel();
  revealArt();
  const card = byId('card');
  if (card.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dealAnimation = card.animate(
      [
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  }
}

function clearCard(title, detail, label = 'Waiting', resetAnnouncement = true) {
  current = null;
  dealAnimation?.cancel();
  dealtInk = { id: '', ink: '' };
  setArt(null);
  setDifficulty(null);
  setQuestion(null);
  if (resetAnnouncement) {
    announcementKey = '';
    byId('announcement').textContent = '';
  }
  byId('card').dataset.state = 'waiting';
  byId('card-kicker').textContent = 'Next round';
  byId('phase-label').textContent = label;
  setTitle(title);
  byId('card-detail').textContent = detail;
  byId('card-detail').hidden = false;
  byId('forbidden').hidden = true;
  byId('forbidden-list').replaceChildren();
  setAward(null);
  setMvps([]);
  byId('clock').hidden = true;
  byId('round-index').textContent = "Chat's secret";
  byId('card-stamp').textContent = 'Only chat will know';
  byId('play-instruction').textContent = 'Nudge the conversation.';
  byId('skip-note').hidden = false;
}

function render({ configured, room }) {
  current = room;
  receivedAt = Date.now();
  if (!configured || !room) {
    clearCard(
      'Not dealt in yet.',
      'The streamer needs to connect their channel in the broadcaster studio.',
      'Waiting',
      false,
    );
    announce('unconfigured', 'Waiting for the streamer to connect Baited.');
    return;
  }
  const streak = room.score.streak;
  byId('round-index').textContent = room.round
    ? `Round ${room.round.number}${streak >= 2 ? ` · ${streak} in a row` : ''}`
    : streak >= 2
      ? `${streak} in a row`
      : "Chat's secret";
  const playing = ['active', 'paused', 'settling'].includes(room.phase) && room.round;
  if (playing) {
    const visible = typeof room.round.target === 'string';
    const phase = { active: 'Live', paused: 'Paused', settling: 'Checking' }[room.phase];
    byId('card').dataset.state = room.phase === 'active' ? 'active' : 'paused';
    byId('card-kicker').textContent = visible ? 'Secret word' : 'Broadcaster';
    byId('phase-label').textContent = phase;
    setTitle(visible ? room.round.target : 'Your viewers have the word.', visible, room.round.ink);
    setArt(visible ? room.round.target : null);
    setDifficulty(visible ? room.round.difficulty : null);
    setQuestion(visible ? room.round.example : null);
    // The word, clues and clock need the card during a round.
    setAward(null);
    setMvps([]);
    dealtInk = visible ? { id: room.round.id, ink: room.round.ink ?? '' } : { id: '', ink: '' };
    byId('card-detail').hidden = visible;
    byId('card-detail').textContent = !visible
      ? 'Run the round and confirm catches in your studio.'
      : room.phase === 'active'
        ? "Make them say it. Don't type it."
        : room.phase === 'paused'
          ? 'Hold that thought. The round will resume here.'
          : 'Waiting for the last words to reach the game.';
    byId('forbidden').hidden = !visible || room.round.forbiddenClues.length === 0;
    byId('forbidden-list').replaceChildren(
      ...(visible ? room.round.forbiddenClues : []).map((clue) => {
        const item = document.createElement('li');
        item.textContent = clue;
        return item;
      }),
    );
    byId('forbidden-list').dataset.count = String(visible ? room.round.forbiddenClues.length : 0);
    byId('clock').hidden = false;
    byId('clock-caption').textContent =
      room.phase === 'paused'
        ? 'Clock paused'
        : room.phase === 'settling'
          ? 'Round closing'
          : 'Time left';
    byId('card-stamp').textContent = visible ? 'Only chat knows' : 'Secret kept';
    byId('play-instruction').textContent = !visible
      ? 'Keep talking. Chat is setting the trap.'
      : room.phase === 'paused'
        ? 'The clock is paused.'
        : room.phase === 'settling'
          ? 'Checking the final words.'
          : 'Hint at it. Don’t type the word.';
    byId('skip-note').hidden = !visible;
    announce(
      `round:${room.round.id}:${room.phase}`,
      visible
        ? `Round ${room.round.number}. Your word is ${room.round.target}. ${phase}.`
        : `Round ${room.round.number}. Your viewers have the word. ${phase}.`,
    );
    deal(room.round.id);
    renderClock();
    return;
  }
  if (room.result) {
    const result = room.result;
    const copy = {
      caught: ['Baited.', 'The streamer confirmed it. Chat got the word.'],
      escaped: ['Got away.', 'Time ran out. Another word, another chance.'],
      skipped: ['New bait next.', 'Chat skipped this word.'],
      ended: ['Round ended.', 'The streamer ended this round.'],
      overturned: ['Catch rejected.', 'That catch does not count. New word next.'],
      review: ['Catch pending.', 'The streamer is checking what they heard.'],
    }[result.outcome];
    byId('card').dataset.state = result.outcome === 'review' ? 'review' : 'result';
    byId('card-kicker').textContent = copy[0];
    byId('phase-label').textContent =
      result.outcome === 'review' ? 'Streamer’s call' : 'Complete';
    setTitle(result.word, true, dealtInk.id === result.id ? dealtInk.ink : '');
    setArt(result.word);
    setDifficulty(null);
    setQuestion(null);
    const tier =
      result.outcome === 'caught' && result.milestone ? streakMilestone(result.milestone) : null;
    if (tier) {
      // The flame is an image, never a text glyph, so it draws the same everywhere.
      const flame = document.createElement('img');
      flame.className = 'card-detail__flame';
      flame.setAttribute('src', './assets/streak-flame.svg');
      flame.setAttribute('alt', '');
      flame.setAttribute('aria-hidden', 'true');
      flame.setAttribute('width', '12');
      flame.setAttribute('height', '14');
      byId('card-detail').replaceChildren(
        `${copy[1]} `,
        flame,
        ` ${result.newBadge ? 'New streak badge' : 'Streak badge'}: ${tier.name}, ${tier.count} in a row.`,
      );
    } else byId('card-detail').textContent = copy[1];
    byId('card-detail').hidden = false;
    byId('forbidden').hidden = true;
    byId('forbidden-list').replaceChildren();
    const award = result.outcome === 'caught' ? result.award : undefined;
    setAward(award);
    setMvps(room.mvps);
    byId('clock').hidden = true;
    byId('card-stamp').textContent =
      result.outcome === 'caught'
        ? streak >= 2
          ? `${streak} in a row`
          : 'They said it'
        : 'Next round soon';
    byId('play-instruction').textContent =
      result.outcome === 'review'
        ? 'A suggested catch only counts after the streamer confirms it.'
        : 'The next secret appears here when the streamer starts again.';
    byId('skip-note').hidden = true;
    announce(
      `result:${result.id}:${result.outcome}:${award?.name ?? ''}`,
      `${copy[0]} The word was ${result.word}. ${copy[1]}${award ? ` Streamer’s pick: @${award.name}.` : ''}`,
    );
    return;
  }
  clearCard(
    'The word is coming.',
    'It appears here when the streamer starts a round.',
    'Waiting',
    false,
  );
  setMvps(room.mvps);
  announce('idle', 'Waiting for the next round.');
}

function renderClock() {
  if (!current?.round || byId('clock').hidden) return;
  const clock = clockValue(current, receivedAt);
  byId('clock-value').textContent = connected ? clock.label : '--:--';
  byId('clock-value').setAttribute(
    'aria-label',
    connected ? `${clock.label} remaining` : 'Clock unavailable while reconnecting',
  );
  byId('clock-progress').value = clock.fraction * 100;
  byId('clock').dataset.urgent = String(
    connected && current.phase === 'active' && clock.milliseconds <= 15000,
  );
}

const client = connectToTwitch({
  path: '/api/extension/state',
  parse: readState,
  onData: render,
  onStatus(status) {
    connected = status.kind === 'connected';
    connectionView(status);
    if (['invalid', 'authorization', 'forbidden', 'connecting'].includes(status.kind)) {
      clearCard(
        'Waiting for the word.',
        status.kind === 'connecting'
          ? 'Connecting this panel to the round.'
          : 'The panel needs a current Twitch connection to show a secret.',
        'Connecting',
      );
      byId('card-kicker').textContent = 'Twitch connection';
    }
    if (status.kind === 'reconnecting') {
      byId('phase-label').textContent = 'Reconnecting';
      byId('card-kicker').textContent = 'Twitch connection';
      byId('card').dataset.state = 'reconnecting';
    }
    renderClock();
  },
});
byId('retry').addEventListener('click', () => client?.refresh());
let tick;
function startClock() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (document.visibilityState !== 'hidden') renderClock();
  }, 250);
}
startClock();
window.addEventListener('pagehide', () => clearInterval(tick));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) startClock();
});
