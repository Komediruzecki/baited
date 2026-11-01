import { EdgeRoomTransport, edgeStudio, type EdgeBootstrap, type SpeechSocket } from './edge-transport';

let edgeMode = false;
let studioTransport: EdgeRoomTransport | undefined;
let overlayTransport: EdgeRoomTransport | undefined;
export const isEdgeRuntime = () => edgeMode;
export const canAuthorizeEdgeBot = () => edgeMode && studioTransport?.bootstrap?.bot?.canAuthorize === true;

export async function authorizeEdgeBot(): Promise<string> {
  const transport = studioEdge();
  await transport.state();
  if (!canAuthorizeEdgeBot()) throw new Error('The pilot operator connects the bot account.');
  const result = await direct<{ url: string }>('/api/bot/authorize', {}, transport.bootstrap?.csrf);
  const url = new URL(result.url);
  if (url.protocol !== 'https:' || url.hostname !== 'id.twitch.tv' || url.pathname !== '/oauth2/authorize')
    throw new Error('The bot sign-in link could not be verified. Try again.');
  return url.href;
}

async function direct<T>(path: string, body?: unknown, csrf?: string, signal?: AbortSignal): Promise<T> {
  // Older OBS Chromium has AbortController but not AbortSignal.timeout/any.
  // Keep the legacy Node path unchanged; bound edge bootstrap and control calls.
  const controller = edgeMode || path.startsWith('/api/edge/') || signal ? new AbortController() : undefined;
  const abort = () => controller?.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = controller ? setTimeout(abort, 10000) : undefined;
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    const data = await response
      .json()
      .catch(() => ({ error: 'The server did not respond. Try again.' }));
    if (signal?.aborted || controller?.signal.aborted) throw new DOMException('The request was canceled.', 'AbortError');
    if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: response.status });
    return data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function studioEdge() {
  return studioTransport ??= new EdgeRoomTransport({ origin: location.origin,
    bootstrap: (signal) => direct<EdgeBootstrap>('/api/edge/session', undefined, undefined, signal) });
}
function overlayEdge(channelId: string) {
  if (overlayTransport) return overlayTransport;
  const fragment = new URLSearchParams(location.hash.slice(1));
  const key = fragment.get('key');
  if (!key || !/^[A-Za-z0-9_-]{32,256}$/.test(key)) throw new Error('Copy a fresh OBS link from Stream setup.');
  // The capability never enters a request URL, referrer or server access log.
  return overlayTransport = new EdgeRoomTransport({ origin: location.origin,
    bootstrap: (signal) => direct<EdgeBootstrap>('/api/edge/overlay', { channelId, key }, undefined, signal) });
}
function clearEdge() {
  studioTransport?.destroy(); overlayTransport?.destroy();
  studioTransport = overlayTransport = undefined;
}

export function subscribeEdge<T>(path: string, state: (value: T) => void, error: (lost: boolean) => void) {
  if (path === '/api/studio/events') {
    const transport = studioEdge();
    return transport.subscribe((snapshot) => {
      try { state(edgeStudio(snapshot, transport.bootstrap!) as T); } catch { error(true); }
    }, error);
  }
  const overlay = /^\/api\/rooms\/([1-9][0-9]{0,24})\/events\/overlay$/.exec(path);
  if (overlay) return overlayEdge(overlay[1]).subscribe((snapshot) => {
    if (snapshot.room) state(snapshot.room as T); else error(true);
  }, error);
  error(true);
  return () => {};
}
export function edgeSpeechSocket(round: string, epoch: number, leaseId: string): SpeechSocket | undefined {
  return edgeMode ? studioEdge().speechSocket(round, epoch, leaseId) : undefined;
}

export async function request<T>(path: string, body?: unknown, csrf?: string, signal?: AbortSignal): Promise<T> {
  if (path === '/api/session') {
    const session = await direct<T & { runtime?: string; authenticated?: boolean }>(path, undefined, undefined, signal);
    edgeMode = session.runtime === 'edge';
    if (!session.authenticated) clearEdge();
    return session;
  }
  if (!edgeMode) return direct(path, body, csrf, signal);
  if (path === '/api/logout' || path.startsWith('/api/account/')) {
    const result = await direct<T>(path, body, csrf); clearEdge(); return result;
  }
  if (path === '/api/studio' || path.startsWith('/api/studio/') || path === '/api/recording/restart') {
    const transport = studioEdge();
    let snapshot = await transport.state(signal);
    if (body !== undefined) {
      const value = body as Record<string, unknown>;
      if(path==='/api/studio/voice-guess-draft') {
        const bot=transport.bootstrap?.bot;
        if(!snapshot.room?.settings.chatBot || snapshot.room.connection.status!=='connected' || !bot?.configured || !bot.authorized || !bot.channelAllowed)
          return {status:'unavailable',reason:'Baity is unavailable. Your voice guess is still ready.'} as T;
      }
      if (path === '/api/studio/action' && ['connect', 'disconnect'].includes(String(value.action))) {
        await direct('/api/edge/chat', { connected: value.action === 'connect' }, transport.bootstrap?.csrf);
        snapshot = await transport.refresh();
        return edgeStudio(snapshot, transport.bootstrap!) as T;
      }
      let action: Record<string, unknown>;
      if (path === '/api/studio/action') {
        const type = String(value.action);
        action = ['pause', 'resume', 'end', 'skip'].includes(type)
          ? { type, roundId: snapshot.room?.round?.id, epoch: snapshot.room?.round?.epoch }
          : type === 'reverse' ? { type, roundId: snapshot.room?.result?.id } : { type };
      } else if (path === '/api/studio/settings') action = { type: 'settings', settings: body };
      else if (path === '/api/studio/chaos/reset') action = { type: 'reset-chaos-session', sessionId: value.sessionId };
      else if (path === '/api/recording/restart') action = { type: 'restart-take', takeId: value.takeId };
      else if (path === '/api/studio/guess') action = { type: 'guess', roundId: value.roundId, epoch: value.epoch, text: value.word };
      else if (path === '/api/studio/voice-guess-draft') action = { type:'voice-guess-draft',roundId:value.roundId,epoch:value.epoch,text:value.word,draftId:value.draftId,expiresAt:value.expiresAt };
      else if (path === '/api/studio/catch') action = { type: 'catch', ...value };
      else if (path === '/api/studio/award') action = { type: 'award', ...value };
      else if (path === '/api/studio/microphone') action = { type: 'microphone', ...value, renew: value.renew === true };
      else throw new Error('The pilot uses the Baited deck. Card making is available in the local app.');
      snapshot = await transport.command(action, signal);
      if(path==='/api/studio/voice-guess-draft') return {status:'requested'} as T;
      if (path === '/api/studio/microphone') return { armed: value.armed === true } as T;
      if (path === '/api/studio/guess') {
        const result = snapshot.room?.result;
        const current = result?.id === value.roundId;
        const intervened = current && result?.reason === 'baity-chaos' && result.outcome === 'caught';
        return { correct: current && (result?.reason === 'guess' || intervened),
          ...(intervened ? { intervened: true } : {}),
          bonus: snapshot.room?.round?.wrongGuessBonus ?? 0, studio: edgeStudio(snapshot, transport.bootstrap!) } as T;
      }
    }
    return edgeStudio(snapshot, transport.bootstrap!) as T;
  }
  const overlay = /^\/api\/rooms\/([1-9][0-9]{0,24})\/overlay$/.exec(path);
  if (overlay) return (await overlayEdge(overlay[1]).state()).room as T;
  return direct(path, body, csrf);
}
