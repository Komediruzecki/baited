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
} from '../app/shared/types.js';
import { words } from '../app/server/words.js';
import { forbiddenClues } from '../app/server/cards.js';
import { streakMilestone, streakTiers } from '../app/extension/presentation.js';
import catalogue from '../app/shared/card-review-catalogue.json';
import { matchesCustomTarget, targetForms } from '../app/shared/card-library.js';
import { CardLibraryError, type DeckCard } from './deck.js';

// Each card's printed ink and example question. Both identify the word, so they
// travel only beside a viewer's target.
const printed = new Map(catalogue.map((card) => [card.word, { ink: card.ink, example: card.example }]));

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
    chatBot: z.boolean().default(false),
    modCommands: z.boolean().default(false),
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
  // Fresh channels announce by default. The schema keeps legacy missing values off.
  chatBot: true,
  modCommands: false,
};
/** Moments the chat bot may announce. Listeners read public state from the overlay projection. */
export type GameEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'review' }
  | { type: 'finish'; streakBefore: number }
  | { type: 'reverse' }
  | { type: 'wrong-guess' }
  | { type: 'award' }
  | { type: 'skip-vote' }
  | { type: 'mission-timeout' };
export const SPEECH_SETTLE_MS = 1500;
/** Keep a detected catch reversible before the server confirms it automatically. */
export const CATCH_CONFIRM_MS = 15_000;
export const tokens = (s: string): string[] =>
  s
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? [];
// These spellings name the same target. Keep speech, spoiler checks and private
// guesses consistent without treating synonyms or longer words as a catch.
const spellings = (word: string): readonly string[] => targetForms(word);
export const matches = (text: string, word: string) => matchesCustomTarget(text, word);
// Chat disguises a word to slip it past the streamer: letters from other scripts that
// pass for Latin ones, and digits or symbols typed in place of a letter.
const lookalikes: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ӏ: 'l', ԛ: 'q', ԝ: 'w', ү: 'y',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  ı: 'i', ł: 'l', ø: 'o', đ: 'd', ɡ: 'g',
};
const standIns: Record<string, string> = {
  a: '4@', b: '8', e: '3', g: '69', i: '1!|', l: '1|', o: '0', s: '5$', t: '7+', z: '2',
};
// Accents, invisible characters and full-width or styled letters fold to plain ones.
const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\x00-\x7f]/g, (c) => lookalikes[c] ?? c);
const disguises = new Map<
  string,
  { whole: RegExp; spelled: RegExp; shortest: number; longest: number; step: number }
>();
function disguise(word: string) {
  let found = disguises.get(word);
  if (!found) {
    const forms = spellings(word).flatMap((form) => [
      form,
      `${form}s`,
      `${form}es`,
      ...(form.endsWith('y') ? [`${form.slice(0, -1)}ies`] : []),
    ]);
    // Every letter, stretched to any length, or what chat types in its place.
    const body = forms
      .map((form) => [...form].map((c) => `[${c}${standIns[c] ?? ''}]+`).join(''))
      .join('|');
    const lengths = forms.map((form) => form.length);
    found = {
      whole: new RegExp(`^[^\\p{L}\\p{N}]*(?:${body})(?:['’][s5$])?[^\\p{L}\\p{N}]*$`, 'u'),
      spelled: new RegExp(body, 'u'),
      shortest: Math.min(...lengths),
      // Every letter doubled, plus a possessive: the longest text worth testing.
      longest: 2 * Math.max(...lengths) + 4,
      step: Math.max(...lengths) + 2,
    };
    if (disguises.size > 2000) disguises.clear();
    disguises.set(word, found);
  }
  return found;
}
/**
 * Whether chat text gives a word away, however it is dressed up: any case or accent,
 * look-alike letters, digits or symbols for letters (pengu1n), stretched letters,
 * letters typed one at a time (p e n g u i n, p.e.n.g.u.i.n), the word split in two or
 * three (snow man), and plurals or possessives. A longer word that only contains it is
 * fine: "discord" does not spoil DISCO. Speech and the streamer's guess stay exact (matches).
 */
