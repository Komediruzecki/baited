import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  GameView,
  Result,
  Settings,
  Transcript,
  Outcome,
  Difficulty,
  MissionView,
  HintCandidate,
  AwardBoard,
} from '../shared/types.js';
import { words } from './words.js';
import { forbiddenClues } from './cards.js';

export const settingsSchema = z
  .object({
    difficulty: z.enum(['easy', 'medium', 'hard']),
    duration: z.number().int().min(30).max(600),
    cooldown: z.number().int().min(5).max(60),
    auto: z.boolean(),
    skipVotes: z.number().int().min(1).max(50),
    sound: z.boolean(),
    mission: z.enum(['single', 'three']).default('single'),
    missionDuration: z.number().int().min(60).max(900).default(180),
    callBait: z.boolean().default(false),
  })
  .strict();
export const defaults: Settings = {
  difficulty: 'medium',
  duration: 120,
  cooldown: 10,
  auto: false,
  skipVotes: 3,
  sound: false,
  mission: 'single',
  missionDuration: 180,
  callBait: false,
};
export const SPEECH_SETTLE_MS = 1500;
export const tokens = (s: string): string[] =>
  s
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
// These spellings name the same target. Keep speech, spoiler checks and private
// guesses consistent without treating synonyms or longer words as a catch.
const spellingGroups: readonly (readonly string[])[] = [
  ['donut', 'doughnut'],
  ['yogurt', 'yoghurt'],
  ['mustache', 'moustache'],
];
const spellings = (word: string): readonly string[] => {
  const lower = word.toLowerCase();
  return spellingGroups.find((group) => group.includes(lower)) ?? [lower];
};
export const matches = (text: string, word: string) => {
  const forms = spellings(word);
  return tokens(text).some((token) => forms.includes(token));
};
export const clueMatches = (text: string, clue: string) => {
  const variants = new Set(spellings(clue).flatMap((form) => [
    form,
    `${form}s`,
    `${form}es`,
    ...(form.endsWith('y') ? [`${form.slice(0, -1)}ies`] : []),
  ]));
  return tokens(text).some((token) => variants.has(token.replace(/['’]s$/, '')));
};
interface Hint extends HintCandidate {
  userId: string;
}
interface Mission extends Omit<MissionView, 'endsAt'> {
  endsAt: number;
}
interface Round {
  id: string;
  number: number;
  word: string;
  startedAt: number;
  segmentAt: number;
  endsAt: number;
  settleUntil: number | null;
  remaining: number;
  duration: number;
  epoch: number;
  participants: Map<string, string>;
  votes: Set<string>;
  seen: Set<string>;
  previousStreak: number;
  difficulty: Difficulty;
  clues: string[];
  guessEnabled: boolean;
  guessUsed: boolean;
  wrongGuessBonus: number;
  hints: Hint[];
  violations: number;
}
export interface SavedGame {
  id: string;
  owner: string;
  channel: string;
  mode: 'demo' | 'twitch';
  overlayKey: string;
  settings: Settings;
  history: Result[];
  priorWins: number;
  priorPlayed: number;
  priorBest: number;
  leaders: Record<string, { name: string; rounds: number; baits?: number }>;
}
export class Game {
  phase: GameView['phase'] = 'idle';
  round: Round | null = null;
  nextAt: number | null = null;
  result: Result | null = null;
  mic: GameView['mic'] = 'off';
  connection: GameView['connection'] = {
    status: 'offline',
    detail: 'Connect Twitch to read live chat',
  };
  streak = 0;
  mission: Mission | null = null;
  private review: {
    roundId: string;
    word: string;
    expiresAt: number;
    selectedHintId: string | null;
    candidates: Hint[];
  } | null = null;
  private awardOwners = new Map<string, string>();
  private recentChat = new Map<string, number>();
  private chatIds = new Set<string>();
  private skipUsed = false;
  onChange: () => void = () => {};
  canRun: () => boolean = () => true;
  constructor(
    public data: SavedGame,
    private clock = Date.now,
    private choose = (n: number) => randomInt(n),
  ) {
    data.settings = settingsSchema.parse(data.settings);
    // A restart never resumes an old live round or an old streak.
    if (data.mode === 'demo')
      this.connection = { status: 'offline', detail: 'Local demo · simulated chat only' };
  }
  get score() {
    const caught = this.data.history.filter((r) => r.outcome === 'caught').length;
    return {
      wins: this.data.priorWins + caught,
      played: this.data.priorPlayed + this.data.history.length,
      streak: this.streak,
      best: Math.max(this.data.priorBest, this.streak),
    };
  }
  update(settings: unknown) {
    this.data.settings = settingsSchema.parse(settings);
    this.changed();
  }
  get pendingCatch() {
    return this.phase === 'cooldown' && this.result?.outcome === 'review';
  }
  start() {
    this.tick();
    if (this.pendingCatch)
      throw new Error('Confirm or reject the catch before starting a new word.');
    if (['active', 'paused', 'settling'].includes(this.phase))
      throw new Error('Finish the current round first.');
    if (this.phase === 'cooldown' && this.nextAt !== null && this.clock() < this.nextAt)
      throw new Error('Let the cooldown finish first.');
    this.bestBeforeRound = this.data.priorBest;
    const pool = words[this.data.settings.difficulty].filter(
      (w) => !this.data.history.slice(0, 12).some((h) => h.word === w),
    );
    const now = this.clock();
    if (this.mission?.status !== 'active') {
      this.mission =
        this.data.settings.mission === 'three'
          ? {
              id: randomUUID(),
              completed: 0,
              total: 3,
              status: 'active',
              duration: this.data.settings.missionDuration * 1000,
              remaining: this.data.settings.missionDuration * 1000,
              endsAt: now + this.data.settings.missionDuration * 1000,
            }
          : null;
    }
    const duration =
      this.mission?.status === 'active'
        ? Math.max(0, this.mission.endsAt - now)
        : this.data.settings.duration * 1000;
    const word = pool[this.choose(pool.length)];
    this.round = {
      id: randomUUID(),
      number: this.score.played + 1,
      word,
      startedAt: now,
      segmentAt: now,
      endsAt: now + duration,
      settleUntil: null,
      remaining: duration,
      duration,
      epoch: 1,
      participants: new Map(),
      votes: new Set(),
      seen: new Set(),
      previousStreak: this.streak,
      difficulty: this.data.settings.difficulty,
      clues: forbiddenClues(word, this.data.settings.difficulty),
      guessEnabled: this.data.settings.callBait,
      guessUsed: false,
      wrongGuessBonus: 0,
      hints: [],
      violations: 0,
    };
    this.result = null;
    this.phase = 'active';
    this.nextAt = null;
    this.skipUsed = false;
    this.recentChat.clear();
    this.chatIds.clear();
    this.changed();
  }
  pause() {
    if (!this.pauseIfActive()) throw new Error('No live round to pause.');
  }
  pauseIfActive() {
    this.tick();
    if (this.phase !== 'active' || !this.round) return false;
    this.round.remaining = Math.max(0, this.round.endsAt - this.clock());
    if (this.mission?.status === 'active') this.mission.remaining = this.round.remaining;
    this.round.epoch++;
    this.phase = 'paused';
    this.changed();
    return true;
  }
  resume() {
    if (this.phase !== 'paused' || !this.round) throw new Error('No paused round.');
    this.round.endsAt = this.clock() + this.round.remaining;
    if (this.mission?.status === 'active') this.mission.endsAt = this.round.endsAt;
    this.round.segmentAt = this.clock();
    this.round.epoch++;
    this.phase = 'active';
    this.changed();
  }
  end(outcome: Outcome) {
    if (!this.endIfRunning(outcome)) throw new Error('No round is running.');
  }
  endIfRunning(outcome: Outcome) {
    this.tick();
    if (!this.round || !['active', 'paused', 'settling'].includes(this.phase)) return false;
    this.finish(outcome);
    return true;
  }
  private proposeCatch() {
    const r = this.round!;
    const now = this.clock();
    r.remaining = Math.max(0, r.endsAt - now);
    if (this.mission?.status === 'active') this.mission.remaining = r.remaining;
    this.result = {
      id: r.id,
      number: r.number,
      word: r.word,
      outcome: 'review',
      elapsed: Math.round((r.duration - r.remaining) / 1000),
      participants: r.participants.size,
      at: now,
    };
    // Stop first, then reveal. Pending catches never enter score/history or awards.
    this.phase = 'cooldown';
    this.nextAt = null;
    this.review = null;
    this.changed();
  }
  decideCatch(roundId: string, decision: 'confirm' | 'reject') {
    if (!this.pendingCatch || !this.round || this.result?.id !== roundId)
      throw new Error('Only the current pending catch can be confirmed or rejected.');
    this.finish(decision === 'confirm' ? 'caught' : 'overturned');
  }
  private finish(outcome: Outcome, reason?: Result['reason']) {
    if (!this.round) return;
    const r = this.round,
      now = this.clock();
    const wasPending = this.pendingCatch;
    // Reviewing a catch does not extend raw chat retention from the round's stop.
    const reviewExpiresAt = (wasPending ? this.result!.at : now) + 600000;
    const frozen = this.phase === 'paused' || wasPending;
    const remaining = frozen ? r.remaining : Math.max(0, r.endsAt - now);
    this.result = {
      id: r.id,
      number: r.number,
      word: r.word,
      outcome,
      elapsed: Math.round((r.duration - remaining) / 1000),
      participants: r.participants.size,
      at: now,
      ...(reason ? { reason } : {}),
    };
    if (this.mission?.status === 'active') {
      const mission = this.mission;
      mission.remaining = frozen ? mission.remaining : Math.max(0, mission.endsAt - now);
      if (wasPending) mission.endsAt = now + mission.remaining;
      if (outcome === 'caught') {
        mission.completed++;
        if (mission.completed === 3) mission.status = 'complete';
      } else if (outcome === 'escaped') mission.status = reason === 'guess' ? 'escaped' : 'failed';
      else if (outcome === 'ended') mission.status = 'ended';
    }
    this.review =
      outcome === 'caught' && now < reviewExpiresAt
        ? {
            roundId: r.id,
            word: r.word,
            expiresAt: reviewExpiresAt,
            selectedHintId: null,
            candidates: r.hints,
          }
        : null;
    r.hints = [];
    this.data.history.unshift(this.result);
    // Retain 100 outcomes while retaining aggregate scores for older rounds.
    if (this.data.history.length > 100) {
      const old = this.data.history.pop()!;
      this.awardOwners.delete(old.id);
      this.data.priorPlayed++;
      if (old.outcome === 'caught') this.data.priorWins++;
    }
    this.streak =
      outcome === 'caught' ? this.streak + 1 : outcome === 'overturned' ? r.previousStreak : 0;
    this.data.priorBest = Math.max(this.data.priorBest, this.streak);
    for (const [id, name] of r.participants) {
      const item = this.data.leaders[id] ?? { name, rounds: 0 };
      item.name = name;
      item.rounds++;
      this.data.leaders[id] = item;
    }
    // Bound retained participation data; leaderboards credit rounds joined, never causation.
    if (Object.keys(this.data.leaders).length > 1000)
      this.data.leaders = Object.fromEntries(
        Object.entries(this.data.leaders)
          .sort((a, b) => b[1].rounds - a[1].rounds || (b[1].baits ?? 0) - (a[1].baits ?? 0))
          .slice(0, 1000),
      );
    this.phase = 'cooldown';
    this.nextAt = now + this.data.settings.cooldown * 1000;
    this.changed();
  }
  reverse() {
    if (
      !['cooldown', 'idle'].includes(this.phase) ||
      this.result?.outcome !== 'caught' ||
      !this.round ||
      this.result.id !== this.round.id
    )
      throw new Error('Only the latest detection can be reversed before the next round.');
    this.result.outcome = 'overturned';
    const awarded = this.awardOwners.get(this.result.id);
    if (awarded && this.data.leaders[awarded])
      this.data.leaders[awarded].baits = Math.max(0, (this.data.leaders[awarded].baits ?? 0) - 1);
    this.awardOwners.delete(this.result.id);
    delete this.result.award;
    if (this.review?.roundId === this.result.id) this.review.selectedHintId = null;
    if (this.mission) {
      this.mission.completed = Math.max(0, this.mission.completed - 1);
      if (this.mission.status === 'complete') {
        this.mission.status = this.mission.remaining > 0 ? 'active' : 'failed';
        this.mission.endsAt = this.clock() + this.mission.remaining;
      }
      if (this.mission.status === 'active' && this.phase === 'idle')
        this.nextAt = this.clock() + this.data.settings.cooldown * 1000;
      if (this.nextAt !== null && this.mission.status === 'active') this.phase = 'cooldown';
    }
    this.streak = this.round.previousStreak;
    // The word has already been revealed. A fresh target is required next round.
    // Historical best is tracked before each round so an overturned win cannot inflate it.
    this.data.priorBest = Math.max(this.streak, this.bestBeforeRound);
    this.changed();
  }
  private bestBeforeRound = 0;
  begin() {
    this.start();
  }
  tick() {
    const now = this.clock();
    if (this.review && now >= this.review.expiresAt) {
      this.review = null;
      this.changed();
    }
    if (this.pendingCatch) {
      if (this.round?.hints.length && now >= this.result!.at + 600000) {
        this.round.hints = [];
        this.changed();
      }
      return;
    }
    if (this.phase === 'settling' && this.round) {
      if (now >= this.round.settleUntil!) this.finish('escaped', 'timer');
      return;
    }
    if (this.phase === 'active' && this.round && now >= this.round.endsAt) {
      if (this.mic === 'listening' && now < this.round.endsAt + SPEECH_SETTLE_MS) {
        this.round.settleUntil = this.round.endsAt + SPEECH_SETTLE_MS;
        this.phase = 'settling';
        this.changed();
      } else this.finish('escaped', 'timer');
      return;
    }
    if (
      this.mission?.status === 'active' &&
      this.phase !== 'paused' &&
      now >= this.mission.endsAt
    ) {
      this.mission.status = 'failed';
      this.mission.remaining = 0;
      this.phase = this.data.settings.auto ? 'cooldown' : 'idle';
      this.nextAt = this.data.settings.auto ? now + this.data.settings.cooldown * 1000 : null;
      this.changed();
      return;
    }
    if (this.phase === 'cooldown' && this.nextAt !== null && now >= this.nextAt) {
      this.phase = 'idle';
      this.nextAt = null;
      this.changed();
      if (
        (this.data.settings.auto || this.mission?.status === 'active') &&
        (this.data.mode === 'demo' || (this.connection.status === 'connected' && this.canRun()))
      )
        this.begin();
    }
  }
  guess(roundId: string, epoch: number, text: string) {
    this.tick();
    const r = this.round;
    if (this.phase !== 'active' || !r || r.id !== roundId || r.epoch !== epoch)
      throw new Error('Only the current live word can be guessed.');
    if (!r.guessEnabled) throw new Error('Call the bait is off for this word.');
    if (r.guessUsed) throw new Error('Only one guess is allowed per word.');
    const guess = tokens(text);
    if (guess.length !== 1 || guess[0].length > 40)
      throw new Error('Only one word can be submitted.');
    r.guessUsed = true;
    if (matches(guess[0], r.word)) {
      this.finish('escaped', 'guess');
      return { correct: true, bonus: 0 };
    }
    const bonus = 15000;
    r.endsAt += bonus;
    r.duration += bonus;
    r.remaining += bonus;
    r.wrongGuessBonus = bonus / 1000;
    if (this.mission?.status === 'active') {
      this.mission.endsAt += bonus;
      this.mission.duration += bonus;
      this.mission.remaining += bonus;
    }
    this.changed();
    return { correct: false, bonus: bonus / 1000 };
  }
  get awardBoard(): AwardBoard | null {
    const board = this.review;
    if (
      !board ||
      this.clock() >= board.expiresAt ||
      this.data.history[0]?.id !== board.roundId ||
      this.data.history[0].outcome !== 'caught'
    )
      return null;
    return { ...board, candidates: board.candidates.map(({ userId: unused, ...hint }) => hint) };
  }
  award(roundId: string, hintId: string) {
    this.tick();
    const board = this.review,
      result = this.data.history[0];
    if (!this.awardBoard || !board || board.roundId !== roundId || result?.id !== roundId)
      throw new Error('Only the latest community win can receive an award.');
    const hint = board.candidates.find((candidate) => candidate.id === hintId);
    if (!hint?.eligible) throw new Error('Only an eligible hint can receive the award.');
    const old = this.awardOwners.get(roundId);
    if (old !== hint.userId) {
      if (old && this.data.leaders[old])
        this.data.leaders[old].baits = Math.max(0, (this.data.leaders[old].baits ?? 0) - 1);
      const leader = this.data.leaders[hint.userId] ?? { name: hint.name, rounds: 1, baits: 0 };
      leader.baits = (leader.baits ?? 0) + 1;
      this.data.leaders[hint.userId] = leader;
      if (Object.keys(this.data.leaders).length > 1000)
        this.data.leaders = Object.fromEntries([
          [hint.userId, leader],
          ...Object.entries(this.data.leaders)
            .filter(([id]) => id !== hint.userId)
            .sort((a, b) => b[1].rounds - a[1].rounds || (b[1].baits ?? 0) - (a[1].baits ?? 0))
            .slice(0, 999),
        ]);
    }
    this.awardOwners.set(roundId, hint.userId);
    board.selectedHintId = hintId;
    result.award = { name: hint.name };
    this.changed();
  }
  private rememberHint(r: Round, userId: string, name: string, text: string) {
    if (text.trim().startsWith('!')) return;
    const blocked = r.clues.filter((clue) => clueMatches(text, clue));
    const reason = matches(text, r.word)
      ? 'Target word spoiled'
      : blocked.length
        ? `Forbidden clue: ${blocked.join(', ')}`
        : null;
    const eligible = reason === null;
    const same = r.hints.filter((hint) => hint.userId === userId && hint.eligible === eligible);
    if (same.length >= (eligible ? 3 : 1))
      r.hints = r.hints.filter((hint) => hint.id !== same[0].id);
    r.hints.push({
      id: randomUUID(),
      userId,
      name: name.slice(0, 40),
      text: text.slice(0, 500),
      eligible,
      reason,
    });
    const bucket = r.hints.filter((hint) => hint.eligible === eligible);
    if (bucket.length > (eligible ? 40 : 20))
      r.hints = r.hints.filter((hint) => hint.id !== bucket[0].id);
    if (reason) r.violations++;
  }
  transcript(t: Transcript, policy: 'automatic' | 'confirm' = 'automatic') {
    this.tick();
    const r = this.round,
      now = this.clock();
    if (
      !['active', 'settling'].includes(this.phase) ||
      !r ||
      t.roundId !== r.id ||
      t.epoch !== r.epoch ||
      !t.final ||
      r.seen.has(t.id)
    )
      return false;
    if (r.seen.size > 2000) r.seen.clear();
    r.seen.add(t.id);
    // Provider finals carry individual words. An unrelated uncertain word must neither
    // reject a clear target nor let an uncertain target inherit the sentence average.
    const candidates = t.words ?? [
      {
        text: t.text,
        confidence: t.confidence,
        capturedAt: t.capturedAt,
        endedAt: t.capturedAt,
      },
    ];
    const matched = candidates.some(
      (word) =>
        matches(word.text, r.word) &&
        Number.isFinite(word.confidence) &&
        word.confidence >= 0.8 &&
        Number.isFinite(word.capturedAt) &&
        Number.isFinite(word.endedAt) &&
        word.capturedAt >= r.segmentAt &&
        word.endedAt >= word.capturedAt &&
        word.endedAt < r.endsAt &&
        word.endedAt <= now + 1000 &&
        // A target early in a just-completed sentence is still fresh evidence.
        // Adapters validate this complete segment end against their capture clock.
        (t.endedAt === undefined
          ? now - word.endedAt <= 5000
          : Number.isFinite(t.endedAt) &&
            t.endedAt >= word.endedAt &&
            t.endedAt <= now + 1000 &&
            now - t.endedAt <= 5000),
    );
    if (!matched) return false;
    if (policy === 'confirm') this.proposeCatch();
    else this.finish('caught');
    return true;
  }
  chat(id: string, userId: string, name: string, text: string, at: number) {
    this.tick();
    const r = this.round,
      now = this.clock();
    if (
      this.phase !== 'active' ||
      !r ||
      userId === this.data.owner ||
      this.chatIds.has(id) ||
      at < r.segmentAt ||
      now - at > 15000 ||
      at > now + 2000
    )
      return false;
    if (this.chatIds.size > 10000) this.chatIds.clear();
    this.chatIds.add(id);
    if (now - (this.recentChat.get(userId) ?? -Infinity) < 3000) return false;
    if (!r.participants.has(userId) && r.participants.size >= 10000) return false;
    this.rememberHint(r, userId, name, text);
    // Explicit spoiler text earns no participation credit and is never echoed by BAIT.
    if (matches(text, r.word)) return false;
    this.recentChat.set(userId, now);
    r.participants.set(userId, name.slice(0, 40));
    if (text.trim().toLowerCase() === '!skip') r.votes.add(userId);
    if (r.votes.size >= this.data.settings.skipVotes && !this.skipUsed) {
      this.skipUsed = true;
      this.finish('skipped');
    } else this.changed();
    return true;
  }
  view(role: 'studio' | 'viewer' | 'overlay'): GameView {
    const r = this.round;
    let result: GameView['result'] = this.result;
    if (role === 'overlay' && result && !['caught', 'escaped'].includes(result.outcome)) {
      const { word: _word, ...privateResult } = result;
      result = privateResult;
    }
    return {
      id: this.data.id,
      mode: this.data.mode,
      channel: this.data.channel,
      phase: this.phase,
      serverTime: this.clock(),
      round: r
        ? {
            id: r.id,
            number: r.number,
            duration: r.duration,
            remaining:
              this.phase === 'active'
                ? Math.max(0, r.endsAt - this.clock())
                : this.phase === 'paused'
                  ? r.remaining
                  : 0,
            endsAt: ['active', 'settling'].includes(this.phase) ? r.endsAt : null,
            settleUntil: this.phase === 'settling' ? r.settleUntil : null,
            epoch: r.epoch,
            difficulty: r.difficulty,
            guessEnabled: r.guessEnabled,
            guessUsed: r.guessUsed,
            wrongGuessBonus: r.wrongGuessBonus,
            ...(role === 'viewer' && ['active', 'paused', 'settling'].includes(this.phase)
              ? { target: r.word, forbiddenClues: [...r.clues] }
              : {}),
          }
        : null,
      result,
      history: this.data.history.slice(0, 12).map((entry) => {
        if (role !== 'overlay') return entry;
        const { word: _word, ...publicHistory } = entry;
        return publicHistory;
      }),
      settings: this.data.settings,
      score: this.score,
      participants: r?.participants.size ?? 0,
      voters: r?.votes.size ?? 0,
      voteThreshold: this.data.settings.skipVotes,
      leaders: Object.values(this.data.leaders)
        .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name))
        .slice(0, 8)
        .map((leader) => ({ ...leader, baits: leader.baits ?? 0 })),
      mission: this.mission
        ? {
            ...this.mission,
            remaining:
              this.mission.status === 'active' && this.phase !== 'paused' && !this.pendingCatch
                ? Math.max(0, this.mission.endsAt - this.clock())
                : this.mission.remaining,
            endsAt:
              this.mission.status === 'active' && this.phase !== 'paused' && !this.pendingCatch
                ? this.mission.endsAt
                : null,
          }
        : null,
      violations: r?.violations ?? 0,
      connection: this.connection,
      mic: this.mic,
      nextAt: this.nextAt,
    };
  }
  private changed() {
    this.onChange();
  }
}
