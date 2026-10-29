import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Game, defaults } from '@baited/game-core';

const ORIGIN = 'https://pilot.test';
const WEBHOOK_SECRET = 'public-fixture-webhook-secret-not-a-credential';
const source = `
import { DurableObject } from 'cloudflare:workers';
import { TwitchControl } from './src/control.ts';
export class FixtureControl extends TwitchControl {
  failDelete=false;
  rowsRead=0; holdValidation=false; releaseValidation=null; validationTask=null; conflict=false; dropped=false;
  inboxQuery(query,...bindings) {
    const cursor=this.ctx.storage.sql.exec(query,...bindings);const rows=cursor.toArray();this.rowsRead+=cursor.rowsRead;return rows;
  }
  async fetch(request) {
    await this.ready;
    const url=new URL(request.url);
    if (url.pathname==='/__fixture/state') return Response.json(await this.ctx.storage.get('control-v1'));
    if (url.pathname==='/__fixture/rows') return Response.json({rowsRead:this.rowsRead,counts:this.ctx.storage.sql.exec('SELECT * FROM inbox_counts').toArray()[0]});
    if (url.pathname==='/__fixture/rows-reset') {this.rowsRead=0;this.nextInboxPruneAt=0;return Response.json({ok:true});}
    if (url.pathname==='/__fixture/inbox') {
      this.ctx.storage.sql.exec("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO twitch_inbox(id,expires_at,next_at,delivered) SELECT 'fixture-old-'||x,?,0,1 FROM n",Date.now()+600000);
      this.rowsRead=0;this.nextInboxPruneAt=0;return Response.json({ok:true});
    }
    if (url.pathname==='/__fixture/expire-inbox') {this.ctx.storage.sql.exec('UPDATE twitch_inbox SET expires_at=0');this.nextInboxPruneAt=0;this.prune();return Response.json({ok:true});}
    if (url.pathname==='/__fixture/validate-hold') {
      this.holdValidation=true;this.data.nextValidationAt=1;this.validationTask=this.alarm();this.ctx.waitUntil(this.validationTask);return Response.json({ok:true});
    }
    if (url.pathname==='/__fixture/validation-status') return Response.json({holding:!!this.releaseValidation});
    if (url.pathname==='/__fixture/validation-release') {this.releaseValidation?.();await this.validationTask;return Response.json({ok:true});}
    if (url.pathname==='/__fixture/conflict') {this.conflict=true;return Response.json({ok:true});}
    if (url.pathname==='/__fixture/secret-change') {this.data.channels['123'].subscriptionSecretHash='previous-secret-fingerprint';this.data.channels['123'].subscriptionRetryAt=0;await this.persist();return Response.json({ok:true});}
    if (url.pathname==='/__fixture/drop') {this.dropped=true;return Response.json({ok:true});}
    if (url.pathname==='/__fixture/fail-delete') {this.failDelete=url.searchParams.get('value')==='true';return Response.json({ok:true});}
    if (url.pathname==='/__fixture/idle') {
      for(const c of Object.values(this.data.channels)) c.lastStudioAt=Date.now()-16*60*1000;
      await this.alarm();return Response.json({ok:true});
    }
    if (url.pathname==='/__fixture/flush') {
      for(const c of Object.values(this.data.channels)) {c.subscriptionRetryAt=0;c.deleteRetryAt=0;}
      this.data.channelSentAt={};
      this.ctx.storage.sql.exec('UPDATE twitch_inbox SET next_at=0 WHERE delivered=0');
      await this.alarm();return Response.json({ok:true});
    }
    return super.fetch(request);
  }
  async externalFetch(input,init={}) {
    const url=new URL(input); const headers=new Headers(init.headers);
    const users={komediruzecki7:['123','komediruzecki7'],lakeeko:['456','lakeeko'],yahwehwastaken:['789','yahwehwastaken'],outsider:['987','outsider'],bot:['999','baity_bot'],wrongclient:['123','komediruzecki7'],missingscope:['123','komediruzecki7']};
    if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/token') {
      const params=new URLSearchParams(init.body);const code=params.get('code')||'komediruzecki7';
      return Response.json({access_token:params.get('grant_type')==='client_credentials'?'fixture-app':'fixture-access:'+code,refresh_token:'fixture-refresh:'+code,expires_in:7200,scope:['user:read:chat','user:bot','channel:bot']});
    }
    const code=(headers.get('authorization')||'').split('fixture-access:')[1]||'komediruzecki7';
    const [id,login]=users[code]||users.komediruzecki7;
    if(url.origin==='https://id.twitch.tv' && url.pathname==='/oauth2/validate') {
      if(this.holdValidation){this.holdValidation=false;await new Promise(resolve=>{this.releaseValidation=resolve});this.releaseValidation=null;}
      return Response.json({client_id:code==='wrongclient'?'wrong':'fixture-client',user_id:id,login,expires_in:7200,scopes:code==='missingscope'?[]:code==='bot'?['user:write:chat','user:bot']:['user:read:chat','user:bot','channel:bot']});
    }
    if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/users') return Response.json({data:[{id,login,display_name:login}]});
    if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/eventsub/subscriptions') {
      if(init.method==='DELETE') {if(!this.failDelete)this.conflict=false;return new Response(null,{status:this.failDelete?503:204});}
      if(init.method==='GET') return Response.json({data:[{id:'sub-disabled',type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:'123',user_id:'123'},transport:{method:'webhook',callback:'https://pilot.test/api/twitch/eventsub'},status:'notification_failures_exceeded'}]});
      if(this.conflict)return new Response(null,{status:409});
      const body=JSON.parse(init.body||'{}');
      return Response.json({data:[{id:'sub-'+body.condition.broadcaster_user_id+'-'+body.type,status:'enabled'}]},{status:202});
    }
    if(url.origin==='https://api.twitch.tv' && url.pathname==='/helix/chat/messages') {
      const sent=await this.ctx.storage.get('fixture-sent')||[];
      sent.push(JSON.parse(init.body));await this.ctx.storage.put('fixture-sent',sent);
      return Response.json({data:[this.dropped?{is_sent:false,drop_reason:{code:'rate_limit_exceeded'}}:{is_sent:true,message_id:'fixture-message'}]});
    }
    throw new Error('Unexpected provider request in offline fixture');
  }
}
export class FixtureRoom extends DurableObject {
  async fetch(request) {
    const url=new URL(request.url);const calls=await this.ctx.storage.get('calls')||[];
    if(url.pathname==='/__fixture/calls') return Response.json(calls);
    const body=await request.json();calls.push({path:url.pathname,body});await this.ctx.storage.put('calls',calls);
    if(body.text==='fixture-retry' && calls.filter(c=>c.body.eventId===body.eventId).length===1) return new Response(null,{status:503});
    return Response.json({ok:true});
  }
}
export default {fetch(request,env) {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/__fixture/room/')) return env.ROOMS.get(env.ROOMS.idFromName('channel:'+url.pathname.split('/').pop())).fetch('https://room.internal/__fixture/calls');
  if(url.pathname==='/__fixture/authorize') return env.CONTROL.get(env.CONTROL.idFromName('control-v1')).fetch('https://control.internal/internal/authorize',{method:'POST',body:request.body});
  if(url.pathname==='/__fixture/event') return env.CONTROL.get(env.CONTROL.idFromName('control-v1')).fetch('https://control.internal/internal/room-event',{method:'POST',body:request.body});
  return env.CONTROL.get(env.CONTROL.idFromName('control-v1')).fetch(request);
}};`;

