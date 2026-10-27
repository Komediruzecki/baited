import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Store } from './store.js';
import type { Game, GameEvent } from './game.js';
import type { ChatBotPost, ChatBotStatus } from '../shared/types.js';
import { botKey, CHANNEL_BOT_SCOPE, type ChatMessage } from './twitch.js';
import {
  badgeAnnouncement,
  eventAnnouncement,
  finalAnnouncement,
  halfwayAnnouncement,
  helpText,
  MOD_COMMANDS,
  parseCommand,
  scoreText,
  streakText,
  topText,
  type Announcement,
  type ChatCommand,
} from './chat-copy.js';

/**
 * Twitch lets a bot that is not a moderator send 20 messages per 30 seconds across all
 * channels, and one per second in each channel. Going over silences it for an hour.
 * baited stays inside both, and also keeps each channel to a few posts per half minute.
 */
export const LIMITS = Object.freeze({
  globalCount: 18,
  globalWindow: 30000,
  channelCount: 6,
  channelWindow: 30000,
  channelGap: 1100,
  queue: 6,
  recent: 8,
  commandCooldown: 20000,
  forbiddenPause: 60000,
});
const MAX_LENGTH = 500;
const MODERATOR_BADGES = new Set(['broadcaster', 'moderator', 'lead_moderator']);
const ROUND_KEYS = ['skip', 'nudge', 'round-state', 'guess'];

interface Outgoing extends Announcement {
  id: string;
  expiresAt: number;
  replyTo?: string;
}
interface RoomState {
  queue: Outgoing[];
  sent: number[];
  lastAt: number;
  sending: boolean;
  pausedUntil: number;
  recent: ChatBotPost[];
  problem: string | null;
  nudges: { roundId: string; half: boolean; final: boolean };
  commandAt: Map<ChatCommand, number>;
}
const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number() });
const sendSchema = z.object({
  data: z
    .array(
      z.object({
        message_id: z.string(),
        is_sent: z.boolean(),
        drop_reason: z.object({ code: z.string(), message: z.string() }).nullable().optional(),
      }),
    )
    .min(1),
});

export interface ChatBotOptions {
  config: Pick<Config, 'clientId' | 'clientSecret' | 'botUserId' | 'botReady'>;
  store: Store;
  /** Why a live round cannot start or resume right now, or null when it can. */
  ready: (game: Game) => string | null;
  /** The studio feed changed: recent posts or a delivery problem. */
  onUpdate?: (game: Game) => void;
  fetcher?: typeof fetch;
  clock?: () => number;
}

export class ChatBot {
  private rooms = new Map<string, RoomState>();
  private globalSent: number[] = [];
  private globalPausedUntil = 0;
  private appToken: { value: string; expiresAt: number } | null = null;
  private appTokenRequest: Promise<string> | null = null;
  private grants = new Map<string, { sealed: string; allowed: boolean }>();
  private bot = { sealed: '', name: null as string | null };
  private fetcher: typeof fetch;
  private clock: () => number;
  constructor(private options: ChatBotOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.clock = options.clock ?? Date.now;
  }

  status(game: Game): ChatBotStatus {
    const room = this.rooms.get(game.data.id);
    return {
      mode: this.mode(game),
      name: this.botName(),
      channelAllowed: this.channelAllowed(game),
      problem: room?.problem ?? null,
      recent: room?.recent ?? [],
    };
  }

  /** Game events become announcements only when the streamer opted in and the bot may post. */
  event(game: Game, event: GameEvent) {
    if (!this.wants(game)) return;
    // A round that has ended or begun makes its skip tallies, nudges and state posts stale.
    if (['start', 'review', 'finish', 'mission-timeout'].includes(event.type))
      this.drop(game, ROUND_KEYS);
    const view = game.view('overlay');
    const announcement = eventAnnouncement(view, event);
    if (announcement) this.enqueue(game, announcement);
    const badge = event.type === 'finish' ? badgeAnnouncement(view) : null;
    if (badge) this.enqueue(game, badge);
  }

  /** Chat commands. Called for every accepted chat message, in any phase. */
  chat(game: Game, message: ChatMessage) {
    const command = parseCommand(message.text);
    if (!command || command === 'join') return;
    if (MOD_COMMANDS.has(command)) {
      if (!game.data.settings.modCommands) return;
      const moderator =
        message.userId === game.data.owner ||
        message.badges.some((badge) => MODERATOR_BADGES.has(badge));
      if (!moderator) return;
      const problem = this.control(game, command);
      if (problem) this.reply(game, message, `@${message.name} ${problem}`, `command:${command}`);
      return;
    }
    if (!this.wants(game)) return;
    // A burst of the same command gets one answer.
    const room = this.room(game.data.id),
      now = this.clock();
    if (now - (room.commandAt.get(command) ?? -Infinity) < LIMITS.commandCooldown) return;
    room.commandAt.set(command, now);
    const view = game.view('overlay');
    this.reply(
      game,
      message,
      command === 'help'
        ? helpText()
        : command === 'score'
          ? scoreText(view)
          : command === 'streak'
            ? streakText(view)
            : topText(view),
      `command:${command}`,
    );
  }

