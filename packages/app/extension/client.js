const VERSION = '0.0.1';
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
  return { clientId: value.clientId, apiBaseUrl, studioBaseUrl };
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
    round = { id: q.id, number: q.number, duration: q.duration, remaining: q.remaining, endsAt: q.endsAt, difficulty: q.difficulty, target: q.target, forbiddenClues: q.forbiddenClues ?? [],
      ...(q.target !== undefined && q.ink ? { ink: q.ink } : {}), ...(q.target !== undefined && q.example ? { example: q.example } : {}) };
  }
  let result = null;
  if (r.result !== null) {
    const resultValue = r.result;
    if (!object(resultValue) || !string(resultValue.id) || !string(resultValue.word) || !outcomes.has(resultValue.outcome)) throw new Error('Invalid result.');
    if (resultValue.reason !== undefined && !['guess', 'timer'].includes(resultValue.reason)) throw new Error('Invalid result.');
    // Stays self-contained for the LAN harness; screens ignore counts that are not a tier.
    if (resultValue.milestone !== undefined && !(count(resultValue.milestone) && resultValue.milestone >= 2)) throw new Error('Invalid result.');
    if (resultValue.newBadge !== undefined && typeof resultValue.newBadge !== 'boolean') throw new Error('Invalid result.');
    result = { id: resultValue.id, word: resultValue.word, outcome: resultValue.outcome, ...(resultValue.reason ? { reason: resultValue.reason } : {}),
      ...(resultValue.milestone ? { milestone: resultValue.milestone, newBadge: resultValue.newBadge === true } : {}) };
  }
  // Chat's streak is public. Older backends without a score read as no streak.
  let score = { streak: 0, best: 0 };
  if (r.score !== undefined) {
    if (!object(r.score) || !count(r.score.streak) || !count(r.score.best)) throw new Error('Invalid score.');
    score = { streak: r.score.streak, best: r.score.best };
  }
  return { configured: true, room: { phase: r.phase, channel: r.channel, serverTime: r.serverTime, round, result, score } };
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
  const client = createExtensionClient({ ...options, config, parse: (value) => options.parse(value, config.studioBaseUrl) });
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
  element.dataset.tone = ['invalid', 'forbidden', 'authorization'].includes(status.kind) ? 'error' : 'notice';
  document.getElementById('connection-copy').textContent = status.message;
  document.getElementById('retry').hidden = status.kind !== 'reconnecting';
}