export function spoils(text: string, word: string) {
  const { whole, spelled, shortest, longest, step } = disguise(word);
  // Some stand-ins fit two letters (1 is i or l), so a long run of them could keep the
  // patterns backtracking. Runs of one character fold to two, and no test sees more than
  // `longest` characters.
  const pieces = fold(text)
    .replace(/(.)\1{2,}/gu, '$1$1')
    .split(/[^\p{L}\p{N}@$!|+'’]+/u)
    .filter(Boolean);
  let letters = '';
  for (const piece of [...pieces, '']) {
    if (piece.length === 1) letters += piece;
    else {
      // Windows overlap, so any spelled-out form lands whole inside one of them.
      for (let at = 0; letters.length >= shortest; at += step) {
        if (spelled.test(letters.slice(at, at + longest))) return true;
        if (at + longest >= letters.length) break;
      }
      letters = '';
    }
  }
  for (let i = 0; i < pieces.length; i++) {
    let joined = '';
    for (let j = i; j < pieces.length && j < i + 3; j++) {
      joined += pieces[j];
      if (joined.length > longest) break;
      if (joined.length >= shortest && whole.test(joined)) return true;
    }
  }
  return false;
}
interface Hint extends HintCandidate {
  userId: string;
  /** The chat message's ID, so a moderator's delete can find its hint. */
  messageId: string;
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
  acceptedSpellings: string[];
  cardId?: string;
  cardRevision?: number;
  artId?: string;
  printed: { ink?: string; example?: string };
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
  /** Private repeat history; never included in a Studio, viewer or OBS projection. */
  recentCardForms?: { roundId: string; forms: string[] }[];
  priorWins: number;
  priorPlayed: number;
  priorBest: number;
  leaders: Record<string, { name: string; rounds: number; baits?: number }>;
  /** First unlock of each streak badge, keyed by tier count, with the round that earned it. */
  streakBadges?: Record<string, { at: number; round: string }>;
}
type StoredLeader = SavedGame['leaders'][string];
// Streamer's picks outrank rounds played, so trimming a busy channel's records never
// drops a bait MVP in favour of someone who only chatted more.
const byPicks = (a: StoredLeader, b: StoredLeader) =>
  (b.baits ?? 0) - (a.baits ?? 0) || b.rounds - a.rounds;
/** Uniform secure selection without a Node crypto dependency. */
function secureIndex(size: number): number {
  if (!Number.isSafeInteger(size) || size < 1 || size > 0x100000000)
    throw new RangeError('Invalid selection size.');
  const limit = Math.floor(0x100000000 / size) * size;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % size;
}

const count = z.number().int().nonnegative();
const timestamp = z.number().finite();
const difficulty = z.enum(['easy', 'medium', 'hard']);
const resultSchema = z.object({
  id: z.string(), number: count, word: z.string(), artId: z.string().optional(),
  outcome: z.enum(['caught', 'escaped', 'skipped', 'ended', 'overturned', 'review']),
  elapsed: count, participants: count, at: timestamp, confirmAt: timestamp.optional(),
  award: z.object({ name: z.string(), at: timestamp.optional() }).strict().optional(),
  reason: z.enum(['guess', 'timer']).optional(), milestone: count.optional(), newBadge: z.boolean().optional(),
}).strict().refine((result) => result.confirmAt === undefined ||
  (result.outcome === 'review' && result.confirmAt > result.at && result.confirmAt === result.at + CATCH_CONFIRM_MS),
  'Only a pending catch can have its bounded confirmation deadline.');
const hintSchema = z.object({
  id: z.string(), userId: z.string(), messageId: z.string(), name: z.string().max(40),
  text: z.string().max(500), eligible: z.boolean(), reason: z.string().nullable(), at: timestamp,
}).strict();
const uniqueStrings = (maximum: number) => z.array(z.string()).max(maximum)
  .refine((items) => new Set(items).size === items.length, 'Duplicate set entry.');
const entries = <T extends z.ZodType>(value: T, maximum: number) =>
  z.array(z.tuple([z.string(), value])).max(maximum)
    .refine((items) => new Set(items.map(([key]) => key)).size === items.length, 'Duplicate map key.');
const hints = z.array(hintSchema).max(60)
  .refine((items) => new Set(items.map((hint) => hint.id)).size === items.length, 'Duplicate hint ID.');
const roundSchema = z.object({
  id: z.string(), number: count, word: z.string(), startedAt: timestamp, segmentAt: timestamp,
  endsAt: timestamp, settleUntil: timestamp.nullable(), remaining: count, duration: count,
  epoch: z.number().int().positive(), participants: entries(z.string().max(40), 10000),
  votes: uniqueStrings(10000), seen: uniqueStrings(2001), previousStreak: count, difficulty,
  clues: z.array(z.string()).max(4), acceptedSpellings: z.array(z.string()).max(3),
  cardId: z.string().optional(), cardRevision: z.number().int().positive().optional(), artId: z.string().optional(),
  printed: z.object({ ink: z.string().optional(), example: z.string().optional() }).strict(),
  guessEnabled: z.boolean(), guessUsed: z.boolean(), wrongGuessBonus: count, hints, violations: count,
}).strict();
const safeKey = z.string().refine((key) => !['__proto__', 'constructor', 'prototype'].includes(key));
const savedSchema = z.object({
  id: z.string(), owner: z.string(), channel: z.string(), mode: z.enum(['demo', 'twitch']),
  overlayKey: z.string(), settings: z.object({
    ...settingsSchema.shape,
    // SavedGame still accepts old settings. A versioned live checkpoint must be complete.
    mission: settingsSchema.shape.mission.removeDefault(),
    missionDuration: settingsSchema.shape.missionDuration.removeDefault(),
    callBait: settingsSchema.shape.callBait.removeDefault(),
    chatBot: settingsSchema.shape.chatBot.removeDefault(),
    modCommands: settingsSchema.shape.modCommands.removeDefault(),
  }).strict(), history: z.array(resultSchema).max(100),
  recentCardForms: z.array(z.object({ roundId: z.string(), forms: z.array(z.string()) }).strict()).max(12).optional(),
  priorWins: count, priorPlayed: count, priorBest: count,
  leaders: z.record(safeKey, z.object({ name: z.string(), rounds: count, baits: count.optional() }).strict())
    .refine((value) => Object.keys(value).length <= 1000),
  streakBadges: z.record(safeKey, z.object({ at: timestamp, round: z.string() }).strict()).optional(),
}).strict();
/** Private server state. Never send a checkpoint to a browser or a public cache. */
const checkpointSchema = z.object({
  version: z.literal(1), data: savedSchema,
  phase: z.enum(['idle', 'active', 'paused', 'settling', 'cooldown']), round: roundSchema.nullable(),
  result: resultSchema.nullable(), resultHistoryId: z.string().nullable(), nextAt: timestamp.nullable(),
  mic: z.enum(['off', 'connecting', 'listening', 'error']),
  connection: z.object({
    status: z.enum(['offline', 'connecting', 'connected', 'reconnecting', 'error']), detail: z.string(),
  }).strict(),
  streak: count,
  mission: z.object({
    id: z.string(), completed: count.max(3), total: z.literal(3), duration: count, remaining: count,
    endsAt: timestamp, status: z.enum(['active', 'complete', 'failed', 'escaped', 'ended']),
  }).strict().nullable(),
  review: z.object({
    roundId: z.string(), word: z.string(), expiresAt: timestamp, selectedHintId: z.string().nullable(), candidates: hints,
  }).strict().nullable(),
  awardOwners: entries(z.string(), 100), recentChat: entries(timestamp, 10000), chatIds: uniqueStrings(10001),
  skipUsed: z.boolean(), bestBeforeRound: count,
}).strict().superRefine((state, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const { round, result, phase, data, review } = state;
  if (new Set(data.history.map((entry) => entry.id)).size !== data.history.length) fail('Duplicate history ID.');
  if (['active', 'paused', 'settling', 'cooldown'].includes(phase) && !round) fail('Phase requires a round.');
  if (['active', 'paused', 'settling'].includes(phase) && result) fail('Live round cannot have a result.');
  if (phase === 'settling' && round?.settleUntil !== (round?.endsAt ?? 0) + SPEECH_SETTLE_MS)
    fail('Settling requires the speech grace deadline.');
  if (round && (round.segmentAt < round.startedAt || round.remaining > round.duration)) fail('Invalid round timing.');
  if (state.mission && ['active', 'paused', 'settling'].includes(phase) && state.mission.status === 'active' &&
      state.mission.endsAt !== round?.endsAt) fail('Live mission deadline differs from its round.');
  if (phase !== 'cooldown' && state.nextAt !== null) fail('Only cooldown can have a next deadline.');
  if (result && result.id !== round?.id) fail('Result does not match the current round.');
  if (phase === 'cooldown' && !result) fail('Cooldown requires a result.');
  if (result?.outcome === 'review' && state.nextAt !== null) fail('Pending catch cannot start the next round.');
  const linked = data.history.find((entry) => entry.id === state.resultHistoryId);
  if (state.resultHistoryId !== null) {
    if (!result || !linked || JSON.stringify(linked) !== JSON.stringify(result)) fail('Result history link is invalid.');
  } else if (result && (result.outcome !== 'review' || data.history.some((entry) => entry.id === result.id))) {
    fail('Completed result must retain its history link.');
  }
  if (review && (!data.history.some((entry) => entry.id === review.roundId && entry.word === review.word) ||
      (review.selectedHintId !== null && !review.candidates.some((hint) => hint.id === review.selectedHintId)))) {
    fail('Review reference is invalid.');
  }
  if (round && round.votes.some((id) => !round.participants.some(([userId]) => userId === id))) fail('Vote has no participant.');
  if (state.awardOwners.some(([id]) => !data.history.some((entry) => entry.id === id && entry.award))) fail('Award owner has no result award.');
});
export type GameCheckpoint = z.infer<typeof checkpointSchema>;

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
  onEvent: (event: GameEvent) => void = () => {};
  canRun: () => boolean = () => true;
  /** The server creates a stable capability; Game never publishes a raw asset ID. */
  artFor: (roundId: string, artId: string) => string | undefined = () => undefined;
  deckFor: (difficulty: Difficulty) => DeckCard[] = (difficulty) =>
    words[difficulty].map((target) => ({ target, difficulty, blockedClues: forbiddenClues(target, difficulty), acceptedSpellings: [] }));
  constructor(
    public data: SavedGame,
    private clock = Date.now,
    private choose = secureIndex,
    private uuid: () => string = () => crypto.randomUUID(),
  ) {
    data.settings = settingsSchema.parse(data.settings);
    // A restart never resumes an old live round or an old streak.
    if (data.mode === 'demo')
      this.connection = { status: 'offline', detail: 'Local demo · simulated chat only' };
  }
  /** A detached, versioned full-state snapshot; unlike SavedGame this resumes a live round. */
  checkpoint(): GameCheckpoint {
    const round = this.round;
    return structuredClone({
      version: 1,
      data: this.data,
      phase: this.phase,
      round: round ? {
        ...round, participants: [...round.participants], votes: [...round.votes], seen: [...round.seen],
      } : null,
      result: this.result,
      resultHistoryId: this.result && this.data.history.includes(this.result) ? this.result.id : null,
      nextAt: this.nextAt,
      mic: this.mic,
      connection: this.connection,
      streak: this.streak,
      mission: this.mission,
      review: this.review,
      awardOwners: [...this.awardOwners],
      recentChat: [...this.recentChat],
      chatIds: [...this.chatIds],
      skipUsed: this.skipUsed,
      bestBeforeRound: this.bestBeforeRound,
    });
  }
  /** Reject unknown/corrupt schemas. Runtime callbacks, decks and art resolvers must be rebound. */
  static restore(input: unknown, clock = Date.now, choose = secureIndex,
    uuid: () => string = () => crypto.randomUUID()): Game {
    // Zod intentionally ignores __proto__ record entries. A durable checkpoint
    // must reject corrupt keys rather than silently lose acknowledged state.
    const rawData = input && typeof input === 'object' ? (input as Record<string, unknown>).data : null;
    const rawLeaders = rawData && typeof rawData === 'object' ? (rawData as Record<string, unknown>).leaders : null;
    if (rawLeaders && typeof rawLeaders === 'object' &&
      Object.getOwnPropertyNames(rawLeaders).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
      throw new Error('Invalid checkpoint leader key.');
    }
    const state = checkpointSchema.parse(input);
    const game = new Game(state.data, clock, choose, uuid);
    game.phase = state.phase;
    game.round = state.round ? {
      ...state.round,
      participants: new Map(state.round.participants),
      votes: new Set(state.round.votes),
      seen: new Set(state.round.seen),
    } : null;
    // The result and history intentionally alias: reverse/award edit both in the live engine.
    game.result = state.resultHistoryId === null ? state.result
      : state.data.history.find((entry) => entry.id === state.resultHistoryId)!;
    // Older checkpoints predate automatic confirmation. Derive from detection,
    // never from restore time, so a restart cannot prolong the review window.
    if (game.result?.outcome === 'review') game.result.confirmAt ??= game.result.at + CATCH_CONFIRM_MS;
    game.nextAt = state.nextAt;
    game.mic = state.mic;
    game.connection = state.connection;
    game.streak = state.streak;
    game.mission = state.mission;
    game.review = state.review;
    game.awardOwners = new Map(state.awardOwners);
    game.recentChat = new Map(state.recentChat);
    game.chatIds = new Set(state.chatIds);
    game.skipUsed = state.skipUsed;
    game.bestBeforeRound = state.bestBeforeRound;
    return game;
  }
  /** Earliest rule deadline, including private review retention. No timer is installed. */
  nextDeadline(): number | null {
    const deadlines: number[] = [];
    if (this.review) deadlines.push(this.review.expiresAt);
    if (this.pendingCatch) {
      deadlines.push(this.result!.confirmAt ?? this.result!.at + CATCH_CONFIRM_MS);
      if (this.round?.hints.length) deadlines.push(this.result!.at + 600000);
    } else if (this.phase === 'settling' && this.round) {
      deadlines.push(this.round.settleUntil!);
    } else if (this.phase === 'active' && this.round) {
      deadlines.push(this.round.endsAt);
    } else if (this.phase !== 'paused') {
      if (this.mission?.status === 'active') deadlines.push(this.mission.endsAt);
      if (this.phase === 'cooldown' && this.nextAt !== null) deadlines.push(this.nextAt);
    }
    return deadlines.length ? Math.min(...deadlines) : null;
  }
  /**
   * Reconcile a late wake at each logical due time. Legacy tick() keeps its existing
   * wall-clock semantics; edge adapters call this before applying a command. On
   * limit exhaustion, discard this partially advanced candidate without committing it.
   */
  advanceTo(now: number, maxTransitions = 10000): void {
    if (!Number.isSafeInteger(maxTransitions) || maxTransitions < 1) throw new RangeError('Invalid transition limit.');
    if (!Number.isFinite(now)) throw new RangeError('Invalid reconciliation time.');
    const wallClock = this.clock;
    try {
      let transitions = 0;
      for (let due = this.nextDeadline(); due !== null && due <= now; due = this.nextDeadline()) {
        if (++transitions > maxTransitions) throw new RangeError('Too many overdue game transitions.');
        this.clock = () => due!;
        this.tick();
        const next = this.nextDeadline();
        if (next !== null && next <= due) throw new Error('Game deadline did not advance.');
      }
    } finally {
      this.clock = wallClock;
    }
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
    const deck = this.deckFor(this.data.settings.difficulty);
    if (!deck.length) throw new CardLibraryError(409, 'Choose a playable deck before starting.');
    const window = Math.min(12, Math.max(0, deck.length - 1));
    const pastForms = (entry: Result) =>
      this.data.recentCardForms?.find((record) => record.roundId === entry.id)?.forms ?? targetForms(entry.word);
    const recent = new Set(this.data.history.slice(0, window).flatMap(pastForms));
    const overlaps = (card: DeckCard, forms: Set<string>) =>
      targetForms(card.target, card.acceptedSpellings).some((form) => forms.has(form));
    const eligible = deck.filter((card) => !overlaps(card, recent));
    // Editing aliases can make several recent cards overlap a new pool. Relax
    // older exclusions first, keeping the last word out whenever possible.
    const latest = new Set(this.data.history[0] ? pastForms(this.data.history[0]) : []);
    const fallback = deck.filter((card) => !overlaps(card, latest));
    const pool = eligible.length ? eligible : fallback.length ? fallback : deck;
    const now = this.clock();
    if (this.mission?.status !== 'active') {
      this.mission =
        this.data.settings.mission === 'three'
          ? {
              id: this.uuid(),
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
    const card = pool[this.choose(pool.length)];
    const word = card.target;
    this.round = {
      id: this.uuid(),
      number: this.score.played + 1,
      word,
      ...(card.artId ? { artId: card.artId } : {}),
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
      clues: [...card.blockedClues],
      acceptedSpellings: [...card.acceptedSpellings],
      ...(card.cardId ? { cardId: card.cardId, cardRevision: card.revision } : {}),
      printed: card.cardId ? {} : { ...printed.get(word) },
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
    this.emit({ type: 'start' });
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
    this.emit({ type: 'pause' });
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
    this.emit({ type: 'resume' });
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
      ...(r.artId ? { artId: r.artId } : {}),
      outcome: 'review',
      elapsed: Math.round((r.duration - r.remaining) / 1000),
      participants: r.participants.size,
      at: now,
      confirmAt: now + CATCH_CONFIRM_MS,
    };
    // Stop first, then reveal. Pending catches never enter score/history or awards.
    this.phase = 'cooldown';
    this.nextAt = null;
    this.review = null;
    this.changed();
    this.emit({ type: 'review' });
  }
  decideCatch(roundId: string, decision: 'confirm' | 'reject') {
    // The shared Node adapter also enforces the deadline if its periodic tick
    // has not run yet; a late rejection must use the settled result's undo.
    this.tick();
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
      ...(r.artId ? { artId: r.artId } : {}),
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
    this.data.recentCardForms = [
      { roundId: r.id, forms: targetForms(r.word, r.acceptedSpellings) },
      ...(this.data.recentCardForms ?? []),
    ].slice(0, 12);
    // Retain 100 outcomes while retaining aggregate scores for older rounds.
    if (this.data.history.length > 100) {
      const old = this.data.history.pop()!;
      this.awardOwners.delete(old.id);
      this.data.priorPlayed++;
      if (old.outcome === 'caught') this.data.priorWins++;
    }
    const streakBefore = this.streak;
    this.streak =
      outcome === 'caught' ? this.streak + 1 : outcome === 'overturned' ? r.previousStreak : 0;
    // Landing on a tier is celebrated every time; the badge itself unlocks once.
    const tier = outcome === 'caught' ? streakMilestone(this.streak) : null;
    if (tier) {
      this.result.milestone = tier.count;
      const badges = (this.data.streakBadges ??= {});
      if (!badges[tier.count] && this.data.priorBest < tier.count) {
        badges[tier.count] = { at: now, round: r.id };
        this.result.newBadge = true;
      }
    }
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
          .sort((a, b) => byPicks(a[1], b[1]))
          .slice(0, 1000),
      );
    this.phase = 'cooldown';
    this.nextAt = now + this.data.settings.cooldown * 1000;
    this.changed();
    this.emit({ type: 'finish', streakBefore });
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
    this.takeBackAward(this.result);
    // A reversed win takes back the badge it unlocked.
    if (this.result.milestone) {
      const unlocked = this.data.streakBadges?.[this.result.milestone];
      if (this.result.newBadge && unlocked?.round === this.result.id)
        delete this.data.streakBadges![this.result.milestone];
      delete this.result.milestone;
      delete this.result.newBadge;
    }
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
    this.emit({ type: 'reverse' });
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
      if (now >= (this.result!.confirmAt ?? this.result!.at + CATCH_CONFIRM_MS)) this.finish('caught');
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
      this.emit({ type: 'mission-timeout' });
      return;
    }
    if (this.phase === 'cooldown' && this.nextAt !== null && now >= this.nextAt) {
      this.phase = 'idle';
      this.nextAt = null;
      this.changed();
      if (
        (this.data.settings.auto || this.mission?.status === 'active') &&
        (this.data.mode === 'demo' || (this.connection.status === 'connected' && this.canRun()))
      ) {
        // Editing a selected pack can remove a difficulty between rounds. Stop
        // safely and let Studio show the pack error instead of crashing the ticker.
        try { this.begin(); }
        catch (error) {
          if (!(error instanceof CardLibraryError)) throw error;
          this.phase = 'idle'; this.nextAt = null; this.changed();
        }
      }
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
    if (matchesCustomTarget(guess[0], r.word, r.acceptedSpellings)) {
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
    this.emit({ type: 'wrong-guess' });
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
    return {
      ...board,
      candidates: board.candidates.map(({ userId: _user, messageId: _message, ...hint }) => hint),
    };
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
            .sort((a, b) => byPicks(a[1], b[1]))
            .slice(0, 999),
        ]);
      // `at` cues the OBS sting, so only a new name gets one.
      result.award = { name: hint.name, at: this.clock() };
    }
    this.awardOwners.set(roundId, hint.userId);
    board.selectedHintId = hintId;
    this.changed();
    // Choosing another hint by the same chatter changes nothing public.
    if (old !== hint.userId) this.emit({ type: 'award' });
  }
  /** A moderator deleted this message. Its hint leaves the round and the review. */
  dropMessage(messageId: string, userId: string) {
    return this.dropHints((hint) => hint.messageId === messageId && hint.userId === userId);
  }
  /**
   * A moderator banned or timed out this chatter, which clears all their messages. Their
   * hints leave the round and the review, and an award one of them won goes too. Once a
   * review has closed after ten minutes, its award stays.
   */
  dropChatter(userId: string) {
    return this.dropHints((hint) => hint.userId === userId);
  }
  private dropHints(match: (hint: Hint) => boolean) {
    this.tick();
    let dropped = false;
    if (this.round?.hints.some(match)) {
      this.round.hints = this.round.hints.filter((hint) => !match(hint));
      dropped = true;
    }
    const board = this.review;
    if (board?.candidates.some(match)) {
      const picked = board.candidates.find((hint) => hint.id === board.selectedHintId);
      board.candidates = board.candidates.filter((hint) => !match(hint));
      // An award belongs to its hint, so it leaves with it.
      if (picked && match(picked)) {
        const result = this.data.history.find((entry) => entry.id === board.roundId);
        if (result) this.takeBackAward(result);
        board.selectedHintId = null;
      }
      dropped = true;
    }
    if (dropped) this.changed();
    return dropped;
  }
  private takeBackAward(result: Result) {
    const owner = this.awardOwners.get(result.id);
    if (owner && this.data.leaders[owner])
      this.data.leaders[owner].baits = Math.max(0, (this.data.leaders[owner].baits ?? 0) - 1);
    this.awardOwners.delete(result.id);
    delete result.award;
  }
  private rememberHint(
    r: Round,
    message: { id: string; userId: string; name: string; text: string; at: number },
    spoiled: boolean,
  ) {
    const { userId, name, text } = message;
    if (text.trim().startsWith('!')) return;
    const blocked = r.clues.filter((clue) => spoils(text, clue));
    const reason = spoiled
      ? 'Target word spoiled'
      : blocked.length
        ? `Forbidden clue: ${blocked.join(', ')}`
        : null;
    const eligible = reason === null;
    const same = r.hints.filter((hint) => hint.userId === userId && hint.eligible === eligible);
    if (same.length >= (eligible ? 3 : 1))
      r.hints = r.hints.filter((hint) => hint.id !== same[0].id);
    r.hints.push({
      id: this.uuid(),
      userId,
      name: name.slice(0, 40),
      text: text.slice(0, 500),
      eligible,
      reason,
      at: message.at,
      messageId: message.id,
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
        matchesCustomTarget(word.text, r.word, r.acceptedSpellings) &&
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
    if (!r.participants.has(userId) && r.participants.size >= 10000) return false;
    // A vote is counted once and sits outside the hint limit, so a hint and a !skip never block each other.
    if (text.trim().toLowerCase() === '!skip') {
      if (r.votes.has(userId)) return false;
      r.votes.add(userId);
      r.participants.set(userId, name.slice(0, 40));
      if (r.votes.size >= this.data.settings.skipVotes && !this.skipUsed) {
        this.skipUsed = true;
        this.finish('skipped');
      } else {
        this.changed();
        this.emit({ type: 'skip-vote' });
      }
      return true;
    }
    if (now - (this.recentChat.get(userId) ?? -Infinity) < 3000) return false;
    const spoiled = targetForms(r.word, r.acceptedSpellings).some((form) => spoils(text, form));
    this.rememberHint(r, { id, userId, name, text, at }, spoiled);
    // Spoiler text, however disguised, earns no participation credit and is never echoed by BAIT.
    if (spoiled) return false;
    this.recentChat.set(userId, now);
    r.participants.set(userId, name.slice(0, 40));
    this.changed();
    return true;
  }
  view(role: 'studio' | 'viewer' | 'overlay'): GameView {
    const r = this.round;
    let result: GameView['result'] = null;
    if (this.result) {
      const { artId, ...publicResult } = this.result;
      const artUrl = artId && ['caught', 'escaped'].includes(this.result.outcome)
        ? this.artFor(this.result.id, artId) : undefined;
      result = { ...publicResult, ...(artUrl ? { artUrl } : {}) };
    }
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
              ? { target: r.word, forbiddenClues: [...r.clues], ...r.printed,
                  ...(r.artId && this.artFor(r.id, r.artId) ? { artUrl: this.artFor(r.id, r.artId) } : {}) }
              : {}),
          }
        : null,
      result,
      history: this.data.history.slice(0, 12).map((entry) => {
        // History does not need artwork. Keep identifiers and capabilities out of
        // every role's history, including pending/rejected result snapshots.
        const { artId: _art, ...history } = entry;
        if (role !== 'overlay') return history;
        const { word: _word, ...publicHistory } = history;
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
      // Bait MVPs: the chatters the streamer picked most often as "You baited me".
      mvps: Object.values(this.data.leaders)
        .filter((leader) => (leader.baits ?? 0) > 0)
        .sort((a, b) => byPicks(a, b) || a.name.localeCompare(b.name))
        .slice(0, 5)
        .map((leader) => ({ ...leader, baits: leader.baits ?? 0 })),
      // Badges reached before unlocks were recorded count as unlocked, without a date.
      badges: streakTiers
        .filter((tier) => this.data.streakBadges?.[tier.count] || this.score.best >= tier.count)
        .map((tier) => ({ count: tier.count, at: this.data.streakBadges?.[tier.count]?.at ?? null })),
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
  private emit(event: GameEvent) {
    try {
      this.onEvent(event);
    } catch {
      /* Announcements are a side channel. The game has already moved on. */
    }
  }
}