  /** Runs with the game ticker: timer nudges, then whatever the limits allow to go out. */
  tick(game: Game) {
    if (this.wants(game)) this.nudge(game);
    if (this.rooms.get(game.data.id)?.queue.length) this.drain(game);
  }

  forget(roomId: string) {
    this.rooms.delete(roomId);
  }

  private mode(game: Game): ChatBotStatus['mode'] {
    if (game.data.mode === 'demo') return 'demo';
    if (!this.options.config.botReady) return 'unconfigured';
    return this.botName() === null ? 'unauthorized' : 'twitch';
  }

  private botName() {
    const sealed = this.options.config.botReady
      ? (this.options.store.snapshot.vault[botKey(this.options.config.botUserId)] ?? '')
      : '';
    if (sealed !== this.bot.sealed) {
      let name: string | null = null;
      try {
        name = sealed
          ? (this.options.store.credentials(botKey(this.options.config.botUserId))?.name ?? null)
          : null;
      } catch {
        name = null;
      }
      this.bot = { sealed, name };
    }
    return this.bot.name;
  }

  private channelAllowed(game: Game) {
    if (game.data.mode === 'demo') return true;
    const owner = game.data.owner,
      sealed = this.options.store.snapshot.vault[owner] ?? '';
    const cached = this.grants.get(owner);
    if (cached?.sealed === sealed) return cached.allowed;
    let allowed = false;
    try {
      allowed = !!sealed && !!this.options.store.credentials(owner)?.scope.includes(CHANNEL_BOT_SCOPE);
    } catch {
      allowed = false;
    }
    this.grants.set(owner, { sealed, allowed });
    return allowed;
  }

  private wants(game: Game) {
    if (!game.data.settings.chatBot) return false;
    return game.data.mode === 'demo' || (this.mode(game) === 'twitch' && this.channelAllowed(game));
  }

  private room(id: string) {
    let room = this.rooms.get(id);
    if (!room) {
      room = {
        queue: [],
        sent: [],
        lastAt: -Infinity,
        sending: false,
        pausedUntil: 0,
        recent: [],
        problem: null,
        nudges: { roundId: '', half: false, final: false },
        commandAt: new Map(),
      };
      this.rooms.set(id, room);
    }
    return room;
  }

  private control(game: Game, command: ChatCommand): string | null {
    try {
      if (command === 'pause') return game.pauseIfActive() ? null : 'There is no live round to pause.';
      if (command === 'resume' && game.phase !== 'paused') return 'There is no paused round.';
      const reason = this.options.ready(game);
      if (reason) return reason;
      if (command === 'start') game.begin();
      else game.resume();
      return null;
    } catch (error) {
      return error instanceof Error && /^(No |Only |Finish |Let |Confirm )/.test(error.message)
        ? error.message
        : 'That did not work. Try it in the studio.';
    }
  }

  private reply(game: Game, message: ChatMessage, text: string, key: string) {
    if (this.wants(game)) this.enqueue(game, { key, text, ttl: 15000 }, message.id);
  }

  private nudge(game: Game) {
    if (game.phase !== 'active' || !game.round) return;
    const view = game.view('overlay'),
      round = view.round!;
    const room = this.room(game.data.id);
    if (room.nudges.roundId !== round.id) room.nudges = { roundId: round.id, half: false, final: false };
    if (!room.nudges.half && round.duration >= 60000 && round.remaining <= round.duration / 2) {
      room.nudges.half = true;
      const halfway = halfwayAnnouncement(view);
      if (halfway && round.remaining > 20000) this.enqueue(game, halfway);
    }
    if (!room.nudges.final && round.duration >= 30000 && round.remaining <= 10000) {
      room.nudges.final = true;
      if (round.remaining > 3000) this.enqueue(game, finalAnnouncement());
    }
  }

  private drop(game: Game, keys: string[]) {
    const room = this.rooms.get(game.data.id);
    if (room) room.queue = room.queue.filter((item) => !keys.includes(item.key));
  }

  private enqueue(game: Game, announcement: Announcement, replyTo?: string) {
    const room = this.room(game.data.id),
      now = this.clock();
    room.queue = room.queue.filter((item) => item.key !== announcement.key);
    room.queue.push({ ...announcement, id: randomUUID(), expiresAt: now + announcement.ttl, replyTo });
    if (room.queue.length > LIMITS.queue) room.queue.splice(0, room.queue.length - LIMITS.queue);
    this.drain(game);
  }

