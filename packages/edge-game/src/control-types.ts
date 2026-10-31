import type { GameView } from '../../app/shared/types.js';
import type { GameEvent } from '../../app/server/game.js';
import type { VoiceDraftRef } from '../../app/server/voice-draft.js';

/** Secrets are Worker bindings, never checked-in configuration values. */
export interface ControlEnv {
  ROOMS: DurableObjectNamespace;
  EDGE_PILOT_ENABLED?: string;
  EDGE_OPERATOR_KEY?: string;
  EDGE_OPERATOR_INITIAL_ENABLED?: string;
  EDGE_MAX_PARTICIPANTS?: string;
  EDGE_MAX_VIEWER_SOCKETS?: string;
  EDGE_PUBLIC_ORIGIN?: string;
  EDGE_CHANNEL_LOGIN_ALLOWLIST?: string;
  EDGE_MAX_CHANNELS?: string;
  EDGE_STUDIO_IDLE_MINUTES?: string;
  EDGE_PILOT_SECRET_B64?: string;
  EDGE_TOKEN_ENCRYPTION_KEY_B64?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  TWITCH_EVENTSUB_SECRET?: string;
  EDGE_BOT_USER_ID?: string;
  EDGE_BOT_OWNER_LOGIN?: string;
  /** Conservative global budget; clamps to at most 18 messages / 30 seconds. */
  EDGE_BOT_MESSAGES_PER_30_SECONDS?: string;
}
export interface TwitchUser { id: string; login: string; name: string }
export interface Credentials extends TwitchUser {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  validatedAt: number;
  scopes: string[];
}
export interface EncryptedValue { version: 1; iv: string; ciphertext: string }
export interface PendingOAuth {
  cookieHash: string;
  kind: 'broadcaster' | 'bot';
  expiresAt: number;
  initiatingSession?: string;
}
export interface ControlSession {
  channelId: string;
  csrf: string;
  expiresAt: number;
}
export interface RegisteredChannel extends TwitchUser {
  generation?: number;
  /** Monotonic connection projection, independent of provider-operation intents. */
  connectionRevision?: number;
  connectionConnected?: boolean;
  botGeneration?: number;
  credentials?: EncryptedValue;
  overlayKey: EncryptedValue;
  overlayKeyHash: string;
  scopes: string[];
  validatedAt: number;
  subscriptionId?: string;
  moderationSubscriptions?: Record<string, string>;
  subscriptionStatus: 'pending' | 'enabled' | 'failed' | 'revoked' | 'stopping' | 'offline';
  subscriptionRetryAt?: number;
  subscriptionAttempts?: number;
  subscriptionSecretHash?: string;
  resubscribeAfterDeletion?: boolean;
  chatWanted?: boolean;
  lastStudioAt?: number;
  pendingDeletion?: string[];
  deleteRetryAt?: number;
  deleteAttempts?: number;
  active: boolean;
}
export interface TwitchChatEvent {
  eventId: string;
  channelId: string;
  at: number;
  kind: 'message' | 'delete' | 'clear-user';
  messageId?: string;
  userId: string;
  name?: string;
  text?: string;
  badges?: string[];
}
export interface RoomAnnouncement {
  channelId: string;
  eventId: string;
  event: GameEvent | { type: 'chat-command'; command: 'help' | 'score' | 'top' | 'who'; userId: string } | { type: 'bot-settings' }
    | ({ type: 'voice-guess-draft'; word: string } & VoiceDraftRef);
  safeView: GameView;
}
export interface QueuedMessage {
  id: string;
  channelId: string;
  key: string;
  text: string;
  expiresAt: number;
  voiceDraft?: VoiceDraftRef;
}
export interface BotReceipt {
  id: string;
  channelId: string;
  at: number;
  status: 'sent' | 'dropped' | 'failed';
}
export interface InboxEntry { event: TwitchChatEvent; expiresAt: number; nextAt: number; attempts: number }
export interface ControlState {
  version: 1;
  operator?: { enabled: boolean; target: boolean; revision: number; updatedAt: number; reason: string; pendingRooms: string[]; retryAt?: number; attempts?: number };
  pending: Record<string, PendingOAuth>;
  sessions: Record<string, ControlSession>;
  channels: Record<string, RegisteredChannel>;
  bot?: { user: TwitchUser; credentials: EncryptedValue; validatedAt: number };
  appToken?: { value: EncryptedValue; expiresAt: number };
  dedupe: Record<string, number>;
  inbox: Record<string, InboxEntry>;
  queue: QueuedMessage[];
  sentAt: number[];
  channelSentAt: Record<string, number>;
  channelSentWindow?: Record<string, number[]>;
  commandCooldowns: Record<string, number>;
  pausedUntil: number;
  receipts: BotReceipt[];
  nextValidationAt: number;
}
export const DEFAULT_CHANNEL_LOGINS = ['komediruzecki7', 'lakeeko', 'yahwehwastaken'] as const;
export const CONTROL_LIMITS = {
  sessions: 100,
  pendingOAuth: 100,
  queue: 100,
  // 10 channels x 600 admitted chat events/minute x 10 minutes, plus clock margin.
  dedupe: 65_000,
  inbox: 256,
  sessionMs: 12 * 60 * 60 * 1000,
  oauthMs: 10 * 60 * 1000,
  webhookMs: 10 * 60 * 1000,
  capabilitySeconds: 300,
  validationMs: 60 * 60 * 1000,
  bodyBytes: 64 * 1024,
} as const;
