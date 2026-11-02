import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { EdgeRoomTransport, type EdgeBootstrap } from '../../app/client/edge-transport.js';
import { CARD_ART_CHECK_HEADER, EDGE_CARD_ART_LIMITS, type CardArtLibraryView, type CardArtUploadResult } from '../../app/shared/card-art.js';
import { CARD_ART_CHECK } from '../../app/shared/card-art-policy.js';
import type { CardLibraryView } from '../../app/shared/card-library.js';
import { cardArtPath } from '../../app/extension/presentation.js';
import { createLocalOptions } from '../scripts/local-options.mjs';
import { nodeBuiltinGuard } from '../scripts/build.mjs';
import { chunk, png } from './png-fixture.js';

// Public synthetic material only. Twitch HTTP is replaced; gateway, Control and rooms are real.
const ORIGIN = 'https://pilot.test';
const EXTENSION_SECRET = Buffer.alloc(32, 43).toString('base64');
const OPERATOR_KEY = 'public-fixture-operator-key-00000000000000000000';
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
        throw new Error('Unexpected provider request in the card art fixture');
      }
    }
  `, loader: 'ts', sourcefile: 'pilot-card-art-fixture.ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
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
const card = (target: string, artId?: string) => ({ target, difficulty: 'medium', blockedClues: [`${target}a`, `${target}b`], acceptedSpellings: [], ...(artId ? { artId } : {}) });

test('pilot card art: Studio uploads checked images, viewers see the round card, and the operator can purge', { timeout: 60_000 }, async () => {
  const options = createLocalOptions({ port: 0, statePath: false, script, bindings: {
    EDGE_POC_ENABLED: 'false', EDGE_PILOT_ENABLED: 'true', EDGE_LOCAL_FIXTURE_AUTH: 'false',
    EDGE_PUBLIC_ORIGIN: ORIGIN, EDGE_ALLOWED_HOSTS: 'pilot.test', EDGE_ALLOWED_ORIGINS: ORIGIN,
    EDGE_CHANNEL_LOGIN_ALLOWLIST: CHANNELS.map((channel) => channel.login).join(','), EDGE_MAX_CHANNELS: '2',
    EDGE_PILOT_SECRET_B64: Buffer.alloc(32, 17).toString('base64'), EDGE_OPERATOR_KEY: OPERATOR_KEY,
    EDGE_TOKEN_ENCRYPTION_KEY_B64: Buffer.alloc(32, 29).toString('base64'), TWITCH_EXTENSION_SECRET_B64: EXTENSION_SECRET,
    TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-client-secret', TWITCH_EVENTSUB_SECRET: 'public-card-art-fixture-webhook-not-a-credential',
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
    const [csrf, otherCsrf] = bootstraps.map((bootstrap) => bootstrap.csrf!) as [string, string];
    const checked = { origin: ORIGIN, 'content-type': 'image/png', [CARD_ART_CHECK_HEADER]: CARD_ART_CHECK };
    const upload = async (bytes: Uint8Array, headers: Record<string, string> = {}, as = cookie, token = csrf) => {
      const response = await request('/api/studio/card-art', { method: 'POST', headers: { cookie: as, 'x-csrf-token': token, ...checked, ...headers }, body: bytes });
      return { status: response.status, body: await response.json() as CardArtUploadResult & { code?: string } };
    };
    const list = async (as = cookie) => await (await request('/api/studio/card-art', { headers: { cookie: as } })).json() as CardArtLibraryView;
    const operator = (path: string, body?: unknown) => request(path, body === undefined
      ? { headers: { authorization: `Bearer ${OPERATOR_KEY}` } }
      : { method: 'POST', headers: { authorization: `Bearer ${OPERATOR_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // Signed out, cross-site, unchecked and malformed uploads never store anything.
    assert.equal((await request('/api/studio/card-art')).status, 401);
    assert.equal((await upload(png(8, 8), {}, cookie, 'wrong-token')).status, 403, 'A change needs the CSRF token.');
    assert.equal((await upload(png(8, 8), { origin: 'https://elsewhere.test' })).status, 403);
    assert.equal((await upload(png(8, 8), { 'content-type': 'image/jpeg' })).status, 415);
    assert.deepEqual(await upload(png(8, 8), { [CARD_ART_CHECK_HEADER]: '' }), { status: 422, body: { code: 'scan_unavailable', error: 'Reload Studio so it can check this image on your device, then try again.' } });
    assert.equal((await upload(png(8, 8, { before: [chunk('acTL', new Uint8Array(8))] }))).body.code, 'invalid_image');
    assert.equal((await upload(png(600, 8))).body.code, 'image_dimensions');
    assert.equal((await request('/api/studio/card-art', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, ...checked },
      body: new Uint8Array(EDGE_CARD_ART_LIMITS.outputBytes + 1) })).status, 413);
    assert.equal((await list()).art.length, 0);

    // Six card images, one per word. Each channel sees only its own.
    const images = WORDS.map((_, i) => png(16 + i, 16, { rgba: [40 * i, 200 - 20 * i, 90, 255] }));
    const ids: string[] = [];
    for (const image of images) {
      const result = await upload(image);
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.deepEqual(result.body.limits, EDGE_CARD_ART_LIMITS);
      ids.push(result.body.art.id);
    }
    const library = await list();
    assert.deepEqual([library.art.length, library.bytes, library.limits.assets], [6, images.reduce((sum, image) => sum + image.length, 0), 200]);
    const own = await request(`/api/studio/card-art/${ids[0]}.png`, { headers: { cookie } });
    assert.deepEqual([own.status, own.headers.get('content-type'), own.headers.get('cache-control')], [200, 'image/png', 'private, no-store']);
    assert.deepEqual(new Uint8Array(await own.arrayBuffer()), images[0]);
    assert.equal((await request(`/api/studio/card-art/${ids[0]}.png`, { headers: { cookie: other } })).status, 404);
    assert.equal((await list(other)).art.length, 0);

    // Twelve uploads a minute per channel. Stay clear of a minute boundary so the count is exact.
    if (Date.now() % 60_000 > 50_000) await sleep(60_000 - (Date.now() % 60_000) + 200);
    for (let i = 0; i < 12; i++) assert.equal((await upload(png(4, 4), {}, other, otherCsrf)).status, 201, `upload ${i + 1}`);
    assert.equal((await upload(png(4, 4), {}, other, otherCsrf)).body.code, 'art_busy');

    // A pack can use only approved images from its own library.
    const pack = (cards: unknown[], as = cookie, token = csrf) => request('/api/studio/cards/pack',
      jsonPost({ name: 'Painted', status: 'published', cards }, { cookie: as, 'x-csrf-token': token }));
    assert.equal((await pack(WORDS.map((word, i) => card(word, ids[i])), other, otherCsrf)).status, 400, 'Another channel cannot use these images.');
    const saved = await (await pack(WORDS.map((word, i) => card(word, ids[i])))).json() as CardLibraryView & { savedPackId: string };
    assert.ok(saved.savedPackId, JSON.stringify(saved));
    assert.equal((await request('/api/studio/cards/select', jsonPost({ mode: 'custom', packId: saved.savedPackId, expectedRevision: saved.revision },
      { cookie, 'x-csrf-token': csrf }))).status, 200);

    // Start a round from that pack.
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
    await studio.command({ type: 'settings', settings: { ...studio.current!.room!.settings, chatBot: false } });
    await studio.command({ type: 'microphone', armed: true, leaseId: randomUUID(), renew: false });
    await studio.command({ type: 'start' });
    const round = () => viewer.current?.room?.round as unknown as { target?: string; artUrl?: string } | undefined;
    await until(() => round()?.artUrl, 'The viewer did not receive the card image.');
    const { target, artUrl } = round()!;
    assert.equal(cardArtPath(artUrl), artUrl, 'The native Extension accepts the URL.');
    const word = WORDS.indexOf(target!);
    assert.ok(word >= 0 && artUrl!.includes(`/${ids[word]}/`), 'The URL names the image on the drawn card.');
    assert.equal((studio.current!.room!.round as unknown as { artUrl?: string }).artUrl, undefined, 'Studio never gets the live card.');

    // Only the signed URL, unchanged, serves the image.
    const art = await request(artUrl!, { headers: { origin: ORIGIN } });
    assert.deepEqual([art.status, art.headers.get('content-type'), art.headers.get('cross-origin-resource-policy'), art.headers.get('access-control-allow-origin')],
      [200, 'image/png', 'cross-origin', ORIGIN]);
    assert.deepEqual(new Uint8Array(await art.arrayBuffer()), images[word]);
    const token = artUrl!.slice(-47, -4);
    assert.equal((await request(artUrl!.replace(token, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')))).status, 404);
    assert.equal((await request(`${artUrl}?v=1`)).status, 404);
    assert.equal((await request(artUrl!, { headers: { origin: 'https://elsewhere.test' } })).status, 404);
    assert.equal((await request(artUrl!.replace(/\/round\/[^/]+\/[^/]+\//, `/round/edge-123/${randomUUID()}/`))).status, 404, 'Another round ID is refused.');

    // A live card's image cannot be deleted.
    assert.equal((await request(`/api/studio/card-art/${ids[word]}`, { method: 'DELETE', headers: { origin: ORIGIN, cookie, 'x-csrf-token': csrf } })).status, 409);

    // The operator sees the counts and can purge a channel's images.
    const status = await (await operator('/api/operator/status')).json() as { channels: { login: string; cardArt: unknown }[] };
    assert.deepEqual(status.channels.find((c) => c.login === 'komediruzecki7')?.cardArt,
      { images: 6, bytes: images.reduce((sum, image) => sum + image.length, 0), uploads: 'allowed' });
    assert.equal((await operator('/api/operator/card-art', { login: 'nobody', action: 'purge', reason: 'test' })).status, 404);
    assert.equal((await operator('/api/operator/card-art', { login: 'komediruzecki7', action: 'purge' })).status, 400, 'A reason is required.');
    const purge = await operator('/api/operator/card-art', { login: 'KomediRuzecki7', action: 'purge', removePacks: false, reason: 'Reported image' });
    assert.deepEqual(await purge.json(), { login: 'komediruzecki7', uploads: 'refused', removedImages: 6,
      removedBytes: images.reduce((sum, image) => sum + image.length, 0), removedPacks: 0 });
    assert.equal((await request(artUrl!)).status, 404);
    await until(() => round()?.target && round()?.artUrl === undefined, 'The viewer card kept the purged image.');
    assert.equal((await list()).art.length, 0);
    assert.equal((await upload(png(8, 8))).body.code, 'art_refused');
    assert.equal((await list(other)).art.length, 12, 'Other channels keep their images.');

    const allow = await operator('/api/operator/card-art', { login: 'komediruzecki7', action: 'allow', reason: 'Cleared' });
    assert.equal((await allow.json() as { uploads: string }).uploads, 'allowed');
    assert.equal((await upload(png(8, 8))).status, 201);
  } finally {
    for (const transport of clients) transport.close?.();
    await mf.dispose();
  }
});
