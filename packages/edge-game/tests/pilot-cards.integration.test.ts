import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { EdgeRoomTransport, type EdgeBootstrap } from '../../app/client/edge-transport.js';
import type { CardLibraryView } from '../../app/shared/card-library.js';
import { createLocalOptions } from '../scripts/local-options.mjs';
import { nodeBuiltinGuard } from '../scripts/build.mjs';

// Public synthetic material only. Twitch HTTP is replaced; gateway, Control and rooms are real.
const ORIGIN = 'https://pilot.test';
const WEBHOOK_SECRET = 'public-cards-fixture-webhook-not-a-credential';
const EXTENSION_SECRET = Buffer.alloc(32, 43).toString('base64');
const CHANNELS = [{ id: '123', login: 'komediruzecki7' }, { id: '456', login: 'lakeeko' }];
const WORDS = ['trombone', 'lantern', 'cactus', 'harbor', 'pretzel', 'compass'];
let script: string;

before(async () => {
  const result = await build({ stdin: { contents: `
    import gateway from '../src/index.js';
    import { TwitchControl as BaseControl } from '../src/control.js';
    export { ChannelRoom } from '../src/room.js';
    export default {fetch(request,env) {
      const headers=new Headers(request.headers);headers.set('host',new URL(request.url).host);
      return gateway.fetch(new Request(request,{headers}),env);
    }};
    export class TwitchControl extends BaseControl {
      async pumpFixture() { await this.alarm(); }
      async externalFetch(input, init={}) {
        const url=new URL(input), headers=new Headers(init.headers);
        const users={komediruzecki7:['123','komediruzecki7'],lakeeko:['456','lakeeko']};
        if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/token') {
          const params=new URLSearchParams(init.body), code=params.get('code')||'komediruzecki7';
          return Response.json({access_token:params.get('grant_type')==='client_credentials'?'fixture-app':'fixture-access:'+code,
            refresh_token:'fixture-refresh:'+code,expires_in:7200,scope:['user:read:chat','user:bot','channel:bot']});
        }
        const code=(headers.get('authorization')||'').split('fixture-access:')[1]||'komediruzecki7';
        const [id,login]=users[code]||users.komediruzecki7;
        if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/validate')
          return Response.json({client_id:'fixture-client',user_id:id,login,expires_in:7200,scopes:['user:read:chat','user:bot','channel:bot']});
        if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/users') return Response.json({data:[{id,login,display_name:login}]});
        if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/eventsub/subscriptions') {
          if(init.method==='DELETE') return new Response(null,{status:204});
          if(init.method==='GET') return Response.json({data:[]});
          const body=JSON.parse(init.body);
          return Response.json({data:[{id:'sub-'+body.condition.broadcaster_user_id+'-'+body.type,status:'enabled'}]},{status:202});
        }
        throw new Error('Unexpected provider request in the cards fixture');
      }
    }
  `, loader: 'ts', sourcefile: 'pilot-cards-fixture.ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  external: ['cloudflare:workers'], plugins: [nodeBuiltinGuard()] });
  script = result.outputFiles[0]!.text;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition: () => unknown, message: string) {
  const deadline = Date.now() + 3500;
  while (!condition()) { assert.ok(Date.now() < deadline, message); await sleep(10); }
}
const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cookies = (response: Response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
function viewerToken(channelId: string) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [{ alg: 'HS256', typ: 'JWT' }, { channel_id: channelId, role: 'viewer', opaque_user_id: 'U555', user_id: '555', iat: now, exp: now + 300 }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${parts}.${createHmac('sha256', Buffer.from(EXTENSION_SECRET, 'base64')).update(parts).digest('base64url')}`;
}
const card = (target: string) => ({ target, difficulty: 'medium', blockedClues: [`${target}a`, `${target}b`], acceptedSpellings: [] });

test('pilot cards: a streamer builds a pack, deals it, and the next round draws from it', { timeout: 30_000 }, async () => {
  const options = createLocalOptions({ port: 0, statePath: false, script, bindings: {
    EDGE_POC_ENABLED: 'false', EDGE_PILOT_ENABLED: 'true', EDGE_LOCAL_FIXTURE_AUTH: 'false',
    EDGE_PUBLIC_ORIGIN: ORIGIN, EDGE_ALLOWED_HOSTS: 'pilot.test', EDGE_ALLOWED_ORIGINS: ORIGIN,
    EDGE_CHANNEL_LOGIN_ALLOWLIST: CHANNELS.map((channel) => channel.login).join(','), EDGE_MAX_CHANNELS: '2',
    EDGE_PILOT_SECRET_B64: Buffer.alloc(32, 17).toString('base64'),
    EDGE_TOKEN_ENCRYPTION_KEY_B64: Buffer.alloc(32, 29).toString('base64'), TWITCH_EXTENSION_SECRET_B64: EXTENSION_SECRET,
    TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-client-secret', TWITCH_EVENTSUB_SECRET: WEBHOOK_SECRET,
  } });
  const worker = options.workers[0].config;
  worker.env.CONTROL = { type: 'durable-object', worker: worker.name, exportName: 'TwitchControl' };
  worker.exports.TwitchControl = { type: 'durable-object', storage: 'sqlite' };
  const mf = new Miniflare(options), clients: EdgeRoomTransport[] = [];
  try {
    await mf.ready;
    const request = (path: string, init: RequestInit = {}) => mf.dispatchFetch(`${ORIGIN}${path}`, {
      redirect: 'manual', ...init, headers: { host: 'pilot.test', 'cf-connecting-ip': '192.0.2.42', ...Object.fromEntries(new Headers(init.headers)) },
    } as any) as unknown as Promise<Response>;
    const controlNS = await mf.getDurableObjectNamespace('CONTROL');
    const control = controlNS.get(controlNS.idFromName('control-v1')) as any;
    const sessions: string[] = [], bootstraps: EdgeBootstrap[] = [];
    for (const channel of CHANNELS) {
      const start = await request('/auth/twitch');
      const state = new URL(start.headers.get('location')!).searchParams.get('state');
      const callback = await request(`/auth/twitch/callback?state=${state}&code=${channel.login}`, { headers: { cookie: cookies(start) } });
      assert.equal(callback.status, 302, await callback.text());
      sessions.push(cookies(callback));
      bootstraps.push(await (await request('/api/edge/session', { headers: { cookie: sessions.at(-1)! } })).json() as EdgeBootstrap);
    }
    const [cookie, other] = sessions as [string, string];
    const csrf = bootstraps[0]!.csrf!;
    const library = async (path = '', init: RequestInit = {}, as = cookie) => {
      const response = await request(`/api/studio/cards${path}`, { ...init, headers: { cookie: as, ...Object.fromEntries(new Headers(init.headers)) } });
      return { status: response.status, body: await response.json() as CardLibraryView & { error?: string; issues?: { path: string }[] } };
    };

    // Signed out and cross-site requests never reach a library.
    assert.equal((await request('/api/studio/cards')).status, 401);
    assert.equal((await library('/pack', jsonPost({ name: 'Regulars', status: 'draft', cards: [card('trombone')] }))).status, 403, 'A change needs the CSRF token.');
    assert.equal((await library('/pack', jsonPost({ name: 'Regulars', status: 'draft', cards: [card('trombone')] },
      { 'x-csrf-token': csrf, origin: 'https://elsewhere.test' }))).status, 403, 'A change from another origin is refused.');

    const empty = await library();
    assert.equal(empty.status, 200);
    assert.deepEqual([empty.body.packs.length, empty.body.selection.mode, empty.body.limits], [0, 'builtin', { packs: 10, cards: 100, minimum: 6 }]);

    // Field problems come back with the editor's paths.
    const invalid = await library('/pack', jsonPost({ name: 'Regulars', status: 'draft', cards: [{ ...card('two words'), blockedClues: ['x'] }] }, { 'x-csrf-token': csrf }));
    assert.equal(invalid.status, 400);
    assert.ok(invalid.body.issues!.some((issue) => issue.path === 'cards.0.target'));

    const oversized = await request('/api/studio/cards/pack', jsonPost({ name: 'x'.repeat(70 * 1024) }, { cookie, 'x-csrf-token': csrf }));
    assert.equal(oversized.status, 413);

    const saved = await library('/pack', jsonPost({ name: 'Regulars', status: 'published', cards: WORDS.map(card) }, { 'x-csrf-token': csrf }));
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const pack = saved.body.packs.find((item) => item.id === saved.body.savedPackId)!;
    assert.deepEqual(pack.cards.map((item) => item.target), WORDS);

    // Each channel has its own library.
    assert.equal((await library('', {}, other)).body.packs.length, 0);

    // Studio connects, then the deck change reaches its next-round summary.
    await sleep(1100); await control.pumpFixture(); await control.pumpFixture();
    class Socket {
      readyState = 0; bufferedAmount = 0; peer?: WebSocket;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number; reason: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string, protocols: string[]) {
        void request(new URL(url).pathname, { headers: { origin: ORIGIN, upgrade: 'websocket', 'sec-websocket-protocol': protocols.join(', ') } }).then((response) => {
          const peer = (response as any).webSocket as WebSocket; this.peer = peer;
          peer.addEventListener('message', (event) => this.onmessage?.({ data: String(event.data) }));
          peer.addEventListener('close', (event) => { this.readyState = 3; this.onclose?.({ code: event.code, reason: event.reason }); });
          this.readyState = 1; (peer as any).accept();
        }).catch(() => this.onerror?.());
      }
      send(value: string) { this.peer!.send(value); }
      close(code = 1000, reason = '') { this.readyState = 3; this.peer?.close(code, reason); }
    }
    const client = (bootstrap: EdgeBootstrap) => {
      const transport = new EdgeRoomTransport({ origin: ORIGIN, bootstrap: async () => bootstrap,
        socket: (url, protocols) => new Socket(url, protocols) as unknown as WebSocket,
        fetch: async (url, init) => await request(new URL(String(url)).pathname, { ...init, headers: {
          ...(!['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()) ? { origin: ORIGIN } : {}), ...Object.fromEntries(new Headers(init?.headers)) } }) });
      clients.push(transport); return transport;
    };
    const studio = client(bootstraps[0]!);
    const viewer = client({ channelId: bootstraps[0]!.channelId, token: viewerToken(bootstraps[0]!.channelId), tokenExpiresAt: Date.now() + 300_000 });
    await Promise.all([studio.state(), viewer.state()]);
    const deck = () => (studio.current as unknown as { deck?: { mode: string; name: string; eligibleCount: number; problem: string | null } }).deck;
    assert.equal(deck()?.mode, 'builtin');

    const chosen = await library('/select', jsonPost({ mode: 'custom', packId: pack.id, expectedRevision: saved.body.revision }, { 'x-csrf-token': csrf }));
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body));
    await until(() => deck()?.mode === 'custom', 'Studio did not receive the new deck.');
    assert.deepEqual([deck()!.name, deck()!.eligibleCount, deck()!.problem], ['Regulars', 6, null]);

    // A stale selection is refused rather than overwriting a newer one.
    assert.equal((await library('/select', jsonPost({ mode: 'builtin', expectedRevision: saved.body.revision }, { 'x-csrf-token': csrf }))).status, 409);

    await studio.command({ type: 'settings', settings: { ...studio.current!.room!.settings, chatBot: false } });
    await studio.command({ type: 'microphone', armed: true, leaseId: randomUUID(), renew: false });
    await studio.command({ type: 'start' });
    await until(() => viewer.current?.room?.phase === 'active', 'The viewer did not receive the round.');
    const target = (viewer.current!.room!.round as unknown as { target?: string }).target;
    assert.ok(target && WORDS.includes(target), `The round drew ${target}, not a card from the pack.`);
  } finally {
    for (const transport of clients) transport.close?.();
    await mf.dispose();
  }
});
