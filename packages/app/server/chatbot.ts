import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Store } from './store.js';
import { spoils, type Game, type GameEvent } from './game.js';
import { targetForms } from '../shared/card-library.js';
import type { ChatBotPost, ChatBotStatus } from '../shared/types.js';
import { botKey, CHANNEL_BOT_SCOPE, type ChatMessage } from './twitch.js';
import { voiceDraftCurrent, voiceDraftText, voiceDraftWord, VOICE_DRAFT_TTL, type VoiceDraftRef, type VoiceDraftState } from './voice-draft.js';
import {
  badgeAnnouncement,
  BOT_REPLY_COOLDOWN_MS,
  eventAnnouncement,
  finalAnnouncement,
  halfwayAnnouncement,
  helpText,
  MOD_COMMANDS,
  modProblemText,
  parseCommand,
  scoreText,
  streakText,
  strugglingAnnouncement,
  topText,
  whoText,
  type Announcement,
  type ChatCommand,
} from './chat-copy.js';

/**
 * Twitch lets a bot that is not a moderator send 20 messages per 30 seconds across all
 * channels, and one per second in each channel. Going over silences it for an hour.
 * baited stays inside both, and also keeps each channel to a few posts per half minute.
 * Command replies wait behind announcements and take at most half of a channel's posts.
 * A channel that has had its fair share of the global budget leaves the last few slots to quieter
 * channels, so floods in some channels cannot hold back a round post in another.
 */
export const LIMITS = Object.freeze({
  globalCount: 18,
  globalWindow: 30000,
  channelCount: 6,
  channelWindow: 30000,
  channelGap: 1100,
  queue: 6,
  replyQueue: 3,
  channelReplyCount: 3,
  globalReserve: 3,
  recent: 8,
  commandCooldown: BOT_REPLY_COOLDOWN_MS,
  chatterCooldown: BOT_REPLY_COOLDOWN_MS,
  forbiddenPause: 60000,
});
const MAX_LENGTH = 500;
const MODERATOR_BADGES = new Set(['broadcaster', 'moderator', 'lead_moderator']);
const ROUND_KEYS = ['skip', 'nudge', 'round-state', 'guess'];

interface Outgoing extends Announcement {
  generation: number;
  id: string;
  expiresAt: number;
  replyTo?: string;
  voiceDraft?: VoiceDraftRef;
}
interface RoomState {
  generation: number;
  /** Announcements and results. They always go before command replies. */
  queue: Outgoing[];
  /** Command replies, in their own lane so they never push an announcement out. */
  replies: Outgoing[];
  /** Whether posts go to Twitch and count against the global budget (not a demo preview). */
  live: boolean;
  sent: number[];
  replySent: number[];
  lastAt: number;
  sending: boolean;
  pausedUntil: number;
  recent: ChatBotPost[];
  problem: string | null;
  nudges: { roundId: string; half: boolean; struggle: boolean; final: boolean };
  commandAt: Map<ChatCommand, number>;
  chatterAt: Map<string, number>;
  voiceDraft?: VoiceDraftState;
  voiceDraftAt?: number[];
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

  /** Only the authenticated Studio route calls this. It never submits a guess. */
  voiceGuessDraft(game: Game, roundId: string, epoch: number, text: string, draftId: string, expiresAt: number): {status:'requested'|'unavailable';reason?:string} {
    const word=voiceDraftWord(text),now=this.clock(),room=this.room(game.data.id);
    if(!Number.isSafeInteger(expiresAt) || expiresAt<=now || expiresAt>now+VOICE_DRAFT_TTL) throw new Error('That voice guess expired. Say it again.');
    if(game.phase!=='active' || game.round?.id!==roundId || game.round.epoch!==epoch || !game.round.guessEnabled || game.round.guessUsed)
      throw new Error('That round no longer accepts a voice guess.');
    if(!this.wants(game) || game.data.mode!=='demo' && game.connection.status!=='connected')
      return {status:'unavailable',reason:'Baity is unavailable. Your voice guess is still ready.'};
    if(room.voiceDraft?.roundId!==roundId) room.voiceDraft=undefined;
    if(room.voiceDraft?.ids.includes(draftId)) return {status:'requested'};
    room.voiceDraftAt=(room.voiceDraftAt??[]).filter(at=>at>now-60_000);
    if((room.voiceDraft?.ids.length??0)>=3 || room.voiceDraftAt.length>=6)
      return {status:'unavailable',reason:'Baity has shared enough guesses for now. You can still lock in.'};
    if(room.replies.filter(item=>!item.voiceDraft).length>=LIMITS.replyQueue)
      return {status:'unavailable',reason:'Baity is busy. Your voice guess is still ready.'};
    const ref={roundId,epoch,draftId,expiresAt};
    room.voiceDraft={roundId,ids:[...(room.voiceDraft?.ids??[]),draftId],latest:ref};room.voiceDraftAt.push(now);
    room.live=game.data.mode!=='demo';
    room.replies=room.replies.filter(item=>!item.voiceDraft);
    room.replies.push({key:'voice-guess-draft',text:voiceDraftText(game.data.channel,word),ttl:VOICE_DRAFT_TTL,
      generation:room.generation,id:randomUUID(),expiresAt:ref.expiresAt,voiceDraft:ref});
    this.drain(game);
    return {status:'requested'};
  }