async function fixture(overrides: Record<string, string> = {}, persistence?: string) {
  const result = await build({ stdin: { contents: source, resolveDir: new URL('..', import.meta.url).pathname, sourcefile: 'control-fixture.ts', loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['cloudflare:workers'], logLevel: 'silent' });
  const mf = new Miniflare(convertV4MiniflareOptions({ name: 'control-fixture', modules: true, script: result.outputFiles[0]!.text, host: '127.0.0.1', port: 0,
    compatibilityDate: '2026-09-07', cf: false, telemetry: { enabled: false }, unsafeRegisterWorker: false, unsafeLocalExplorer: false, unsafeObservability: false,
    bindings: { EDGE_PILOT_ENABLED: 'true', EDGE_PUBLIC_ORIGIN: ORIGIN, TWITCH_CLIENT_ID: 'fixture-client', TWITCH_CLIENT_SECRET: 'fixture-client-secret',
      TWITCH_EVENTSUB_SECRET: WEBHOOK_SECRET, EDGE_BOT_USER_ID: '999', EDGE_BOT_MESSAGES_PER_30_SECONDS: '2',
      EDGE_PILOT_SECRET_B64: Buffer.alloc(32, 17).toString('base64'), EDGE_TOKEN_ENCRYPTION_KEY_B64: Buffer.alloc(32, 29).toString('base64'), ...overrides },
    durableObjects: { CONTROL: { className: 'FixtureControl', useSQLite: true }, ROOMS: { className: 'FixtureRoom', useSQLite: true } },
    outboundService: () => new Response('External networking forbidden', { status: 503 }), cacheAPI: false,
    resourcePersistencePath: persistence,
  } as any));
  await mf.ready;
  const request = (path: string, init: RequestInit = {}) => mf.dispatchFetch(`${ORIGIN}${path}`, { redirect: 'manual', ...init } as any);
  return { mf, request };
}
const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
function cookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie(): string[] };
  return headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
}
async function login(f: Awaited<ReturnType<typeof fixture>>, code = 'komediruzecki7') {
  const start = await f.request('/auth/twitch');
  assert.equal(start.status, 302); const location = new URL(start.headers.get('location')!);
  assert.deepEqual(location.searchParams.get('scope')!.split(' '), ['user:read:chat', 'user:bot', 'channel:bot']);
  const callback = await f.request(`/auth/twitch/callback?state=${location.searchParams.get('state')}&code=${code}`, { headers: { cookie: cookies(start) } });
  return { callback, cookie: cookies(callback), location, start };
}
function webhook(body: unknown, id: string, type = 'notification', timestamp = new Date().toISOString()) {
  const raw = JSON.stringify(body);
  return { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'twitch-eventsub-message-id': id, 'twitch-eventsub-message-type': type,
    'twitch-eventsub-message-timestamp': timestamp, 'twitch-eventsub-message-signature': `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(id + timestamp + raw).digest('hex')}` } };
}
function event(id = 'message-1', type = 'channel.chat.message') {
  return { subscription: { id: `sub-123-${type}`, type, version: '1', condition: { broadcaster_user_id: '123', user_id: '123' } },
    event: { broadcaster_user_id: '123', chatter_user_id: '555', chatter_user_name: 'viewer', target_user_id: '555', message_id: id, message: { text: 'A useful clue' }, badges: [] } };
}

