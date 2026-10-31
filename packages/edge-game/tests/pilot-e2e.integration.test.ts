import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { EdgeRoomTransport, type EdgeBootstrap } from '../../app/client/edge-transport.js';
import { createLocalOptions } from '../scripts/local-options.mjs';
import { nodeBuiltinGuard } from '../scripts/build.mjs';

// Every credential below is public synthetic material. Only Twitch HTTP is
// replaced: gateway, OAuth/session authority, room, outbox and bot queue are real.
const ORIGIN = 'https://pilot.test';
const WEBHOOK_SECRET = 'public-combined-fixture-webhook-not-a-credential';
const EXTENSION_SECRET = Buffer.alloc(32, 41).toString('base64');
const CHANNELS = [
  { id: '123', login: 'komediruzecki7' },
  { id: '456', login: 'lakeeko' },
  { id: '789', login: 'yahwehwastaken' },
];
let script: string;

before(async () => {
  const result = await build({ stdin: { contents: `
    import gateway from '../src/index.js';
    import { TwitchControl as BaseControl } from '../src/control.js';
    import { ChannelRoom as BaseRoom } from '../src/room.js';
    export default {fetch(request,env) {
      // Miniflare dispatch preserves the synthetic HTTPS URL but replaces Host
      // with its loopback transport address. Restore the matching fixture host.
      const headers=new Headers(request.headers);headers.set('host',new URL(request.url).host);
      return gateway.fetch(new Request(request,{headers}),env);
    }};
    export class TwitchControl extends BaseControl {
      events = [];
      async fetch(request) {
        if (request.url === 'https://control.internal/internal/room-event') {
          this.events.push(await request.clone().json());
        }
        return super.fetch(request);
      }
      async pumpFixture() { await this.alarm(); }
      async inspectFixture() {
        await this.ready;
        return this.serial(async () => ({
          channels: Object.values(this.data.channels).map(c => ({id:c.id,status:c.subscriptionStatus})),
          queue: structuredClone(this.data.queue), receipts: structuredClone(this.data.receipts),
          sentAt: [...this.data.sentAt], events: structuredClone(this.events),
          sent: await this.ctx.storage.get('fixture-sent') || [],
          credentialsEncrypted: !JSON.stringify(this.loadCheckpoint()).includes('fixture-access:'),
        }));
      }
      async replayAnnouncementFixture(eventId) {
        const event = this.events.find(event => event.eventId === eventId);
        if (!event) throw new Error('Missing real outbox event');
        return (await super.fetch(new Request('https://control.internal/internal/room-event', {
          method:'POST', body:JSON.stringify(event),
        }))).status;
      }
      async externalFetch(input, init={}) {
        const url=new URL(input), headers=new Headers(init.headers);
        const users={komediruzecki7:['123','komediruzecki7'],lakeeko:['456','lakeeko'],yahwehwastaken:['789','yahwehwastaken'],bot:['999','baity_bot']};
        if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/token') {
          const params=new URLSearchParams(init.body), code=params.get('code')||'komediruzecki7';
          return Response.json({access_token:params.get('grant_type')==='client_credentials'?'fixture-app':'fixture-access:'+code,
            refresh_token:'fixture-refresh:'+code,expires_in:7200,scope:['user:read:chat','user:bot','channel:bot']});
        }
        const code=(headers.get('authorization')||'').split('fixture-access:')[1]||'komediruzecki7';
        const [id,login]=users[code]||users.komediruzecki7;
        if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/validate')
          return Response.json({client_id:'fixture-client',user_id:id,login,expires_in:7200,
            scopes:code==='bot'?['user:write:chat','user:bot']:['user:read:chat','user:bot','channel:bot']});
        if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/users')
          return Response.json({data:[{id,login,display_name:login}]});
        if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/eventsub/subscriptions') {
          if(init.method==='DELETE') return new Response(null,{status:204});
          if(init.method==='GET') return Response.json({data:[]});
          const body=JSON.parse(init.body);
          return Response.json({data:[{id:'sub-'+body.condition.broadcaster_user_id+'-'+body.type,status:'enabled'}]},{status:202});
        }
        if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/chat/messages') {
          const sent=await this.ctx.storage.get('fixture-sent')||[];
          sent.push(JSON.parse(init.body)); await this.ctx.storage.put('fixture-sent',sent);
          return Response.json({data:[{is_sent:true,message_id:'fixture-message-'+sent.length}]});
        }
        throw new Error('Unexpected provider request in offline combined fixture');
      }
    }
    export class ChannelRoom extends BaseRoom {
      async pumpFixture() { await this.alarm(); }
      async inspectFixture() {
        return this.serial(async () => ({
          participants:this.game?.round?.participants.size||0,
          chatReceipts:this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_chat_receipt').one().n,
          outbox:this.ctx.storage.sql.exec('SELECT count(*) AS n FROM pilot_outbox').one().n,
        }));
      }
    }
  `, loader: 'ts', sourcefile: 'pilot-e2e-fixture.ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  external: ['cloudflare:workers'], plugins: [nodeBuiltinGuard()] });
  script = result.outputFiles[0]!.text;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(condition: () => unknown, message: string) {
  const deadline = Date.now() + 3500;
  while (!condition()) {
    assert.ok(Date.now() < deadline, message);
    await sleep(10);
  }
}
const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
function cookies(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}
function viewerToken(channelId: string) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [{ alg: 'HS256', typ: 'JWT' }, { channel_id: channelId, role: 'viewer',
    opaque_user_id: 'U555', user_id: '555', iat: now, exp: now + 300 }]
    .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  return `${parts}.${createHmac('sha256', Buffer.from(EXTENSION_SECRET, 'base64')).update(parts).digest('base64url')}`;
}
function signedChat(channelId: string, id: string, text = 'Think of something you might notice on holiday.', badges: string[] = []) {
  const body = JSON.stringify({ subscription: { id: `sub-${channelId}-channel.chat.message`,
    type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: channelId, user_id: channelId } },
  event: { broadcaster_user_id: channelId, chatter_user_id: '555', chatter_user_name: 'viewer',
    message_id: id, message: { text }, badges: badges.map((set_id) => ({ set_id, id: '1', info: '' })) } });
  const timestamp = new Date().toISOString();
  return { method: 'POST', body, headers: { 'content-type': 'application/json',
    'twitch-eventsub-message-id': id, 'twitch-eventsub-message-type': 'notification',
    'twitch-eventsub-message-timestamp': timestamp,
    'twitch-eventsub-message-signature': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(id + timestamp + body).digest('hex')}` } };
}

for (const {count, commands, commandId} of [
  {count:1,commands:false,commandId:''}, {count:3,commands:false,commandId:''},
  {count:1,commands:true,commandId:Buffer.alloc(32, 0xfb).toString('base64').replaceAll('+', '-').replaceAll('/', '_')},
  {count:1,commands:true,commandId:'__proto__'},
]) test(
  commands ? `combined pilot: opaque ${commandId.endsWith('=')?'padded':'prototype-looking'} ID authenticates a viewer command through Helix without granting moderator control` :
    `combined pilot: ${count} channel(s), real OAuth, room, webhook, outbox and shared bot budget`, { timeout: 30_000 }, async () => {
  const options = createLocalOptions({ port: 0, statePath: false, script, bindings: {
    EDGE_POC_ENABLED: 'false', EDGE_PILOT_ENABLED: 'true', EDGE_LOCAL_FIXTURE_AUTH: 'false',
    EDGE_PUBLIC_ORIGIN: ORIGIN, EDGE_ALLOWED_HOSTS: 'pilot.test', EDGE_ALLOWED_ORIGINS: ORIGIN,
    EDGE_CHANNEL_LOGIN_ALLOWLIST: CHANNELS.map((channel) => channel.login).join(','), EDGE_MAX_CHANNELS: '3',
    EDGE_PILOT_SECRET_B64: Buffer.alloc(32, 17).toString('base64'),
    EDGE_TOKEN_ENCRYPTION_KEY_B64: Buffer.alloc(32, 29).toString('base64'), TWITCH_EXTENSION_SECRET_B64: EXTENSION_SECRET,
    TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-client-secret', TWITCH_EVENTSUB_SECRET: WEBHOOK_SECRET,
    EDGE_BOT_USER_ID: '999', EDGE_BOT_MESSAGES_PER_30_SECONDS: '2',
  } });
  const worker = options.workers[0].config;
  worker.env.CONTROL = { type: 'durable-object', worker: worker.name, exportName: 'TwitchControl' };
  worker.exports.TwitchControl = { type: 'durable-object', storage: 'sqlite' };
  const mf = new Miniflare(options), clients: EdgeRoomTransport[] = [];
  try {
    await mf.ready;
    const request = (path: string, init: RequestInit = {}) => mf.dispatchFetch(`${ORIGIN}${path}`, {
      redirect: 'manual', ...init, headers: { host: 'pilot.test', 'cf-connecting-ip': '192.0.2.42', ...Object.fromEntries(new Headers(init.headers)) },
    } as any);
    const controlNS = await mf.getDurableObjectNamespace('CONTROL');
    const control = controlNS.get(controlNS.idFromName('control-v1')) as any;
    const roomNS = await mf.getDurableObjectNamespace('ROOMS');
    const rooms = CHANNELS.slice(0, count).map(({ id }) => roomNS.get(roomNS.idFromName(`channel:${id}`)) as any);
    const bootstraps: EdgeBootstrap[] = [], sessions: string[] = [];
    for (const channel of CHANNELS.slice(0, count)) {
      const start = await request('/auth/twitch'); assert.equal(start.status, 302, start.status === 302 ? '' : await start.text());
      const location = new URL(start.headers.get('location')!);
      const callback = await request(`/auth/twitch/callback?state=${location.searchParams.get('state')}&code=${channel.login}`,
        { headers: { cookie: cookies(start as unknown as Response) } });
      assert.equal(callback.status, 302, await callback.text());
      const cookie = cookies(callback as unknown as Response); sessions.push(cookie);
      const response = await request('/api/edge/session', { headers: { cookie } });
      assert.equal(response.status, 200);
      const bootstrap = await response.json() as EdgeBootstrap;
      assert.equal(bootstrap.channelId, channel.id); assert.equal(bootstrap.user!.login, channel.login);
      bootstraps.push(bootstrap);
    }
    const botStart = await request('/api/bot/authorize', jsonPost({}, { cookie: sessions[0]!, 'x-csrf-token': bootstraps[0]!.csrf! }));
    assert.equal(botStart.status, 200);
    const botUrl = new URL((await botStart.json() as any).url);
    assert.equal((await request(`/auth/twitch/callback?state=${botUrl.searchParams.get('state')}&code=bot`,
      { headers: { cookie: cookies(botStart as unknown as Response) } })).status, 302);
    // Let the real subscription deadline arrive. Do not rewrite clocks, queue
    // spacing, receipts or budgets to make the combined run pass.
    await sleep(1100);
    for (let i = 0; i < count; i++) await control.pumpFixture();
    assert.deepEqual((await control.inspectFixture()).channels.map((c: any) => c.status), Array(count).fill('enabled'));

    class Socket {
      readyState = 0; bufferedAmount = 0;
      onmessage: ((event: { data: string }) => void) | null = null;
      onclose: ((event: { code: number; reason: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      peer?: WebSocket;
      constructor(url: string, protocols: string[]) {
        void request(new URL(url).pathname, { headers: { origin: ORIGIN, upgrade: 'websocket',
          'sec-websocket-protocol': protocols.join(', ') } }).then((response) => {
          assert.equal(response.status, 101);
          const peer = response.webSocket!; this.peer = peer as unknown as WebSocket;
          peer.addEventListener('message', (event) => this.onmessage?.({ data: String(event.data) }));
          peer.addEventListener('close', (event) => { this.readyState = 3; this.onclose?.({ code: event.code, reason: event.reason }); });
          this.readyState = 1; peer.accept();
        }).catch(() => this.onerror?.());
      }
      send(value: string) { this.peer!.send(value); }
      close(code = 1000, reason = '') { this.readyState = 3; this.peer?.close(code, reason); }
    }
    const client = (bootstrap: EdgeBootstrap) => {
      const transport = new EdgeRoomTransport({ origin: ORIGIN, bootstrap: async () => bootstrap,
        socket: (url, protocols) => new Socket(url, protocols) as unknown as WebSocket,
        fetch: async (url, init) => await request(new URL(String(url)).pathname, {
          ...init, headers: { ...(!['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase()) ? { origin: ORIGIN } : {}),
            ...Object.fromEntries(new Headers(init?.headers)) },
        }) as unknown as Response });
      clients.push(transport); return transport;
    };
    const studios = bootstraps.map(client);
    const viewers = bootstraps.map((b) => client({ channelId: b.channelId, token: viewerToken(b.channelId), tokenExpiresAt: Date.now() + 300_000 }));
    const overlays: EdgeRoomTransport[] = [];
    for (const b of bootstraps) {
      const key = new URL(b.overlayUrl!).hash.slice(5);
      const response = await request('/api/edge/overlay', jsonPost({ channelId: b.channelId, key }));
      assert.equal(response.status, 200); overlays.push(client(await response.json() as EdgeBootstrap));
    }
    await Promise.all(clients.map((c) => c.state()));
    const leases = studios.map(() => randomUUID());
    await Promise.all(studios.map(async (studio, index) => {
      assert.equal(studio.current!.room!.connection.status, 'connected', 'Only actual Control subscription can connect a room.');
      await studio.command({ type: 'settings', settings: { ...studio.current!.room!.settings, chatBot: true, modCommands: commands } });
      await studio.command({ type: 'microphone', armed: true, leaseId: leases[index]!, renew: false });
      if (commands) {
        assert.equal((await request('/api/twitch/eventsub', signedChat(bootstraps[index]!.channelId,
          'nonmod-start', '!bait start'))).status, 204);
        assert.equal((await studio.refresh()).room!.phase, 'idle', 'A signed ordinary viewer cannot start the streamer round.');
      }
      await studio.command({ type: 'start' });
    }));
    await until(() => viewers.every((c) => c.current?.room?.phase === 'active'), 'Viewers did not receive their channel round.');
    const words = viewers.map((viewer) => viewer.current!.room!.round!.target!);
    if (commands) {
      await rooms[0].pumpFixture(); await control.pumpFixture();
      assert.equal((await control.inspectFixture()).sent.length, 1, 'The real start announcement reaches mock Helix first.');
      await sleep(1150); // Respect the real per-channel spacing and unchanged two-message budget.
      assert.equal((await request('/api/twitch/eventsub', signedChat(bootstraps[0]!.channelId,
        'nonmod-pause', '!bait pause'))).status, 204);
      assert.equal((await studios[0]!.refresh()).room!.phase, 'active', 'A signed ordinary viewer cannot pause the streamer round.');
      const who = signedChat(bootstraps[0]!.channelId, commandId, '!bait who');
      const forged = { ...who, headers: { ...who.headers, 'twitch-eventsub-message-signature': 'sha256=' + '0'.repeat(64) } };
      assert.equal((await request('/api/twitch/eventsub', forged)).status, 403,
        'An opaque-looking ID never authenticates a message without its valid signature.');
      assert.equal((await control.inspectFixture()).events.filter((event: any) => event.event.type === 'chat-command').length, 0);
      assert.equal((await request('/api/twitch/eventsub', who)).status, 204);
      assert.equal((await request('/api/twitch/eventsub', who)).status, 204);
      await rooms[0].pumpFixture();
      const announced = await control.inspectFixture();
      const command = announced.events.find((event: any) => event.event.type === 'chat-command');
      assert.ok(command, 'The signed Twitch command must survive Room processing and its durable outbox.');
      assert.equal(command.event.command, 'who');
      assert.equal(command.event.userId, '555');
      await control.pumpFixture();
      const replied = await control.inspectFixture();
      assert.equal(replied.sent.length, 2, 'The ordinary viewer gets a reply through the actual Control → Helix sender.');
      assert.equal(replied.sentAt.length, 2, 'The reply spends the original shared send budget.');
      assert.ok(replied.sent.every((sent: any) => sent.broadcaster_id === '123' && sent.sender_id === '999'));
      assert.match(replied.sent[1].message, /baity|baeittrice/i);
      assert.ok(words.every((word) => !replied.sent[1].message.toLowerCase().includes(word.toLowerCase())),
        'A command reply must not disclose the active secret.');
      assert.equal(replied.events.filter((event: any) => event.event.type === 'chat-command').length, 1,
        'Replaying the same signed Twitch delivery must not queue a second reply.');
      assert.equal((await rooms[0].inspectFixture()).outbox, 0);
      return;
    }
    for (let i = 0; i < count; i++) {
      assert.equal(typeof words[i], 'string');
      for (const hidden of [studios[i]!.current!, overlays[i]!.current!]) {
        for (const field of ['target', 'forbiddenClues', 'cardId', 'artId', 'artUrl']) assert.equal(field in hidden.room!.round!, false);
      }
      const delivery = signedChat(bootstraps[i]!.channelId, `clue-${i}`);
      assert.equal((await request('/api/twitch/eventsub', delivery)).status, 204);
      assert.equal((await request('/api/twitch/eventsub', delivery)).status, 204);
      assert.equal((await request('/api/twitch/eventsub', { ...delivery, body: delivery.body + ' ' })).status, 403);
      const room = await rooms[i].inspectFixture();
      assert.equal(room.participants, 1, 'Signed chat reaches the actual room once.');
      assert.equal(room.chatReceipts, 1, 'Duplicate webhook cannot add another room receipt.');
    }
    await Promise.all(rooms.map((room: any) => room.pumpFixture()));
    for (let i = 0; i < count; i++) await control.pumpFixture();
    const active = await control.inspectFixture();
    assert.equal(active.sent.length, Math.min(count, 2));
    assert.equal(active.sentAt.length, Math.min(count, 2));
    assert.equal(active.queue.length, Math.max(0, count - 2));
    assert.equal(new Set(active.sent.map((sent: any) => sent.broadcaster_id)).size, Math.min(count, 2));
    assert.ok(active.sent.every((sent: any) => sent.sender_id === '999'));
    for (const announcement of [...active.sent.map((s: any) => s.message), ...active.queue.map((q: any) => q.text)]) {
      assert.ok(words.every((word) => !announcement.toLowerCase().includes(word.toLowerCase())), 'Live bot announcements never disclose targets.');
    }
    const startEvent = active.events.find((event: any) => event.event.type === 'start');
    assert.ok(startEvent, 'The real room outbox reached Control.');
    assert.equal(await control.replayAnnouncementFixture(startEvent.eventId), 200);
    const replayed = await control.inspectFixture();
    assert.deepEqual(replayed.queue, active.queue, 'Replayed outbox delivery does not enqueue twice.');
    assert.deepEqual(replayed.sent, active.sent);

    if (count === 1) {
      const studio = studios[0]!, round = studio.current!.room!.round!;
      const speech = studio.speechSocket(round.id, round.epoch, leases[0]!);
      await until(() => speech.readyState === 1, 'Speech socket did not bind.');
      await sleep(350);
      speech.send(JSON.stringify({ type: 'audio', samples: 4096 }));
      speech.send(JSON.stringify({ type: 'final', sequence: 1, line: { id: 'combined-catch', text: words[0],
        isComplete: true, startTime: 0.1, duration: 0.1, words: [{ text: words[0], start: 0.1, end: 0.2, confidence: 1 }] } }));
      await until(() => studio.current?.room?.result?.outcome === 'review', 'Local transcript did not produce review.');
      assert.equal(studio.current!.room!.score.wins, 0);
      await studio.command({ type: 'catch', roundId: round.id, decision: 'confirm' });
      await until(() => overlays[0]!.current?.room?.score.wins === 1, 'Confirmed result was not projected to OBS.');
      assert.equal(overlays[0]!.current!.room!.result!.word, words[0]);
    } else {
      await Promise.all(studios.map((studio) => {
        const round = studio.current!.room!.round!;
        return studio.command({ type: 'end', roundId: round.id, epoch: round.epoch });
      }));
      assert.ok(studios.every((studio) => studio.current!.room!.score.wins === 0), 'Manual endings do not invent catches.');
    }
    await Promise.all(rooms.map((room: any) => room.pumpFixture()));
    await sleep(1150); // Real same-channel Twitch spacing, never fixture-reset.
    await control.pumpFixture(); await control.pumpFixture();
    const final = await control.inspectFixture();
    assert.equal(final.sent.length, 2, 'One global two-message budget applies across every room and alarm.');
    assert.equal(final.sentAt.length, 2);
    assert.equal(new Set(final.receipts.map((receipt: any) => receipt.id)).size, final.receipts.length);
    assert.ok(final.receipts.every((receipt: any) => receipt.status === 'sent'));
    assert.ok(final.credentialsEncrypted);
    for (const room of rooms) assert.equal((await room.inspectFixture()).outbox, 0, 'Acknowledged actual outbox entries drain.');
    // Same-origin GET/HEAD deliberately omit Origin in this browser fixture.
    // Connect/disconnect must refresh over the authenticated socket instead.
    for (let i = 0; i < count; i++) {
      const headers = { cookie: sessions[i]!, 'x-csrf-token': bootstraps[i]!.csrf! };
      assert.equal((await request('/api/edge/chat', jsonPost({ connected: false }, headers))).status, 200);
      assert.equal((await studios[i]!.refresh()).room!.connection.status, 'offline');
      assert.equal((await request('/api/edge/chat', jsonPost({ connected: true }, headers))).status, 200);
      assert.equal((await studios[i]!.refresh()).room!.connection.status, 'offline');
    }
    await sleep(1100);
    for (let i = 0; i < count; i++) await control.pumpFixture();
    for (const studio of studios) assert.equal((await studio.refresh()).room!.connection.status, 'connected');
  } finally {
    clients.forEach((client) => client.destroy());
    await mf.dispose();
  }
});