  private drain(game: Game) {
    const room = this.room(game.data.id),
      now = this.clock();
    room.queue = room.queue.filter((item) => item.expiresAt > now);
    if (!room.queue.length || room.sending || now < room.pausedUntil) return;
    if (now - room.lastAt < LIMITS.channelGap) return;
    room.sent = room.sent.filter((at) => now - at < LIMITS.channelWindow);
    if (room.sent.length >= LIMITS.channelCount) return;
    const preview = game.data.mode === 'demo';
    if (!preview) {
      this.globalSent = this.globalSent.filter((at) => now - at < LIMITS.globalWindow);
      if (now < this.globalPausedUntil || this.globalSent.length >= LIMITS.globalCount) return;
      this.globalSent.push(now);
    }
    const item = room.queue.shift()!;
    room.lastAt = now;
    room.sent.push(now);
    if (preview) {
      this.record(game, item, 'preview', null);
      return;
    }
    room.sending = true;
    void this.deliver(game, item).finally(() => {
      room.sending = false;
    });
  }

  private record(game: Game, item: Outgoing, status: ChatBotPost['status'], problem: string | null) {
    const room = this.room(game.data.id);
    room.recent = [
      { id: item.id, at: this.clock(), text: item.text.slice(0, MAX_LENGTH), status },
      ...room.recent,
    ].slice(0, LIMITS.recent);
    room.problem = problem;
    this.options.onUpdate?.(game);
  }

  private async deliver(game: Game, item: Outgoing) {
    const room = this.room(game.data.id);
    try {
      const response = await this.post(game.data.owner, item);
      if (response.status === 429) {
        // Ratelimit-Reset is a Unix time in seconds. Without it, wait out a full window.
        const reset = Number(response.headers.get('Ratelimit-Reset'));
        const wait = reset > 0 ? reset * 1000 - this.clock() : LIMITS.globalWindow;
        this.globalPausedUntil = this.clock() + Math.max(1000, Math.min(60000, wait));
        // Twitch did not take it. Try again later if it is still current.
        room.queue.unshift(item);
        room.problem = 'Twitch is rate limiting the bot. Messages resume shortly.';
        this.options.onUpdate?.(game);
        return;
      }
      if (response.status === 403) {
        room.pausedUntil = this.clock() + LIMITS.forbiddenPause;
        room.queue = [];
        this.record(
          game,
          item,
          'failed',
          'Twitch refused the bot here. Allow the bot in your chat again, and check that the bot account is not banned or timed out.',
        );
        return;
      }
      if (!response.ok) {
        this.record(game, item, 'failed', 'Twitch chat did not accept a bot message.');
        return;
      }
      const result = sendSchema.safeParse(await response.json().catch(() => null));
      if (!result.success) {
        this.record(game, item, 'failed', 'Twitch sent an unexpected reply to a bot message.');
        return;
      }
      const sent = result.data.data[0];
      if (sent.is_sent) this.record(game, item, 'sent', null);
      else
        this.record(
          game,
          item,
          'dropped',
          `Twitch held a bot message${sent.drop_reason ? `: ${sent.drop_reason.message.slice(0, 160)}` : '.'}`,
        );
    } catch {
      this.record(game, item, 'failed', 'Twitch chat is unreachable. The bot will keep trying.');
    }
  }

  private async post(channelId: string, item: Outgoing, retried = false): Promise<Response> {
    const token = await this.token(retried);
    const response = await this.fetcher('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: {
        'Client-Id': this.options.config.clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broadcaster_id: channelId,
        sender_id: this.options.config.botUserId,
        message: item.text.slice(0, MAX_LENGTH),
        ...(item.replyTo ? { reply_parent_message_id: item.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 && !retried) return this.post(channelId, item, true);
    return response;
  }

  /** An app access token is what earns the Chat Bot badge. It needs no user session. */
  private token(force: boolean): Promise<string> {
    if (!force && this.appToken && this.appToken.expiresAt - 60000 > this.clock())
      return Promise.resolve(this.appToken.value);
    this.appTokenRequest ??= (async () => {
      const response = await this.fetcher('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: this.options.config.clientId,
          client_secret: this.options.config.clientSecret,
          grant_type: 'client_credentials',
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Twitch app authorization failed.');
      const token = tokenSchema.parse(await response.json());
      this.appToken = { value: token.access_token, expiresAt: this.clock() + token.expires_in * 1000 };
      return token.access_token;
    })().finally(() => {
      this.appTokenRequest = null;
    });
    return this.appTokenRequest;
  }
}
