export type Difficulty = 'easy' | 'medium' | 'hard';
export type SpeechProvider = 'moonshine' | 'deepgram';
export type Phase = 'idle' | 'active' | 'paused' | 'settling' | 'cooldown';
export type Outcome = 'caught' | 'escaped' | 'skipped' | 'ended' | 'overturned' | 'review';
export interface Settings {
  difficulty: Difficulty;
  duration: number;
  cooldown: number;
  auto: boolean;
  skipVotes: number;
  sound: boolean;
  mission: 'single' | 'three';
  missionDuration: number;
  callBait: boolean;
  /** The bot announces rounds in Twitch chat. Off until the streamer opts in. */
  chatBot: boolean;
  /** Moderators can type !bait start, !bait pause and !bait resume. */
  modCommands: boolean;
}
export interface Result {
  id: string;
  number: number;
  word: string;
  outcome: Outcome;
  elapsed: number;
  participants: number;
  at: number;
  /** The streamer's "You baited me" pick; `at` (when it was chosen) cues the OBS sting. */
  award?: { name: string; at?: number };
  reason?: 'guess' | 'timer';
  /** This win landed chat's streak on a badge tier. */
  milestone?: number;
  /** ...and unlocked that badge for the first time in this room. */
  newBadge?: boolean;
}
export type ResultView = Omit<Result, 'word'> & { word?: string };
export interface Leader {
  name: string;
  rounds: number;
  baits: number;
}
export interface HintCandidate {
  id: string;
  name: string;
  text: string;
  eligible: boolean;
  reason: string | null;
}
export interface AwardBoard {
  roundId: string;
  word: string;
  expiresAt: number;
  selectedHintId: string | null;
  candidates: HintCandidate[];
}
export interface MissionView {
  id: string;
  completed: number;
  total: 3;
  duration: number;
  remaining: number;
  endsAt: number | null;
  status: 'active' | 'complete' | 'failed' | 'escaped' | 'ended';
}
export interface GameView {
  id: string;
  mode: 'demo' | 'twitch';
  channel: string;
  phase: Phase;
  serverTime: number;
  round: {
    id: string;
    number: number;
    duration: number;
    remaining: number;
    endsAt: number | null;
    settleUntil: number | null;
    epoch: number;
    target?: string;
    forbiddenClues?: string[];
    /** The card's printed word colour and example question; sent only with `target`. */
    ink?: string;
    example?: string;
    difficulty: Difficulty;
    guessEnabled: boolean;
    guessUsed: boolean;
    wrongGuessBonus: number;
  } | null;
  // OBS reveals only caught/escaped results and never receives words in history.
  result: ResultView | null;
  history: ResultView[];
  settings: Settings;
  score: { wins: number; played: number; streak: number; best: number };
  participants: number;
  voters: number;
  voteThreshold: number;
  leaders: Leader[];
  /** Up to five chatters with the most streamer's picks, most first. */
  mvps: Leader[];
  /** Unlocked streak badges by tier count; `at` is null when reached before dates were kept. */
  badges: { count: number; at: number | null }[];
  connection: {
    status: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';
    detail: string;
  };
  mic: 'off' | 'connecting' | 'listening' | 'error';
  nextAt: number | null;
  mission: MissionView | null;
  violations: number;
}
export interface ChatBotPost {
  id: string;
  at: number;
  text: string;
  /** `preview`: a demo room, never sent to Twitch. `dropped`: Twitch accepted the request but held or refused the message. */
  status: 'sent' | 'preview' | 'dropped' | 'failed';
}
export interface ChatBotStatus {
  /** `demo` previews in the studio; `unconfigured` has no bot account on this server. */
  mode: 'demo' | 'unconfigured' | 'unauthorized' | 'twitch';
  /** Bot account display name once its owner has authorized it. */
  name: string | null;
  /** The broadcaster granted channel:bot, so the bot can post here with the Chat Bot badge. */
  channelAllowed: boolean;
  /** The latest delivery problem, if any. Cleared by the next successful message. */
  problem: string | null;
  recent: ChatBotPost[];
}
export interface Studio {
  room: GameView;
  viewerUrl: string;
  overlayUrl: string;
  speechReady: boolean;
  speechProvider: SpeechProvider;
  awardBoard: AwardBoard | null;
  chatBot: ChatBotStatus;
}
export interface SessionInfo {
  authenticated: boolean;
  twitchReady: boolean;
  demoAvailable: boolean;
  speechReady: boolean;
  user?: { name: string; mode: 'demo' | 'twitch' };
  csrf?: string;
}
export interface TranscriptWord {
  text: string;
  confidence: number;
  capturedAt: number;
  endedAt: number;
}
export interface Transcript {
  roundId: string;
  epoch: number;
  text: string;
  final: boolean;
  capturedAt: number;
  /** Capture-clock end of the complete provider segment, validated by its adapter. */
  endedAt?: number;
  confidence: number;
  id: string;
  words?: TranscriptWord[];
}