test('control OAuth is state-bound, encrypted, allowlisted, and logout revokes the durable session', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/session').then((r) => r.json()) as any).authenticated, false);
    const { callback, cookie, location, start } = await login(f);
    assert.equal(callback.status, 302); assert.equal(callback.headers.get('location'), `${ORIGIN}/studio`);
    const bootstrap = await f.request('/api/edge/session', { headers: { cookie } }).then((r) => r.json()) as any;
    assert.equal(bootstrap.channelId, '123'); assert.equal(bootstrap.viewerUrl, 'https://www.twitch.tv/komediruzecki7');
    assert.equal(bootstrap.bot.canAuthorize,true);
    assert.match(bootstrap.overlayUrl, /^https:\/\/pilot\.test\/overlay\/123#key=/);
    const claims = JSON.parse(Buffer.from(bootstrap.token.split('.')[1], 'base64url').toString());
    const admission = await f.request('/__fixture/authorize', jsonPost({ channelId: '123', sessionId: claims.sid, role: 'studio' })).then((r) => r.json()) as any;
    assert.equal(admission.allowed, true);
    const state = await f.request('/__fixture/state').then((r) => r.text());
    assert(!state.includes('fixture-access:')); assert(!state.includes('fixture-refresh:')); assert(!state.includes(new URL(bootstrap.overlayUrl).hash.slice(5)));
    assert.equal((await f.request(`/auth/twitch/callback?state=${location.searchParams.get('state')}&code=komediruzecki7`, { headers: { cookie: cookies(start) } })).status, 403);
    assert.equal((await f.request('/api/logout', jsonPost({}, { cookie, 'x-csrf-token': 'wrong' }))).status, 403);
    assert.equal((await f.request('/api/logout', jsonPost({}, { cookie, 'x-csrf-token': bootstrap.csrf }))).status, 200);
    assert.equal((await f.request('/__fixture/authorize', jsonPost({ channelId: '123', sessionId: claims.sid, role: 'studio' })).then((r) => r.json()) as any).allowed, false);
    assert.equal((await f.request('/api/edge/session', { headers: { cookie } })).status, 401);
    const calls = await f.request('/__fixture/room/123').then((r) => r.json()) as any[];
    assert(calls.some((c) => c.body.type === 'disconnect' && c.body.sessionId === claims.sid));
  } finally { await f.mf.dispose(); }
});