  /** Game events become announcements only when the streamer opted in and the bot may post. */
  event(game: Game, event: GameEvent) {
    if (event.type === 'recording-reset') {
      const room = this.rooms.get(game.data.id);
      if (room) { room.generation++; room.queue = []; room.replies = []; }
      return;
    }
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
    // EventSub can deliver an old moderator start after the owner reset the take.
    if (game.data.settings.recordingMode && game.data.recordingTake &&
        message.at <= (game.data.recordingTake.startedAt ?? 0)) return;
    const command = parseCommand(message.text);
    if (!command || command === 'join') return;
    if (MOD_COMMANDS.has(command)) {
      if (!game.data.settings.modCommands) return;
      const moderator =
        message.userId === game.data.owner ||
        message.badges.some((badge) => MODERATOR_BADGES.has(badge));
      if (!moderator) return;
      const problem = this.control(game, command);
      if (problem)
        this.reply(game, message, modProblemText(game.view('overlay'), message.name, problem), `command:${command}`);
      return;
    }
    if (!this.wants(game)) return;
    // A burst of the same command gets one answer, and so does one chatter cycling commands.
    const room = this.room(game.data.id),
      now = this.clock();
    if (now - (room.commandAt.get(command) ?? -Infinity) < LIMITS.commandCooldown) return;
    if (now - (room.chatterAt.get(message.userId) ?? -Infinity) < LIMITS.chatterCooldown) return;
    room.commandAt.set(command, now);
    if (room.chatterAt.size >= 512)
      for (const [id, at] of room.chatterAt) if (now - at >= LIMITS.chatterCooldown) room.chatterAt.delete(id);
    room.chatterAt.set(message.userId, now);
    const view = game.view('overlay');
    this.reply(
      game,
      message,
      command === 'help'
        ? helpText(view)
        : command === 'score'
          ? scoreText(view)
          : command === 'streak'
            ? streakText(view)
            : command === 'who'
              ? whoText(view)
              : topText(view),
      `command:${command}`,
    );
  }

  /** Runs with the game ticker: timer nudges, then whatever the limits allow to go out. */
  tick(game: Game) {
    if (this.wants(game)) this.nudge(game);
    const room = this.rooms.get(game.data.id);
    if (room?.queue.length || room?.replies.length) this.drain(game);
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
        generation: 0,
        queue: [],
        replies: [],
        live: false,
        sent: [],
        replySent: [],
        lastAt: -Infinity,
        sending: false,
        pausedUntil: 0,
        recent: [],
        problem: null,
        nudges: { roundId: '', half: false, struggle: false, final: false },
        commandAt: new Map(),
        chatterAt: new Map(),
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
    if (this.wants(game)) this.enqueue(game, { key, text, ttl: 15000 }, message.id, true);
  }

  private nudge(game: Game) {
    if (game.phase !== 'active' || !game.round) return;
    const view = game.view('overlay'),
      round = view.round!;
    const room = this.room(game.data.id);
    if (room.nudges.roundId !== round.id)
      room.nudges = { roundId: round.id, half: false, struggle: false, final: false };
    if (!room.nudges.half && round.duration >= 60000 && round.remaining <= round.duration / 2) {
      room.nudges.half = true;
      const halfway = halfwayAnnouncement(view);
      if (halfway && round.remaining > 20000) this.enqueue(game, halfway);
    }
    // Three quarters in, once chat has started losing; never on top of the halfway or final post.
    if (!room.nudges.struggle && round.duration >= 90000 && round.remaining <= round.duration / 4) {
      room.nudges.struggle = true;
      const struggling = strugglingAnnouncement(view);
      if (struggling && round.remaining > 20000) this.enqueue(game, struggling);
    }
    if (!room.nudges.final && round.duration >= 30000 && round.remaining <= 10000) {
      room.nudges.final = true;
      if (round.remaining > 3000) this.enqueue(game, finalAnnouncement(view));
    }
  }

  private drop(game: Game, keys: string[]) {
    const room = this.rooms.get(game.data.id);
    if (room) room.queue = room.queue.filter((item) => !keys.includes(item.key));
  }

  private enqueue(game: Game, announcement: Announcement, replyTo?: string, reply = false) {
    const room = this.room(game.data.id),
      now = this.clock();
    room.live = game.data.mode !== 'demo';
    const lane = reply ? 'replies' : 'queue',
      limit = reply ? LIMITS.replyQueue : LIMITS.queue;
    room[lane] = room[lane].filter((item) => item.key !== announcement.key);
    room[lane].push({ ...announcement, generation: room.generation, id: randomUUID(), expiresAt: now + announcement.ttl, replyTo });
    if (room[lane].length > limit) room[lane].splice(0, room[lane].length - limit);
    this.drain(game);
  }

