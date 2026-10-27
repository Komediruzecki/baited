import type { GameView } from '../shared/types.js';
import type { GameEvent } from './game.js';
import { nextStreakTier, streakMilestone, streakTiers } from '../extension/presentation.js';

/**
 * Everything the chat bot can say. Each function reads only the overlay projection,
 * the same public view OBS gets: no active target, no clues, and finished words only
 * for caught or escaped rounds. Streamers read their own chat, so the bot must never
 * know more than the stream shows.
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

function nextRound(view: GameView) {
  if (view.nextAt === null || view.phase !== 'cooldown') return '';
  const seconds = Math.max(1, Math.round((view.nextAt - view.serverTime) / 1000));
  if (view.mission?.status === 'active') return ` Next word in ${seconds}s.`;
  return view.settings.auto ? ` Next round in ${seconds}s.` : '';
}

function finished(view: GameView, streakBefore: number): Announcement | null {
  const result = view.result;
  if (!result) return null;
  const mission = view.mission;
  // The overlay projection keeps the word only for caught and escaped rounds.
  const word = result.word ? result.word.toUpperCase() : null;
  // Skips and endings break a streak too; a rejected catch leaves it alone.
  const ended =
    streakBefore > 1 && ['escaped', 'skipped', 'ended'].includes(result.outcome)
      ? ` That ends chat's ${streakBefore}-win streak.`
      : '';
  const text = (() => {
    switch (result.outcome) {
      case 'caught': {
        const streak = view.score.streak > 1 ? `, ${view.score.streak} in a row!` : '.';
        const progress = !mission
          ? ''
          : mission.status === 'complete'
            ? ' Mission complete: 3 of 3!'
            : ` Mission: ${mission.completed} of 3.`;
        return `🎣 Baited! The streamer said ${word ?? 'it'} after ${result.elapsed}s. Chat wins${streak}${progress}`;
      }
      case 'escaped':
        if (result.reason === 'guess')
          return `🧠 The streamer called the bait${word ? `: it was ${word}` : ''}. The streamer escapes${mission ? ' the mission' : ''}.${ended}`;
        return `⏰ Time! The streamer got away.${word ? ` The word was ${word}.` : ''}${
          mission && mission.status !== 'active' ? ` Mission over: ${mission.completed} of 3.` : ''
        }${ended}`;
      case 'skipped':
        return `⏭ Word skipped. New bait next.${ended}`;
      case 'ended':
        return `⏹ The streamer ended the round.${ended}`;
      case 'overturned':
        return "❌ Catch rejected. That one doesn't count.";
      case 'review':
        return null;
    }
  })();
  return text ? { key: 'result', ttl: 30000, text: text + nextRound(view) } : null;
}

/** A win that lands on a streak card's tier gets its own post, after the result. */
export function badgeAnnouncement(view: GameView): Announcement | null {
  const result = view.result;
  const tier = result?.outcome === 'caught' && result.milestone ? streakMilestone(result.milestone) : null;
  if (!tier) return null;
  const next = nextStreakTier(tier.count);
  const after = next ? ` Next card: ${next.name} at ${next.count}.` : ' That is the rarest card.';
  return {
    key: 'badge',
    ttl: 30000,
    text: result!.newBadge
      ? `🃏 New streak card: ${tier.name} edition! Chat won ${tier.count} in a row.${after}`
      : `🃏 ${tier.count} in a row: the ${tier.name} card again!${after}`,
  };
}