test('chat disconnect deletes subscriptions, retries failures, and reconnect is explicit after idle', async () => {
  const f = await fixture();
  try {
    const { cookie } = await login(f); const bootstrap = await f.request('/api/edge/session', { headers: { cookie } }).then((r) => r.json()) as any;
    const headers = { cookie, 'x-csrf-token': bootstrap.csrf };
    await f.request('/__fixture/flush'); await f.request('/__fixture/flush'); await f.request('/__fixture/flush');
    assert.equal((await f.request('/api/edge/chat', jsonPost({ connected: false }, { cookie }))).status, 403);
    await f.request('/__fixture/fail-delete?value=true');
    const stopping = await f.request('/api/edge/chat', jsonPost({ connected: false }, headers));
    assert.equal(stopping.status,503);
    assert.equal((await stopping.json() as any).subscriptionStatus,'stopping');
    assert.equal((await f.request('/api/edge/chat', jsonPost({ connected: true }, headers))).status,409);
    assert.equal((await f.request('/api/twitch/eventsub', webhook(event(), 'evt-stopped'))).status,204);
    assert(!(await f.request('/__fixture/room/123').then((r)=>r.json()) as any[]).some(c=>c.body.eventId==='evt-stopped'));
    await f.request('/__fixture/fail-delete?value=false'); await f.request('/__fixture/flush');
    let state=await f.request('/__fixture/state').then(r=>r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus,'offline');assert.equal(state.channels['123'].pendingDeletion.length,0);
    assert.equal(state.channels['123'].active,true);
    await f.request('/api/edge/session',{headers:{cookie}});await f.request('/__fixture/flush');
    state=await f.request('/__fixture/state').then(r=>r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus,'offline','bootstrap does not recreate subscriptions');
    assert.equal((await f.request('/api/edge/chat',jsonPost({connected:true},headers))).status,200);
    await f.request('/__fixture/flush');
    state=await f.request('/__fixture/state').then(r=>r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus,'enabled');
    await f.request('/__fixture/idle');await f.request('/__fixture/flush');
    state=await f.request('/__fixture/state').then(r=>r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus,'offline');
    assert.equal((await f.request('/api/edge/session',{headers:{cookie}})).status,200,'idle disconnect preserves Studio sign-in');
  } finally {await f.mf.dispose();}
});