  private drain(game: Game) {
    const room = this.room(game.data.id),
      now = this.clock();
    // The streamer switched announcements off or took back channel:bot: nothing queued goes out.
    if (!this.wants(game)) {
      room.queue = [];
      room.replies = [];
      return;
    }
    // A custom target can be an ordinary word in Baity's copy. Recheck at
    // delivery, including posts queued before a different card was dealt.
    room.queue = room.queue.filter((item) => this.currentMessage(game,item));
    room.replies = room.replies.filter((item) => this.currentMessage(game,item));
    room.replies.sort((a,b)=>Number(!!a.voiceDraft)-Number(!!b.voiceDraft));
    if (!(room.queue.length || room.replies.length) || room.sending || now < room.pausedUntil) return;
    if (now - room.lastAt < LIMITS.channelGap) return;
    room.sent = room.sent.filter((at) => now - at < LIMITS.channelWindow);
    room.replySent = room.replySent.filter((at) => now - at < LIMITS.channelWindow);
    if (room.sent.length >= LIMITS.channelCount) return;
    // Announcements first. A reply goes only when none is waiting and replies have budget left.
    const reply = !room.queue.length;
    if (reply && room.replySent.length >= LIMITS.channelReplyCount) return;
    const preview = game.data.mode === 'demo';
    if (!preview) {
      this.globalSent = this.globalSent.filter((at) => now - at < LIMITS.globalWindow);
      if (now < this.globalPausedUntil || !this.fairShare(room, now)) return;
      this.globalSent.push(now);
    }
    const item = (reply ? room.replies : room.queue).shift()!;
    room.lastAt = now;
    room.sent.push(now);
    if (reply) room.replySent.push(now);
    if (preview) {
      this.record(game, item, 'preview', null);
      return;
    }
    room.sending = true;
    void this.deliver(game, item).finally(() => {
      room.sending = false;
    });
  }

  /**
   * Whether this channel may take a slot of the global budget now. Up to its fair share it may
   * take any free slot; past it, only while more than the reserve stays free for other channels.
   */
  private fairShare(room: RoomState, now: number) {
    const free = LIMITS.globalCount - this.globalSent.length;
    if (free <= 0) return false;
    let active = 0;
    for (const other of this.rooms.values())
      if (
        other === room ||
        (other.live &&
          (other.queue.length ||
            other.replies.length ||
            other.sent.some((at) => now - at < LIMITS.globalWindow)))
      )
        active++;
    const share = Math.max(1, Math.floor((LIMITS.globalCount - LIMITS.globalReserve) / active));
    return room.sent.length < share || free > LIMITS.globalReserve;
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
      const response = await this.post(game, item);
      if (!response || item.generation !== room.generation) return;
      if (response.status === 429) {
        // Ratelimit-Reset is a Unix time in seconds. Without it, wait out a full window.
        const reset = Number(response.headers.get('Ratelimit-Reset'));
        const wait = reset > 0 ? reset * 1000 - this.clock() : LIMITS.globalWindow;
        this.globalPausedUntil = this.clock() + Math.max(1000, Math.min(60000, wait));
        // Twitch did not take it. Try again later if it is still current.
        if(!item.voiceDraft) (item.key.startsWith('command:') ? room.replies : room.queue).unshift(item);
        room.problem = 'Twitch is rate limiting the bot. Messages resume shortly.';
        this.options.onUpdate?.(game);
        return;
      }
      if (response.status === 403) {
        room.pausedUntil = this.clock() + LIMITS.forbiddenPause;
        room.queue = [];
        room.replies = [];
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

  private revealsTarget(game: Game, text: string) {
    const round = game.round;
    return !!round && (['active', 'paused', 'settling'].includes(game.phase) || game.pendingCatch) &&
      targetForms(round.word, round.acceptedSpellings).some((word) => spoils(text, word));
  }

  private currentMessage(game:Game,item:Outgoing) {
    if(item.expiresAt<=this.clock()) return false;
    // A spoken, explicitly shared guess is allowed to equal the target. Nothing
    // else bypasses the normal no-spoilers filter, and we do not compare it here.
    return item.voiceDraft ? voiceDraftCurrent(game,this.room(game.data.id).voiceDraft,item.voiceDraft,this.clock()) &&
      (game.data.mode==='demo' || game.connection.status==='connected' && this.options.ready(game)===null) : !this.revealsTarget(game,item.text);
  }

  private async post(game: Game, item: Outgoing, retried = false): Promise<Response | null> {
    const token = await this.token(retried);
    // Token refresh may outlast a round or a permission change.
    if (item.generation !== this.room(game.data.id).generation || !this.wants(game) || !this.currentMessage(game,item)) return null;
    const response = await this.fetcher('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: {
        'Client-Id': this.options.config.clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broadcaster_id: game.data.owner,
        sender_id: this.options.config.botUserId,
        message: item.text.slice(0, MAX_LENGTH),
        ...(item.replyTo ? { reply_parent_message_id: item.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 && !retried && !item.voiceDraft) return this.post(game, item, true);
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
