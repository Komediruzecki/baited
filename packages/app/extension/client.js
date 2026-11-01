import { cardArtPath, cardArtSource } from './presentation.js';

const VERSION = '0.0.1';
// Saturated built-in pilot projections are verified below this limit in the
// edge client tests. Private hints and the full leaderboard are never sent here.
export const EDGE_SNAPSHOT_MAX_BYTES = 64 * 1024;
const phases = new Set(['idle', 'active', 'paused', 'settling', 'cooldown']);
const outcomes = new Set(['caught', 'escaped', 'skipped', 'ended', 'overturned', 'review']);
const difficulties = new Set(['easy', 'medium', 'hard']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value) => typeof value === 'number' && Number.isFinite(value);
const string = (value, max = 120) => typeof value === 'string' && value.length > 0 && value.length <= max;
const count = (value) => Number.isSafeInteger(value) && value >= 0;

export function readRuntimeConfig(value) {
  if (!object(value) || !string(value.clientId, 128) || !/^[a-z0-9]+$/i.test(value.clientId)) {
    throw new Error('Extension configuration is missing.');
  }
  function origin(address) {
    const url = new URL(address);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Extension service address is invalid.');
    }
    return url.origin;
  }
  const apiBaseUrl = origin(value.apiBaseUrl);
  const studioBaseUrl = value.studioBaseUrl === undefined ? apiBaseUrl : origin(value.studioBaseUrl);
  if (value.transport !== undefined && value.transport !== 'edge') throw new Error('Extension transport is invalid.');
  return { clientId: value.clientId, apiBaseUrl, studioBaseUrl, ...(value.transport === 'edge' ? { transport: 'edge' } : {}) };
}

/** Resolve a round capability only against this build's validated backend origin. */
export function nativeCardArtSource(path) {
  if (!cardArtPath(path)) return null;
  try { return cardArtSource(path, readRuntimeConfig(window.BAITED_EXTENSION_CONFIG).apiBaseUrl); }
  catch { return null; }
}

