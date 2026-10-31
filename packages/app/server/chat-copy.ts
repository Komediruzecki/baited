import type { GameView } from '../shared/types.js';
import type { GameEvent } from './game.js';
import { nextStreakTier, streakMilestone, streakTiers } from '../extension/presentation.js';
import { after, say, type Mood, type Slot } from './baity.js';

/**
 * Everything the chat bot can say, in Baity's voice (baity.ts). Each function reads only
 * the overlay projection, the same public view OBS gets: no active target, no clues,
 * and finished words only for caught or escaped rounds. Streamers read their own chat,
 * so the bot must never know more than the stream shows.
 */
export interface Announcement {
  /** A newer queued message with the same key replaces an older one. */
  key: string;
  text: string;
  /** Milliseconds the message stays worth sending. */
  ttl: number;
}

export type ChatCommand =
  | 'join'
  | 'help'
  | 'score'
  | 'streak'
  | 'top'
  | 'who'
  | 'start'
  | 'pause'
  | 'resume';
export const MOD_COMMANDS: ReadonlySet<ChatCommand> = new Set(['start', 'pause', 'resume']);
const named: Record<string, ChatCommand> = {
  help: 'help',
  rules: 'help',
  score: 'score',
  streak: 'streak',
  top: 'top',
  who: 'who',
  baity: 'who',
  start: 'start',
  pause: 'pause',
  resume: 'resume',
};

/** `!bait` alone keeps its meaning of joining the round; `!bait <name>` is a command. */
export function parseCommand(text: string): ChatCommand | null {
  const match = /^!bait(?:\s+([a-z]+))?\s*$/i.exec(text.trim());
  if (!match) return null;
  return match[1] ? (named[match[1].toLowerCase()] ?? null) : 'join';
}

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Chat's losing run: finished rounds chat failed since its last win, newest first.
 * Escapes, skips and ended rounds count; a win stops the count; a rejected or
 * reversed catch counts for neither side. `skipNewest` reads the run from before the
 * round that just finished.
 */
export function losingRun(view: GameView, skipNewest = false) {
  let run = 0;
  for (const entry of view.history.slice(skipNewest ? 1 : 0)) {
    if (entry.outcome === 'caught') break;
    if (['escaped', 'skipped', 'ended'].includes(entry.outcome)) run++;
  }
  return run;
}
/** Baity's mood: 0 cute, 1 locked in, 2 unhinged, 3 Baeittrice. */
export const moodOf = (run: number) => Math.min(3, run) as Mood;

type Values = Record<string, string | number | null | undefined>;
const line = (view: GameView, slot: Slot, mood: Mood, values: Values = {}) =>
  say(slot, mood, { channel: view.channel, ...values }, view.id);

function nextRound(view: GameView, before: string) {
  if (view.nextAt === null || view.phase !== 'cooldown') return '';
  const seconds = Math.max(1, Math.round((view.nextAt - view.serverTime) / 1000));
  if (view.mission?.status === 'active') return after(before, line(view, 'next_word_suffix', 0, { seconds }));
  return view.settings.auto ? after(before, line(view, 'next_round_suffix', 0, { seconds })) : '';
}

