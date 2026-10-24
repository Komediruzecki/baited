export type Difficulty = 'easy' | 'medium' | 'hard';
export type Phase = 'idle' | 'active' | 'paused' | 'settling' | 'cooldown';
export type Outcome = 'caught' | 'escaped' | 'skipped' | 'ended' | 'overturned';
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
}
export interface Result {
  id: string;
  number: number;
  word: string;
  outcome: Outcome;
  elapsed: number;
  participants: number;
  at: number;
  award?: { name: string };
  reason?: 'guess' | 'timer';
}
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
    difficulty: Difficulty;
    guessEnabled: boolean;
    guessUsed: boolean;
    wrongGuessBonus: number;
  } | null;
  result: Result | null;
  history: Result[];
  settings: Settings;
  score: { wins: number; played: number; streak: number; best: number };
  participants: number;
  voters: number;
  voteThreshold: number;
  leaders: Leader[];
  connection: {
    status: 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';
    detail: string;
  };
  mic: 'off' | 'connecting' | 'listening' | 'error';
  nextAt: number | null;
  mission: MissionView | null;
  violations: number;
}
export interface Studio {
  room: GameView;
  viewerUrl: string;
  overlayUrl: string;
  speechReady: boolean;
  awardBoard: AwardBoard | null;
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
  confidence: number;
  id: string;
  words?: TranscriptWord[];
}
