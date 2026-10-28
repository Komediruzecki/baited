/**
 * Prints what the chat bot would post during a scripted demo session. It drives the real
 * game and bot with a simulated clock, so copy and pacing changes show up here unchanged.
 * Nothing is sent to Twitch. Run: pnpm bot:transcript
 */
import { tmpdir } from 'node:os';
import { Game, defaults } from '../server/game.js';
import { ChatBot } from '../server/chatbot.js';
import { Store } from '../server/store.js';
import { loadConfig } from '../server/config.js';

let now = Date.UTC(2026, 9, 27, 20, 0, 0);
let micOff = false;
const game = new Game(
  {
    id: 'transcript',
    owner: 'streamer',
    channel: 'your_channel',
    mode: 'demo',
    overlayKey: 'transcript',
    settings: { ...defaults, chatBot: true, modCommands: true, callBait: true, auto: true },
    history: [],
    priorWins: 0,
    priorPlayed: 0,
    priorBest: 0,
    leaders: {},
  },
  () => now,
  () => 0,
);
const bot = new ChatBot({
  config: loadConfig({}),
  store: new Store(tmpdir(), '00'.repeat(32)),
  ready: () => (micOff ? "The streamer's microphone is off. Turn it on in the studio first." : null),
  clock: () => now,
});
game.onEvent = (event) => bot.event(game, event);

const lines: string[] = [];
const seen = new Set<string>();
const time = () => new Date(now).toISOString().slice(11, 19);
let messages = 0;
function settle(ms = 5000) {
  for (const end = now + ms; now < end; ) {
    now += 250;
    game.tick();
    bot.tick(game);
    for (const post of [...bot.status(game).recent].reverse())
      if (!seen.has(post.id)) {
        seen.add(post.id);
        lines.push(`  ${time()}  Baity        ${post.text}`);
      }
  }
}
function step(label: string) {
  lines.push('', `▸ ${label}`);
}
function say(name: string, text: string, moderator = false) {
  const id = `message-${++messages}`,
    userId = name === 'Streamer' ? 'streamer' : `user:${name.toLowerCase()}`;
  lines.push(`  ${time()}  ${(name + (moderator ? ' (mod)' : '')).padEnd(12)} ${text}`);
  game.chat(id, userId, name, text, now);
  bot.chat(game, { id, userId, name, text, badges: moderator ? ['moderator'] : [], at: now });
}
const live = () => game.phase === 'active' && game.round;
const left = () => (game.round ? game.round.endsAt - now : 0);
function catchWord(confirm: boolean) {
  const r = game.round!;
  game.transcript(
    { roundId: r.id, epoch: r.epoch, text: r.word, final: true, confidence: 1, capturedAt: now, id: `catch-${now}` },
    confirm ? 'confirm' : 'automatic',
  );
}

step('A moderator starts the first round');
say('ModName', '!bait start', true);
settle();
step('Chat asks how to play, the score and the leaderboard');
say('NewViewer', '!bait help');
settle();
say('NewViewer', '!bait score');
settle();
say('NewViewer', '!bait top');
settle();
step('Chat drops a hint and one viewer votes to skip');
say('ViewerOne', 'what is your favourite cold animal?');
say('ViewerTwo', '!skip');
settle();
step('Halfway through the round');
while (live() && left() > game.round!.duration / 2) settle(1000);
settle();
step('A moderator pauses, then resumes');
say('ModName', '!bait pause', true);
settle();
say('ModName', '!bait resume', true);
settle();
step('A moderator tries to start a second round while this one is live');
say('ModName', '!bait start', true);
settle();
step('The streamer calls the bait and guesses wrong');
game.guess(game.round!.id, game.round!.epoch, 'pineapple');
settle();
step('The last ten seconds');
while (live() && left() > 10000) settle(1000);
settle(2000);
step('Speech hears the word; the streamer confirms the catch');
const caught = game.round!.id;
catchWord(true);
settle(2000);
game.decideCatch(caught, 'confirm');
settle();
step("The streamer picks the hint that baited them");
const board = game.awardBoard;
const hint = board?.candidates.find((candidate) => candidate.eligible);
if (board && hint) game.award(board.roundId, hint.id);
settle();
step('Automatic rounds: the next word starts, and time runs out');
while (game.phase !== 'active') settle(1000);
settle(1000);
while (live()) settle(5000);
settle();
step('Next word: three viewers vote to skip it');
while (game.phase !== 'active') settle(1000);
for (const name of ['ViewerOne', 'ViewerTwo', 'ViewerThree']) say(name, '!skip');
settle();
step('Next word: the streamer ends the round');
while (game.phase !== 'active') settle(1000);
game.end('ended');
game.data.settings.auto = false;
settle(12000);
step('Two wins in a row, then the streamer reverses the second');
say('ModName', '!bait start', true);
settle();
catchWord(false);
settle(12000);
say('ModName', '!bait start', true);
settle();
catchWord(false);
settle();
game.reverse();
settle(12000);
step('Five wins in a row: a streak, three badges and a streak command');
for (let i = 0; i < 5; i++) {
  say('ModName', '!bait start', true);
  settle();
  catchWord(false);
  settle(12000);
}
say('NewViewer', '!bait streak');
settle();
step('The streak ends when chat skips a word');
say('ModName', '!bait start', true);
settle();
for (const name of ['ViewerOne', 'ViewerTwo', 'ViewerThree']) say(name, '!skip');
settle(12000);
step('A three-word mission: one word lands, then the mission clock runs out');
game.update({ ...game.data.settings, mission: 'three', missionDuration: 90 });
say('ModName', '!bait start', true);
settle();
catchWord(false);
settle(12000);
while (game.mission?.status === 'active') settle(5000);
settle();
step('Moderator commands that cannot run');
say('ModName', '!bait pause', true);
settle();
micOff = true;
say('ModName', '!bait start', true);
settle();
say('ViewerOne', '!bait start');
settle();
lines.push(
  '',
  '(Viewers cannot use moderator commands; they get no reply. Replies to commands are threaded under the command.)',
);
console.log(lines.join('\n'));
