import { clockValue, connectToTwitch, connectionView, readState } from './client.js';
import { cardArtFile, wordSize } from './presentation.js';

const byId = (id) => document.getElementById(id);
let current = null;
let receivedAt = 0;
let connected = false;
let announcementKey = '';
let dealtRound = '';
let dealAnimation;

function announce(key, text) {
  if (key === announcementKey) return;
  announcementKey = key;
  byId('announcement').textContent = text;
}

function setTitle(value, secret = false) {
  byId('card-title').textContent = value;
  byId('card-title').dataset.wordSize = secret ? wordSize(value) : 'message';
}

function setArt(word) {
  const file = cardArtFile(word);
  const art = byId('word-art');
  art.hidden = !file;
  // A filename can reveal the word too. Remove it when authorization or role changes.
  if (file) art.setAttribute('src', `./assets/${file}`);
  else art.removeAttribute('src');
  byId('bomb').hidden = typeof word === 'string';
}

function deal(roundId) {
  if (dealtRound === roundId) return;
  dealtRound = roundId;
  dealAnimation?.cancel();
  const card = byId('card');
  if (card.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dealAnimation = card.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 280, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  }
}

function clearCard(title, detail, label = 'Waiting', resetAnnouncement = true) {
  current = null;
  dealAnimation?.cancel();
  setArt(null);
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
  byId('clock').hidden = true;
  byId('round-index').textContent = "Chat's secret";
  byId('card-stamp').textContent = 'Keep it in chat';
  byId('play-instruction').textContent = 'Write a hint in chat. Keep the secret word to yourself.';
  byId('skip-note').hidden = false;
}

function render({ configured, room }) {
  current = room;
  receivedAt = Date.now();
  if (!configured || !room) {
    clearCard('Not dealt in yet.', 'The streamer needs to connect their channel in the broadcaster studio.', 'Waiting', false);
    announce('unconfigured', 'Waiting for the streamer to connect baited.');
    return;
  }
  byId('round-index').textContent = room.round ? `Round ${room.round.number}` : "Chat's secret";
  const playing = ['active', 'paused', 'settling'].includes(room.phase) && room.round;
  if (playing) {
    const visible = typeof room.round.target === 'string';
    const phase = { active: 'In play', paused: 'Paused', settling: 'Checking speech' }[room.phase];
    byId('card').dataset.state = room.phase === 'active' ? 'active' : 'paused';
    byId('card-kicker').textContent = visible ? "Chat's secret word" : 'Broadcaster view';
    byId('phase-label').textContent = phase;
    setTitle(visible ? room.round.target : 'Your viewers have the word.', visible);
    setArt(visible ? room.round.target : null);
    byId('card-detail').hidden = room.phase === 'active' && visible;
    byId('card-detail').textContent = !visible ? 'Keep talking. Chat is setting the trap.' : room.phase === 'paused' ? 'Hold that thought. The round will resume here.' : 'Waiting for the last words to reach the game.';
    byId('forbidden').hidden = !visible || room.round.forbiddenClues.length === 0;
    byId('forbidden-list').replaceChildren(...(visible ? room.round.forbiddenClues : []).map((clue) => {
      const item = document.createElement('li'); item.textContent = clue; return item;
    }));
    byId('clock').hidden = false;
    byId('clock-caption').textContent = room.phase === 'paused' ? 'Clock paused' : room.phase === 'settling' ? 'Round closing' : 'Time left';
    byId('card-stamp').textContent = visible ? 'Only chat knows' : 'Secret kept';
    byId('play-instruction').textContent = visible ? 'Nudge the conversation. Don’t type the secret word.' : 'Run the round and confirm catches in your broadcaster studio.';
    byId('skip-note').hidden = !visible;
    announce(`round:${room.round.id}:${room.phase}`, visible ? `Round ${room.round.number}. Your word is ${room.round.target}. ${phase}.` : `Round ${room.round.number}. Your viewers have the word. ${phase}.`);
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
      overturned: ['Catch reversed.', 'The streamer corrected the result.'],
      review: ['Catch pending.', 'The streamer is checking what they heard.'],
    }[result.outcome];
    byId('card').dataset.state = result.outcome === 'review' ? 'review' : 'result';
    byId('card-kicker').textContent = copy[0];
    byId('phase-label').textContent = result.outcome === 'review' ? 'Awaiting confirmation' : 'Round complete';
    setTitle(result.word, true);
    setArt(result.word);
    byId('card-detail').textContent = copy[1];
    byId('card-detail').hidden = false;
    byId('forbidden').hidden = true;
    byId('forbidden-list').replaceChildren();
    byId('clock').hidden = true;
    byId('card-stamp').textContent = result.outcome === 'caught' ? 'They said it' : 'Next round soon';
    byId('play-instruction').textContent = result.outcome === 'review' ? 'A suggested catch only counts after the streamer confirms it.' : 'The next secret appears here when the streamer starts again.';
    byId('skip-note').hidden = true;
    announce(`result:${result.id}:${result.outcome}`, `${copy[0]} The word was ${result.word}. ${copy[1]}`);
    return;
  }
  clearCard('The word is coming.', 'It appears here when the streamer starts a round.', 'Waiting', false);
  announce('idle', 'Waiting for the next round.');
}

function renderClock() {
  if (!current?.round || byId('clock').hidden) return;
  const clock = clockValue(current, receivedAt);
  byId('clock-value').textContent = connected ? clock.label : '--';
  byId('clock-value').setAttribute('aria-label', connected ? `${clock.label} remaining` : 'Clock unavailable while reconnecting');
  byId('clock-progress').value = clock.fraction * 100;
  byId('clock').dataset.urgent = String(connected && current.phase === 'active' && clock.milliseconds <= 15000);
}

const client = connectToTwitch({
  path: '/api/extension/state', parse: readState, onData: render,
  onStatus(status) {
    connected = status.kind === 'connected';
    connectionView(status);
    if (['invalid', 'authorization', 'forbidden', 'connecting'].includes(status.kind)) {
      clearCard('Waiting for the word.', status.kind === 'connecting' ? 'Connecting this panel to the round.' : 'The panel needs a current Twitch connection to show a secret.', 'Connecting');
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
  tick = setInterval(() => { if (document.visibilityState !== 'hidden') renderClock(); }, 250);
}
startClock();
window.addEventListener('pagehide', () => clearInterval(tick));
window.addEventListener('pageshow', (event) => { if (event.persisted) startClock(); });