test('wrong browser, identity scopes, account allowlist and channel limits fail closed', async () => {
  const f = await fixture({ EDGE_MAX_CHANNELS: '1' });
  try {
    const start = await f.request('/auth/twitch'); const url = new URL(start.headers.get('location')!);
    assert.equal((await f.request(`/auth/twitch/callback?state=${url.searchParams.get('state')}&code=komediruzecki7`)).status, 400);
    for (const code of ['wrongclient', 'missingscope']) assert.equal((await login(f, code)).callback.status, 503);
    assert.equal((await login(f, 'outsider')).callback.status, 403);
    assert.equal((await login(f)).callback.status, 302);
    assert.equal((await login(f, 'lakeeko')).callback.status, 409);
    assert.equal((await f.request('/__fixture/authorize', jsonPost({ channelId: '456' })).then((r) => r.json()) as any).allowed, false);
  } finally { await f.mf.dispose(); }
});

test('overlay bootstrap requires its fragment capability and exact same-origin POST', async () => {
  const f = await fixture();
  try {
    const { cookie } = await login(f); const bootstrap = await f.request('/api/edge/session', { headers: { cookie } }).then((r) => r.json()) as any;
    const key = new URL(bootstrap.overlayUrl).hash.slice(5);
    assert.equal((await f.request('/api/edge/overlay', jsonPost({ channelId: '123', key }, { origin: 'https://attacker.test' }))).status, 403);
    assert.equal((await f.request('/api/edge/overlay', jsonPost({ channelId: '123', key: 'x'.repeat(43) }))).status, 403);
    const result = await f.request('/api/edge/overlay', jsonPost({ channelId: '123', key })).then((r) => r.json()) as any;
    const claims = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString());
    assert.equal(claims.role, 'overlay'); assert.equal(claims.sid, 'overlay:123');
  } finally { await f.mf.dispose(); }
});

test('verified webhooks deliver once, reject altered payloads and handle moderation/revocation', async () => {
  const f = await fixture();
  try {
    await login(f); await f.request('/__fixture/flush'); await f.request('/__fixture/flush'); await f.request('/__fixture/flush');
    const good = webhook(event(), 'evt-one');
    assert.equal((await f.request('/api/twitch/eventsub', good)).status, 204);
    assert.equal((await f.request('/api/twitch/eventsub', good)).status, 204);
    assert.equal((await f.request('/api/twitch/eventsub', { ...good, body: `${good.body} ` })).status, 403);
    const shared = event('message-shared'); (shared.event as any).source_broadcaster_user_id = '456';
    assert.equal((await f.request('/api/twitch/eventsub', webhook(shared, 'evt-shared'))).status, 204);
    assert.equal((await f.request('/api/twitch/eventsub', webhook(event('message-delete', 'channel.chat.message_delete'), 'evt-delete'))).status, 204);
    const longName = event('message-long-name');
    longName.event.chatter_user_name = 'v'.repeat(65);
    (longName.event.badges as any[]) = [{ set_id: 'moderator' }, { set_id: 'x'.repeat(41) }];
    assert.equal((await f.request('/api/twitch/eventsub', webhook(longName, 'evt-normalized'))).status, 204);
    const calls = await f.request('/__fixture/room/123').then((r) => r.json()) as any[];
    assert.equal(calls.filter((c) => c.body.eventId === 'evt-one').length, 1);
    assert(calls.some((c) => c.body.kind === 'delete' && c.body.userId === '555'));
    const normalized = calls.find((c) => c.body.eventId === 'evt-normalized')!.body;
    assert.equal(normalized.name.length, 40); assert.deepEqual(normalized.badges, ['moderator']);
    const revoked = event(); (revoked.subscription as any).status = 'authorization_revoked';
    assert.equal((await f.request('/api/twitch/eventsub', webhook(revoked, 'evt-revoke', 'revocation'))).status, 204);
    assert.equal((await f.request('/__fixture/authorize', jsonPost({ channelId: '123' })).then((r) => r.json()) as any).allowed, false);
  } finally { await f.mf.dispose(); }
});