function finished(view: GameView, streakBefore: number): Announcement | null {
  const result = view.result;
  if (!result || result.outcome === 'review') return null;
  const mission = view.mission;
  // The overlay projection keeps the word only for caught and escaped rounds.
  const values: Values = {
    word: result.word ? result.word.toUpperCase() : null,
    elapsed: result.elapsed,
    losses: losingRun(view),
  };
  let text: string;
  if (result.outcome === 'caught') {
    // A win reads the run from before it, so a comeback sounds like one.
    const calledWord = result.word?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120).toUpperCase();
    text = result.reason === 'baity-chaos'
      ? `You called ${calledWord || 'it'} correctly. But I'm saving chat's streak. Chat wins this one.`
      : line(view, 'caught', moodOf(losingRun(view, true)), values);
    if (view.score.streak > 1) text += after(text, line(view, 'caught_streak_suffix', 0, { streak: view.score.streak }));
    if (mission)
      text += after(
        text,
        mission.status === 'complete'
          ? line(view, 'mission_complete_suffix', 0)
          : line(view, 'mission_progress_suffix', 0, { completed: mission.completed }),
      );
  } else if (result.outcome === 'overturned') {
    text = result.reason === 'baity-chaos'
      ? "Baity's gifted win was removed. The streamer guessed correctly."
      : line(view, 'overturned', moodOf(losingRun(view)));
  } else {
    // A loss reads the run including itself.
    const slot: Slot =
      result.outcome === 'escaped'
        ? result.reason === 'guess'
          ? 'escaped_guess'
          : 'escaped_timer'
        : result.outcome;
    text = line(view, slot, moodOf(losingRun(view)), values);
    // Skips and endings break a streak too; a rejected catch leaves it alone.
    if (streakBefore > 1) text += after(text, line(view, 'streak_ended_suffix', 0, { streak_before: streakBefore }));
    if (mission && mission.status !== 'active')
      text += after(text, line(view, 'mission_over_suffix', 0, { completed: mission.completed }));
  }
  return { key: 'result', ttl: 30000, text: text + nextRound(view, text) };
}

/** A win that lands on a badge tier gets its own post, after the result. */
export function badgeAnnouncement(view: GameView): Announcement | null {
  const result = view.result;
  const tier = result?.outcome === 'caught' && result.milestone ? streakMilestone(result.milestone) : null;
  if (!tier) return null;
  const next = nextStreakTier(tier.count);
  const text = line(view, result!.newBadge ? 'badge_new' : 'badge_repeat', 0, { badge: tier.name, count: tier.count });
  const tail = next
    ? line(view, 'badge_next_suffix', 0, { next_badge: next.name, next_count: next.count })
    : line(view, 'badge_top_suffix', 0);
  return { key: 'badge', ttl: 30000, text: text + after(text, tail) };
}

export function eventAnnouncement(view: GameView, event: GameEvent): Announcement | null {
  const round = view.round;
  const mood = moodOf(losingRun(view));
  switch (event.type) {
    case 'recording-reset': return null;
    case 'start': {
      if (!round) return null;
      const time = clock(round.remaining);
      if (view.mission?.status === 'active') {
        const word = Math.min(3, view.mission.completed + 1);
        return {
          key: 'round',
          ttl: 20000,
          text:
            word === 1
              ? line(view, 'mission_start', mood, { time })
              : line(view, 'mission_next_word', mood, { word_no: word, time }),
        };
      }
      return {
        key: 'round',
        ttl: 20000,
        text: line(view, 'round_start', mood, { round: round.number, time, losses: losingRun(view) }),
      };
    }
    case 'pause':
      return { key: 'round-state', ttl: 20000, text: line(view, 'pause', mood) };
    case 'resume':
      return round
        ? { key: 'round-state', ttl: 20000, text: line(view, 'resume', mood, { time: clock(round.remaining) }) }
        : null;
    case 'review': {
      const remaining = view.result?.confirmAt === undefined ? null : view.result.confirmAt - view.serverTime;
      if (remaining !== null && remaining <= 0) return null;
      const text = line(view, 'review', mood);
      return { key: 'round-state', ttl: remaining === null ? 20000 : Math.min(20000, remaining),
        text: remaining === null ? text : text + after(text, `Counts in ${Math.ceil(remaining / 1000)}s unless rejected.`) };
    }
    case 'finish':
      return finished(view, event.streakBefore);
    case 'reverse':
      return { key: 'result', ttl: 30000, text: view.result?.reason === 'baity-chaos'
        ? `My gift to chat was reversed. The streamer guessed correctly. Chat's streak is back to ${view.score.streak}.`
        : line(view, 'reversed', mood, { streak: view.score.streak }) };
    case 'wrong-guess':
      return round
        ? { key: 'guess', ttl: 20000, text: line(view, 'wrong_guess', mood, { bonus: round.wrongGuessBonus }) }
        : null;
    case 'award': {
      // An award can be chosen while the next word is already live.
      const award = view.history[0]?.award;
      return award ? { key: 'award', ttl: 60000, text: line(view, 'award', 0, { name: award.name }) } : null;
    }
    case 'skip-vote':
      return view.phase === 'active'
        ? {
            key: 'skip',
            ttl: 15000,
            text: line(view, 'skip_votes', mood, { voters: view.voters, threshold: view.voteThreshold }),
          }
        : null;
    case 'mission-timeout': {
      if (!view.mission) return null;
      const text = line(view, 'mission_timeout', mood, { completed: view.mission.completed });
      return { key: 'result', ttl: 30000, text: text + nextRound(view, text) };
    }
  }
}