// Copy only fields this display uses. Never insert server strings as HTML.
export function readState(value) {
  if (!object(value) || value.version !== VERSION || typeof value.configured !== 'boolean') throw new Error('Invalid state.');
  if (!value.configured && value.room === null) return { configured: false, room: null };
  const r = value.room;
  if (!value.configured || !object(r) || !phases.has(r.phase) || !number(r.serverTime) || !string(r.channel, 100)) throw new Error('Invalid room.');
  let round = null;
  if (r.round !== null) {
    const q = r.round;
    if (!object(q) || !string(q.id) || !Number.isSafeInteger(q.number) || q.number < 1 || !number(q.duration) || q.duration <= 0 || !number(q.remaining) || q.remaining < 0 || !(q.endsAt === null || number(q.endsAt))) throw new Error('Invalid round.');
    if (q.target !== undefined && !string(q.target)) throw new Error('Invalid target.');
    if (q.difficulty !== undefined && !difficulties.has(q.difficulty)) throw new Error('Invalid difficulty.');
    if (q.forbiddenClues !== undefined && (!Array.isArray(q.forbiddenClues) || q.forbiddenClues.length > 10 || q.forbiddenClues.some((x) => !string(x, 80)))) throw new Error('Invalid clues.');
    // The printed ink lands in a style property, so only a plain hex colour is accepted.
    if (q.ink !== undefined && !(typeof q.ink === 'string' && /^#[0-9a-f]{6}$/i.test(q.ink))) throw new Error('Invalid ink.');
    if (q.example !== undefined && !string(q.example, 160)) throw new Error('Invalid example.');
    if (q.artUrl !== undefined && !cardArtPath(q.artUrl)) throw new Error('Invalid artwork.');
    round = { id: q.id, number: q.number, duration: q.duration, remaining: q.remaining, endsAt: q.endsAt, difficulty: q.difficulty, target: q.target, forbiddenClues: q.forbiddenClues ?? [],
      ...(q.target !== undefined && q.ink ? { ink: q.ink } : {}), ...(q.target !== undefined && q.example ? { example: q.example } : {}),
      ...(q.target !== undefined && ['active', 'paused', 'settling'].includes(r.phase) && q.artUrl ? { artUrl: q.artUrl } : {}) };
  }
  let result = null;
  if (r.result !== null) {
    const resultValue = r.result;
    if (!object(resultValue) || !string(resultValue.id) || !string(resultValue.word) || !outcomes.has(resultValue.outcome)) throw new Error('Invalid result.');
    if (resultValue.confirmAt !== undefined && !(Number.isSafeInteger(resultValue.confirmAt) && resultValue.confirmAt > 0)) throw new Error('Invalid catch deadline.');
    if (resultValue.reason !== undefined && !['guess', 'timer', 'baity-chaos'].includes(resultValue.reason)) throw new Error('Invalid result.');
    if (resultValue.reason === 'baity-chaos' && !['caught', 'overturned'].includes(resultValue.outcome)) throw new Error('Invalid result.');
    // Stays self-contained for the LAN harness; screens ignore counts that are not a tier.
    if (resultValue.milestone !== undefined && !(count(resultValue.milestone) && resultValue.milestone >= 2)) throw new Error('Invalid result.');
    if (resultValue.newBadge !== undefined && typeof resultValue.newBadge !== 'boolean') throw new Error('Invalid result.');
    if (resultValue.artUrl !== undefined && !cardArtPath(resultValue.artUrl)) throw new Error('Invalid artwork.');
    // The streamer's pick carries a chatter's name, never their hint. Only a confirmed catch shows one.
    const award = resultValue.award;
    if (award !== undefined && !(object(award) && string(award.name, 40) && (award.at === undefined || number(award.at)))) throw new Error('Invalid result.');
    result = { id: resultValue.id, word: resultValue.word, outcome: resultValue.outcome, ...(resultValue.reason ? { reason: resultValue.reason } : {}),
      ...(resultValue.outcome === 'review' && resultValue.confirmAt !== undefined ? { confirmAt: resultValue.confirmAt } : {}),
      ...(resultValue.artUrl && ['caught', 'escaped'].includes(resultValue.outcome) ? { artUrl: resultValue.artUrl } : {}),
      ...(resultValue.milestone ? { milestone: resultValue.milestone, newBadge: resultValue.newBadge === true } : {}),
      ...(award && resultValue.outcome === 'caught' ? { award: { name: award.name, ...(award.at !== undefined ? { at: award.at } : {}) } } : {}) };
  }
  // Chat's streak is public. Older backends without a score read as no streak.
  let score = { streak: 0, best: 0 };
  if (r.score !== undefined) {
    if (!object(r.score) || !count(r.score.streak) || !count(r.score.best)) throw new Error('Invalid score.');
    score = { streak: r.score.streak, best: r.score.best };
  }
  // Bait MVPs are public too. Older backends without them read as none; the screens show three.
  let mvps = [];
  if (r.mvps !== undefined) {
    if (!Array.isArray(r.mvps) || r.mvps.length > 10 || r.mvps.some((mvp) => !object(mvp) || !string(mvp.name, 40) || !count(mvp.baits) || mvp.baits < 1)) throw new Error('Invalid MVPs.');
    mvps = r.mvps.slice(0, 3).map((mvp) => ({ name: mvp.name, baits: mvp.baits }));
  }
  return { configured: true, room: { phase: r.phase, channel: r.channel, serverTime: r.serverTime, round, result, score, mvps } };
}

export function readConfiguration(value, studioBaseUrl) {
  if (!object(value) || value.version !== VERSION || typeof value.connected !== 'boolean' || typeof value.channelId !== 'string' || !/^\d+$/.test(value.channelId) || !(value.channelName === null || string(value.channelName, 100))) throw new Error('Invalid configuration.');
  const studio = new URL(value.studioUrl);
  if (studio.origin !== studioBaseUrl || studio.username || studio.password || studio.search || studio.hash || studio.pathname !== '/studio') throw new Error('Invalid studio address.');
  return { connected: value.connected, channelId: value.channelId, channelName: value.channelName, studioUrl: studio.href };
}

export function clockValue(room, receivedAt, now = Date.now()) {
  if (!room?.round) return { milliseconds: 0, fraction: 0, label: '0:00' };
  const round = room.round;
  const elapsed = Math.max(0, now - receivedAt);
  const remaining = room.phase === 'active' && round.endsAt !== null
    ? Math.max(0, Math.min(round.remaining, round.endsAt - room.serverTime) - elapsed)
    : Math.max(0, round.remaining);
  const seconds = Math.ceil(remaining / 1000);
  return { milliseconds: remaining, fraction: Math.min(1, remaining / round.duration), label: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` };
}

/** Token lives only in this closure. A refreshed authorization invalidates in-flight responses. */
export function createExtensionClient({ config, path, parse, onData, onStatus, fetchImpl = globalThis.fetch, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let authorization = null;
  let generation = 0;
  let visible = true;
  let stopped = false;
  let timer = null;
  let request = null;
  let repeatImmediately = false;
  let delay = 1000;
  let needsAuthorization = false;

  function clearScheduled() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function schedule(milliseconds) {
    clearScheduled();
    if (stopped || !visible || !authorization || needsAuthorization) return;
    timer = setTimer(() => { timer = null; void poll(); }, milliseconds);
  }
  function report(kind, message) { onStatus({ kind, message }); }
  async function poll() {
    if (stopped || !visible || !authorization || needsAuthorization || request) return;
    clearScheduled();
    const current = generation;
    const controller = new AbortController();
    request = controller;
    const deadline = setTimer(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
        headers: { Authorization: `Bearer ${authorization.token}`, Accept: 'application/json' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (current !== generation || stopped || !visible) return;
      if (response.status === 401) {
        needsAuthorization = true;
        report('authorization', 'Twitch authorization expired. Waiting for it to refresh.');
        return;
      }
      if (response.status === 403) {
        needsAuthorization = true;
        report('forbidden', path.endsWith('/config') ? 'Open setup from the broadcaster’s Extension dashboard.' : 'This panel cannot connect from this page. Reload it on the channel.');
        return;
      }
      if (!response.ok) throw new Error(response.status === 503 ? 'service' : response.status === 429 ? 'rate' : 'request');
      const text = await response.text();
      if (text.length > 65536) throw new Error('response');
      const data = parse(JSON.parse(text));
      if (current !== generation || stopped || !visible) return;
      delay = 1000;
      onData(data);
      report('connected', 'Connected');
    } catch (error) {
      if (current !== generation || stopped || !visible) return;
      delay = Math.min(15000, Math.max(2000, delay * 2));
      report('reconnecting', error instanceof Error && error.message === 'service' ? 'The game service is not ready. Retrying…' : 'Connection interrupted. Retrying…');
    } finally {
      clearTimer(deadline);
      if (request === controller) request = null;
      if (repeatImmediately) {
        repeatImmediately = false;
        schedule(0);
      } else schedule(delay);
    }
  }
  function refresh() {
    if (stopped || !visible || !authorization) return;
    needsAuthorization = false;
    clearScheduled();
    if (request) { repeatImmediately = true; request.abort(); return; }
    void poll();
  }
  function invalidate() {
    generation += 1;
    authorization = null;
    clearScheduled();
    request?.abort();
  }
  return {
    authorize(value) {
      if (stopped) return;
      generation += 1;
      clearScheduled();
      if (!object(value) || value.clientId !== config.clientId || typeof value.channelId !== 'string' || !/^\d+$/.test(value.channelId) || !string(value.token, 8192)) {
        authorization = null;
        request?.abort();
        report('invalid', 'This Extension is configured for a different Twitch application.');
        return;
      }
      authorization = { token: value.token };
      needsAuthorization = false;
      delay = 1000;
      report('connecting', 'Connecting to the round…');
      refresh();
    },
    refresh,
    invalidate,
    setVisible(value) {
      const next = Boolean(value);
      if (next === visible || stopped) return;
      visible = next;
      generation += 1;
      clearScheduled();
      if (!visible) { request?.abort(); return; }
      refresh();
    },
    destroy() {
      stopped = true;
      authorization = null;
      generation += 1;
      clearScheduled();
      request?.abort();
    },
  };
}

/** Edge pilot: retain the room connection across brief tab switches, never poll. */
export function createEdgeExtensionClient({ config, path, parse, onData, onStatus,
  WebSocketImpl = globalThis.WebSocket, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now, random = Math.random }) {
  let authorization = null, socket = null, timer = null, deadline = null, hiddenTimer = null, lastView = null;
  let stopped = false, visible = true, generation = 0, retries = 0, lastRevision = -1, roomGeneration = -1;
  let connectedOnce = false, retryUntil = 0;
  const report = (kind, message) => onStatus({ kind, message });
  const clearScheduled = () => {
    if (timer !== null) clearTimer(timer);
    if (deadline !== null) clearTimer(deadline);
    timer = deadline = null;
  };
  const close = () => {
    const old = socket; socket = null;
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(1000, 'Panel closed.'); }
  };
  const clearHidden = () => { if (hiddenTimer !== null) clearTimer(hiddenTimer); hiddenTimer = null; };
  const connect = () => {
    clearScheduled();
    close();
    if (stopped || !visible || !authorization) return;
    const activeGeneration = generation;
    const url = new URL(`/v1/rooms/${authorization.channelId}/socket`, config.apiBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const current = new WebSocketImpl(url.href, ['baited.v1', `baited.auth.${authorization.token}`]);
    socket = current;
    const valid = () => !stopped && current === socket && activeGeneration === generation;
    deadline = setTimer(() => { if (valid()) current.close(4000, 'Connection timed out.'); }, 10000);
    current.onmessage = (event) => {
      if (!valid()) return;
      try {
        if (typeof event.data !== 'string' || event.data.length > EDGE_SNAPSHOT_MAX_BYTES ||
          new TextEncoder().encode(event.data).byteLength > EDGE_SNAPSHOT_MAX_BYTES) throw new Error('Invalid frame');
        const frame = JSON.parse(event.data);
        if (frame.type !== 'snapshot' || frame.protocol !== 1 || !count(frame.revision) || !count(frame.generation)) throw new Error('Invalid snapshot');
        if (roomGeneration === frame.generation && frame.revision < lastRevision) return;
        const value = path.endsWith('/config')
          ? { version: VERSION, connected: !!frame.room && frame.room.connection?.status === 'connected',
              channelId: authorization.channelId, channelName: frame.room?.channel ?? null,
              studioUrl: `${config.studioBaseUrl ?? config.apiBaseUrl}/studio` }
          : { version: VERSION, configured: frame.room !== null, room: frame.room };
        const parsed = parse(value);
        connectedOnce = true; retryUntil = 0; lastView = parsed;
        lastRevision = frame.revision; roomGeneration = frame.generation;
        retries = 0;
        if (deadline !== null) clearTimer(deadline);
        deadline = null;
        if (visible) { onData(parsed); report('connected', 'Connected'); }
      } catch {
        // Keep neither an old secret nor an unvalidated partial snapshot on screen.
        report('invalid', 'The round could not be read. Reload the panel on Twitch.');
        lastView = null; clearScheduled(); close();
      }
    };
    current.onerror = () => { if (valid() && visible) report('reconnecting', 'Connection interrupted. Retrying…'); };
    current.onclose = (event) => {
      if (!valid()) return;
      socket = null;
      lastView = null;
      clearScheduled();
      if (event.code === 1008 || event.code === 4001) {
        connectedOnce = false; retryUntil = 0;
        report('authorization', 'Twitch authorization expired. Waiting for it to refresh.');
        return;
      }
      if (event.code === 4408 || event.code === 4429) {
        connectedOnce = false; retryUntil = 0;
        report('unavailable', 'This pilot is full or busy. Try again later.');
        return;
      }
      if (!visible) return;
      // Browsers hide a refused upgrade's HTTP status (including a full pilot's
      // 429). New viewers wait for manual retry; admitted viewers get a bounded
      // recovery window after losing a previously healthy connection.
      if (!connectedOnce) {
        report('unavailable', 'This pilot may be full or temporarily unavailable. Try again later.');
        return;
      }
      if (!retryUntil) retryUntil = now() + 300000;
      const cap = Math.min(60000, 1000 * 2 ** Math.min(retries++, 6));
      const delay = Math.round(cap * (0.5 + 0.5 * random()));
      if (now() + delay > retryUntil) {
        report('unavailable', 'The round is still unavailable. Try again when your connection returns.');
        return;
      }
      report('reconnecting', 'Connection interrupted. Retrying…');
      timer = setTimer(connect, delay);
    };
  };
  return {
    authorize(value) {
      const previous = authorization;
      generation += 1; clearScheduled(); clearHidden(); close(); lastView = null;
      if (stopped) return;
      if (!object(value) || value.clientId !== config.clientId || typeof value.channelId !== 'string' || !/^[1-9][0-9]{0,24}$/.test(value.channelId) ||
        !string(value.token, 4096) || !/^[A-Za-z0-9_.-]+$/.test(value.token)) {
        authorization = null; connectedOnce = false; retryUntil = 0;
        report('invalid', 'This Extension is configured for a different Twitch application.');
        return;
      }
      // This is a UI hint only; the server independently verifies the JWT and
      // rejects anonymous seats. Logged-in opaque U identities need no sharing.
      let identityHint = null;
      try {
        const payload = JSON.parse(atob(value.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (object(payload) && typeof payload.opaque_user_id === 'string' && payload.opaque_user_id.startsWith('A')) {
          authorization = null; connectedOnce = false;
          report('signin', 'Sign in to Twitch to join this pilot. You do not need to share your identity.');
          return;
        }
        if (object(payload) && typeof payload.opaque_user_id === 'string' && typeof payload.role === 'string')
          identityHint = JSON.stringify([payload.opaque_user_id, payload.role, payload.user_id ?? null]);
      } catch { /* Malformed claims are handled by the server, never trusted here. */ }
      const sameIdentity = previous?.channelId === value.channelId &&
        (previous.token === value.token || identityHint !== null && previous.identityHint === identityHint);
      authorization = { token: value.token, channelId: value.channelId, identityHint };
      // Refreshing Twitch's token does not turn an admitted viewer into a first
      // join. Keep its existing recovery deadline; changing users/channels does.
      if (!sameIdentity) { retries = 0; retryUntil = 0; connectedOnce = false; }
      lastRevision = roomGeneration = -1;
      report('connecting', 'Connecting to the round…');
      connect();
    },
    refresh() { if (!stopped) { retries = 0; retryUntil = 0; connect(); } },
    invalidate() { generation += 1; authorization = null; connectedOnce = false; retryUntil = 0; lastView = null; clearScheduled(); clearHidden(); close(); },
    setVisible(value) {
      if (visible === Boolean(value) || stopped) return;
      visible = Boolean(value); clearHidden();
      if (visible) {
        if (socket?.readyState === 1 && lastView) { onData(lastView); report('connected', 'Connected'); }
        else if (!socket) { report('connecting', 'Connecting to the round…'); connect(); }
      } else {
        // Keep the connection and validate/cache updates while the UI is hidden.
        // Brief tab switches must not consume another viewer admission slot.
        if (timer !== null) clearTimer(timer);
        timer = null;
        report('authorization', 'The card is hidden while you are away.');
        hiddenTimer = setTimer(() => { hiddenTimer = null; lastView = null; close(); }, 300000);
      }
    },
    destroy() { stopped = true; generation += 1; authorization = null; lastView = null; clearScheduled(); clearHidden(); close(); },
  };
}

export function connectToTwitch(options) {
  const { onStatus } = options;
  let config;
  try { config = readRuntimeConfig(window.BAITED_EXTENSION_CONFIG); }
  catch { onStatus({ kind: 'invalid', message: 'This build needs its Extension service settings.' }); return null; }
  const helper = window.Twitch?.ext;
  if (!helper || typeof helper.onAuthorized !== 'function') {
    onStatus({ kind: 'invalid', message: 'Open baited on its Twitch channel to connect.' });
    return null;
  }
  const factory = config.transport === 'edge' ? createEdgeExtensionClient : createExtensionClient;
  const client = factory({ ...options, config, parse: (value) => options.parse(value, config.studioBaseUrl) });
  let twitchVisible = true;
  const updateVisibility = () => client.setVisible(twitchVisible && document.visibilityState !== 'hidden');
  helper.onAuthorized((auth) => client.authorize(auth));
  helper.onVisibilityChanged?.((value) => { twitchVisible = value; updateVisibility(); });
  helper.onError?.(() => {
    client.invalidate();
    onStatus({ kind: 'authorization', message: 'Twitch could not authorize this panel. Reload it on the channel.' });
  });
  document.addEventListener('visibilitychange', updateVisibility);
  updateVisibility();
  window.addEventListener('pagehide', (event) => {
    if (event.persisted) client.setVisible(false);
    else { client.destroy(); document.removeEventListener('visibilitychange', updateVisibility); }
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) updateVisibility(); });
  return client;
}

export function connectionView(status) {
  const element = document.getElementById('connection');
  element.hidden = status.kind === 'connected';
  element.dataset.tone = ['invalid', 'forbidden', 'authorization', 'signin'].includes(status.kind) ? 'error' : 'notice';
  document.getElementById('connection-copy').textContent = status.message;
  document.getElementById('retry').hidden = !['reconnecting', 'unavailable'].includes(status.kind);
}