test('bot authorization is owner/CSRF gated and global send reservations are durable and bounded', async () => {
  const f = await fixture();
  try {
    const { cookie } = await login(f); const bootstrap = await f.request('/api/edge/session', { headers: { cookie } }).then((r) => r.json()) as any;
    assert.equal((await f.request('/api/bot/authorize', jsonPost({}, { cookie }))).status, 403);
    const botStart = await f.request('/api/bot/authorize', jsonPost({}, { cookie, 'x-csrf-token': bootstrap.csrf }));
    const botUrl = new URL((await botStart.json() as any).url);
    assert.equal((await f.request(`/auth/twitch/callback?state=${botUrl.searchParams.get('state')}&code=bot`, { headers: { cookie: cookies(botStart) } })).status, 302);
    const game = new Game({ id: 'fixture-room', owner: '123', channel: 'komediruzecki7', mode: 'demo', overlayKey: 'unused', settings: { ...defaults, chatBot: true }, history: [], priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {} });
    game.start(); const safeView = game.view('viewer'); const target = safeView.round!.target!;
    for (let i = 0; i < 3; i++) {
      assert.equal((await f.request('/__fixture/event', jsonPost({ channelId: '123', eventId: `round-${i}`, safeView, event: { type: 'start' } }))).status, 200);
      await f.request('/__fixture/flush');
    }
    const state = await f.request('/__fixture/state').then((r) => r.json()) as any;
    assert.equal(state.sentAt.length, 2); assert.equal(state.receipts.filter((r: any) => r.status === 'sent').length, 2);
    assert.equal(state.queue.length, 1); assert(!state.queue[0].text.toLowerCase().includes(target.toLowerCase()));
    assert(!JSON.stringify(state).includes('fixture-access:bot'));
    for (let i = 0; i < 2; i++) await f.request('/__fixture/event', jsonPost({ channelId: '123', eventId: `command-${i}`, safeView,
      event: { type: 'chat-command', command: 'help', userId: String(555 + i) } }));
    const cooldown = await f.request('/__fixture/state').then((r) => r.json()) as any;
    assert.equal(cooldown.queue.filter((q: any) => q.key === 'command').length, 1);
    assert.equal(Object.keys(cooldown.commandCooldowns).length, 2);
    await f.request('/__fixture/event', jsonPost({ channelId: '123', eventId: 'disabled', safeView: { ...safeView, settings: { ...safeView.settings, chatBot: false } }, event: { type: 'bot-settings' } }));
    assert.equal((await f.request('/__fixture/state').then((r) => r.json()) as any).queue.length, 0);
  } finally { await f.mf.dispose(); }
});

test('credentials, sessions, webhook retry and replay receipts survive control eviction', async () => {
  const root = process.env.BAITED_EDGE_TEST_OUTPUT ?? tmpdir();
  assert(isAbsolute(root)); await mkdir(root, { recursive: true });
  const persistence = await mkdtemp(join(root, 'baited-control-recovery-'));
  let f = await fixture({}, persistence); let passed = false;
  try {
    const { cookie } = await login(f); await f.request('/__fixture/flush');
    const payload = event('retry-message'); payload.event.message.text = 'fixture-retry';
    const notification = webhook(payload, 'evt-durable-retry');
    assert.equal((await f.request('/api/twitch/eventsub', notification)).status, 204);
    await f.mf.dispose(); f = await fixture({}, persistence);
    assert.equal((await f.request('/api/edge/session', { headers: { cookie } })).status, 200);
    await f.request('/__fixture/flush');
    assert.equal((await f.request('/api/twitch/eventsub', notification)).status, 204);
    const calls = await f.request('/__fixture/room/123').then((r) => r.json()) as any[];
    assert.equal(calls.filter((c) => c.body.eventId === 'evt-durable-retry').length, 2, 'one failed delivery, one durable retry, no third delivery');
    passed = true;
  } finally {
    await f.mf.dispose();
    if (passed || !process.env.BAITED_EDGE_TEST_OUTPUT) await rm(persistence, { recursive: true });
  }
});