/** Meta-hints only. Anything about the word itself would also reach the streamer. */
export function halfwayAnnouncement(view: GameView): Announcement | null {
  if (!view.round) return null;
  const baiters = view.participants ? `${count(view.participants, 'chatter')} baiting` : 'nobody is baiting yet';
  return {
    key: 'nudge',
    ttl: 8000,
    text: line(view, 'halfway', moodOf(losingRun(view)), { time: clock(view.round.remaining), baiters }),
  };
}

/** Three quarters in, only once chat has started losing. */
export function strugglingAnnouncement(view: GameView): Announcement | null {
  const mood = moodOf(losingRun(view));
  if (!view.round || mood === 0) return null;
  return { key: 'nudge', ttl: 8000, text: line(view, 'struggling', mood, { time: clock(view.round.remaining) }) };
}

export function finalAnnouncement(view: GameView): Announcement {
  return { key: 'nudge', ttl: 4000, text: line(view, 'final', moodOf(losingRun(view))) };
}

export function helpText(view: GameView) {
  return line(view, 'help', 0);
}

/** `!bait who`: Baity, legally Baeittrice. */
export function whoText(view: GameView) {
  return line(view, 'who', moodOf(losingRun(view)));
}

export function scoreText(view: GameView) {
  const { wins, played, streak, best } = view.score;
  return line(view, 'score', moodOf(losingRun(view)), { wins, played, streak, best });
}

export function streakText(view: GameView) {
  const { streak, best } = view.score;
  const next = nextStreakTier(streak);
  let text =
    streak === 0
      ? line(view, 'streak_none', moodOf(losingRun(view)), { best })
      : line(view, streak === 1 ? 'streak_one' : 'streak_run', 0, { streak, best });
  if (streak > 0 && next)
    text += after(text, line(view, 'streak_next_suffix', 0, { next_badge: next.name, next_count: next.count }));
  if (view.badges.length)
    text += after(text, line(view, 'badges_suffix', 0, { owned: view.badges.length, total: streakTiers.length }));
  return text;
}

/** `!bait top`: the bait MVP board, or the most rounds joined until the streamer picks someone. */
export function topText(view: GameView) {
  const mood = moodOf(losingRun(view));
  if (view.mvps.length) {
    const mvps = view.mvps
      .slice(0, 3)
      .map((mvp, i) => `${i + 1}. ${mvp.name} (${count(mvp.baits, 'pick')})`)
      .join(' · ');
    return line(view, 'mvps', mood, { mvps });
  }
  const top = view.leaders.slice(0, 3);
  if (!top.length) return line(view, 'top_empty', 0);
  const leaders = top.map((leader, i) => `${i + 1}. ${leader.name} (${count(leader.rounds, 'round')})`).join(' · ');
  return line(view, 'top', mood, { leaders });
}

/** A moderator command that could not run, with the game's own reason. */
export function modProblemText(view: GameView, name: string, problem: string) {
  return line(view, 'mod_problem', 0, { name, problem });
}