export function eventAnnouncement(view: GameView, event: GameEvent): Announcement | null {
  const round = view.round;
  switch (event.type) {
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
              ? `🎣 Three-word mission: chat has ${time} to land 3 words. Word 1 is in the baited panel. Make the streamer say it, never type it.`
              : `🎣 Word ${word} of 3 is live. ${time} left on the mission clock.`,
        };
      }
      return {
        key: 'round',
        ttl: 20000,
        text: `🎣 Round ${round.number} is live: ${time} on the clock. Chat's secret word is in the baited panel. Make the streamer say it, never type it.`,
      };
    }
    case 'pause':
      return { key: 'round-state', ttl: 20000, text: '⏸ Round paused. The clock is frozen.' };
    case 'resume':
      return round
        ? { key: 'round-state', ttl: 20000, text: `▶ Back on. ${clock(round.remaining)} left.` }
        : null;
    case 'review':
      return {
        key: 'round-state',
        ttl: 20000,
        text: '👂 Did they say it? The streamer is checking the catch.',
      };
    case 'finish':
      return finished(view, event.streakBefore);
    case 'reverse':
      return {
        key: 'result',
        ttl: 30000,
        text: `↩ The streamer reversed that win. Streak back to ${view.score.streak}.`,
      };
    case 'wrong-guess':
      return round
        ? {
            key: 'guess',
            ttl: 20000,
            text: `🎯 The streamer called the bait and guessed wrong. Chat gets +${round.wrongGuessBonus}s!`,
          }
        : null;
    case 'award': {
      // An award can be chosen while the next word is already live.
      const award = view.history[0]?.award;
      return award
        ? { key: 'award', ttl: 60000, text: `🏆 Streamer's pick: @${award.name} baited them.` }
        : null;
    }
    case 'skip-vote':
      return view.phase === 'active'
        ? {
            key: 'skip',
            ttl: 15000,
            text: `⏭ Skip votes: ${view.voters}/${view.voteThreshold}. Type !skip to vote for a new word.`,
          }
        : null;
    case 'mission-timeout':
      return view.mission
        ? {
            key: 'result',
            ttl: 30000,
            text: `⏰ Mission over: chat landed ${view.mission.completed} of 3 words.${nextRound(view)}`,
          }
        : null;
  }
}

/** Meta-hints only. Anything about the word itself would also reach the streamer. */
export function halfwayAnnouncement(view: GameView): Announcement | null {
  if (!view.round) return null;
  const who = view.participants
    ? `${count(view.participants, 'chatter')} baiting`
    : 'nobody is baiting yet';
  return {
    key: 'nudge',
    ttl: 8000,
    text: `⏳ Halfway: ${clock(view.round.remaining)} left and ${who}. The word is in the baited panel.`,
  };
}

export function finalAnnouncement(): Announcement {
  return { key: 'nudge', ttl: 4000, text: '🔥 10 seconds left. Make them say it!' };
}

export function helpText() {
  return 'baited: chat gets a secret word and tries to make the streamer say it out loud. Find it in the baited panel or card on this channel, and never type it here. !skip votes for a new word · !bait score · !bait streak · !bait top';
}

export function scoreText(view: GameView) {
  const { wins, played, streak, best } = view.score;
  return `Chat has ${count(wins, 'win')} in ${count(played, 'round')}. Streak ${streak}, best ${best}.`;
}

export function streakText(view: GameView) {
  const { streak, best } = view.score;
  const next = nextStreakTier(streak);
  const target = next ? ` Next card: ${next.name} at ${next.count} in a row.` : '';
  const badges = view.badges.length
    ? ` Streak cards: ${view.badges.length} of ${streakTiers.length}.`
    : '';
  if (streak === 0) return `No streak running. Best: ${best}. Win a round to start one.${badges}`;
  if (streak === 1) return `Chat won the last round. Best: ${best}.${target}${badges}`;
  return `🃏 Chat is on a ${streak}-win streak. Best: ${best}.${target}${badges}`;
}

export function topText(view: GameView) {
  const top = view.leaders.slice(0, 3);
  if (!top.length) return 'No baiters yet. Chat during a round to join in.';
  return `Top baiters: ${top
    .map(
      (leader, i) =>
        `${i + 1}. ${leader.name} (${count(leader.rounds, 'round')}${leader.baits ? `, ${count(leader.baits, 'pick')}` : ''})`,
    )
    .join(' · ')}`;
}