test('OAuth state capacity evicts oldest attempts and a legitimate sign-in still completes', async () => {
  const f = await fixture();
  try {
    const oldest = await f.request('/auth/twitch');
    for (let i = 0; i < 101; i++) assert.equal((await f.request('/auth/twitch')).status, 302);
    assert.equal((await login(f)).callback.status, 302);
    const location = new URL(oldest.headers.get('location')!);
    assert.equal((await f.request(`/auth/twitch/callback?state=${location.searchParams.get('state')}&code=komediruzecki7`, { headers: { cookie: cookies(oldest) } })).status, 403);
    const state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert(Object.keys(state.pending).length <= 100);
  } finally { await f.mf.dispose(); }
});

test('webhook inbox reads stay bounded with 10000 receipts and counters survive cleanup', async (t) => {
  const f = await fixture();
  try {
    await login(f); await f.request('/__fixture/flush'); await f.request('/__fixture/rows-reset');
    assert.equal((await f.request('/api/twitch/eventsub', webhook(event('before'), 'before'))).status, 204);
    const small = await f.request('/__fixture/rows').then(r => r.json()) as any;
    assert.equal(small.counts.total, 1); assert.equal(small.counts.pending, 0);
    await f.request('/__fixture/inbox');
    assert.equal((await f.request('/api/twitch/eventsub', webhook(event('after'), 'after'))).status, 204);
    const large = await f.request('/__fixture/rows').then(r => r.json()) as any;
    assert.equal(large.counts.total, 10002); assert.equal(large.counts.pending, 0);
    assert(large.rowsRead < 100, `10000-row inbox used ${large.rowsRead} SQLite rows read`);
    assert(large.rowsRead <= small.rowsRead + 20, `rows read grew from ${small.rowsRead} to ${large.rowsRead}`);
    t.diagnostic(`Measured SQLite rows read: ${small.rowsRead} with an empty inbox; ${large.rowsRead} with 10001 existing receipts.`);
    await f.request('/__fixture/expire-inbox');
    const empty = await f.request('/__fixture/rows').then(r => r.json()) as any;
    assert.equal(empty.counts.total, 0); assert.equal(empty.counts.pending, 0);
  } finally { await f.mf.dispose(); }
});

test('unsigned requests and a slow credential validation do not block signed chat or read-only sessions', async () => {
  const f = await fixture();
  try {
    const { cookie } = await login(f); await f.request('/__fixture/flush');
    await f.request('/__fixture/validate-hold');
    let holding = false;
    for (let i = 0; i < 30 && !holding; i++) holding = (await f.request('/__fixture/validation-status').then(r => r.json()) as any).holding;
    assert(holding, 'fixture holds provider validation open');
    const responses = await Promise.all(Array.from({ length: 80 }, (_, i) => i % 2 ?
      f.request('/api/session', { headers: { cookie } }) : f.request('/api/twitch/eventsub', { method: 'POST', body: '{}' })));
    assert(responses.every((r, i) => r.status === (i % 2 ? 200 : 403)));
    assert.equal((await f.request('/api/twitch/eventsub', webhook(event(), 'while-validation-waits'))).status, 204);
    const revoked = event(); (revoked.subscription as any).status = 'authorization_revoked';
    assert.equal((await f.request('/api/twitch/eventsub', webhook(revoked, 'revoke-during-validation', 'revocation'))).status, 204);
    await f.request('/__fixture/validation-release');
    const state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].active, false); assert.equal(state.channels['123'].credentials, undefined);
    assert.deepEqual(state.channels['123'].scopes, []); assert.equal(Object.keys(state.sessions).length, 0);
    assert.equal((await f.request('/api/session', { headers: { cookie } }).then(r => r.json()) as any).authenticated, false);
    const calls = await f.request('/__fixture/room/123').then(r => r.json()) as any[];
    assert(calls.some(c => c.body.type === 'disconnect' && c.body.sessionId));
  } finally { await f.request('/__fixture/validation-release').catch(() => {}); await f.mf.dispose(); }
});

test('delivery-failure revocation keeps OAuth sessions and reconciles the disabled exact subscription', async () => {
  const f = await fixture();
  try {
    const { cookie } = await login(f); await f.request('/__fixture/flush');
    const revoked = event(); (revoked.subscription as any).status = 'notification_failures_exceeded';
    assert.equal((await f.request('/api/twitch/eventsub', webhook(revoked, 'failure-revoked', 'revocation'))).status, 204);
    let state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].active, true); assert.equal(state.channels['123'].subscriptionStatus, 'failed');
    assert.equal((await f.request('/api/edge/session', { headers: { cookie } })).status, 200);
    await f.request('/__fixture/conflict'); await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus, 'pending');
    await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus, 'enabled');
    await f.request('/__fixture/secret-change'); await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus, 'stopping'); assert.equal(state.channels['123'].chatWanted, true);
    await f.request('/__fixture/flush'); await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.channels['123'].subscriptionStatus, 'enabled');
    assert.notEqual(state.channels['123'].subscriptionSecretHash, 'previous-secret-fingerprint');
  } finally { await f.mf.dispose(); }
});

test('command spam cannot consume round receipt capacity or another channel bot share', async () => {
  const f = await fixture({ EDGE_BOT_MESSAGES_PER_30_SECONDS: '15' });
  try {
    const { cookie } = await login(f); await login(f, 'lakeeko');
    const bootstrap = await f.request('/api/edge/session', { headers: { cookie } }).then(r => r.json()) as any;
    const botStart = await f.request('/api/bot/authorize', jsonPost({}, { cookie, 'x-csrf-token': bootstrap.csrf }));
    const botUrl = new URL((await botStart.json() as any).url);
    assert.equal((await f.request(`/auth/twitch/callback?state=${botUrl.searchParams.get('state')}&code=bot`, { headers: { cookie: cookies(botStart) } })).status, 302);
    const game = new Game({ id: 'fixture-room', owner: '123', channel: 'komediruzecki7', mode: 'demo', overlayKey: 'unused', settings: { ...defaults, chatBot: true }, history: [], priorWins: 0, priorPlayed: 0, priorBest: 0, leaders: {} });
    game.start(); const safeView = game.view('overlay');
    for (let i = 0; i < 600; i++) assert.equal((await f.request('/__fixture/event', jsonPost({ channelId: '123', eventId: `spam-${i}`, safeView,
      event: { type: 'chat-command', command: 'help', userId: String(555 + i % 2) } }))).status, 200);
    let state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(Object.keys(state.dedupe).length, 1, 'cooldown-ignored commands do not consume receipts');
    for (let i = 0; i < 8; i++) {
      assert.equal((await f.request('/__fixture/event', jsonPost({ channelId: '123', eventId: `start-${i}`, safeView, event: { type: 'start' } }))).status, 200);
      await f.request('/__fixture/flush');
    }
    assert.equal((await f.request('/__fixture/event', jsonPost({ channelId: '456', eventId: 'other-start', safeView, event: { type: 'start' } }))).status, 200);
    await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert.equal(state.receipts.filter((r: any) => r.channelId === '123').length, 6);
    assert.equal(state.receipts.filter((r: any) => r.channelId === '456').length, 1);
    await f.request('/__fixture/drop');
    await f.request('/__fixture/event', jsonPost({ channelId: '456', eventId: 'drop-start', safeView, event: { type: 'start' } })); await f.request('/__fixture/flush');
    state = await f.request('/__fixture/state').then(r => r.json()) as any;
    assert(state.pausedUntil > Date.now(), 'Twitch rate-limit drop responses back off');
  } finally { await f.mf.dispose(); }
});
