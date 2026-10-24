import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { request as httpRequest } from 'node:http';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import type { Studio, GameView } from '../shared/types.js';

test('HTTP end-to-end game, role separation, synchronization and authorization', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-http-'));
  const config = loadConfig({ PORT: '0', DATA_DIR: dir }),
    b = await createBait(config);
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  t.after(async () => {
    await b.close();
    await rm(dir, { recursive: true, force: true });
  });
  const json = async (
    path: string,
    body?: unknown,
    csrf?: string,
    cookie?: string,
    origin = config.origin,
  ) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  let cookie = '',
    csrf = '',
    studio: Studio;
  await t.test('rehearsal creates a scoped HttpOnly session', async () => {
    const r = await json('/api/demo/start', {});
    assert.equal(r.status, 200);
    assert.ok(r.headers.get('set-cookie')?.includes('HttpOnly'));
    assert.ok(r.headers.get('set-cookie')?.includes('SameSite=Lax'));
    cookie = r.headers.get('set-cookie')!.split(';')[0];
    csrf = (await r.json()).csrf;
    const info = await (await json('/api/session', undefined, undefined, cookie)).json();
    assert.equal(info.authenticated, true);
    assert.equal(info.user.mode, 'demo');
    studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
    assert.equal(studio.room.phase, 'idle');
  });
  await t.test('CSRF, cross-origin and anonymous controller requests are blocked', async () => {
    assert.equal((await json('/api/studio/action', { action: 'start' })).status, 401);
    assert.equal(
      (await json('/api/studio/action', { action: 'start' }, 'wrong', cookie)).status,
      403,
    );
    assert.equal(
      (await json('/api/studio/action', { action: 'start' }, csrf, cookie, 'https://evil.example'))
        .status,
      403,
    );
    assert.equal((await json('/api/studio/settings', { duration: 1 }, csrf, cookie)).status, 400);
  });
  await t.test('real studio and viewer streams receive the same authoritative round', async () => {
    const controls = new AbortController(),
      viewers = new AbortController();
    const s = await fetch(base + '/api/studio/events', {
        headers: { Cookie: cookie },
        signal: controls.signal,
      }),
      v = await fetch(base + `/api/rooms/${studio.room.id}/events/viewer`, {
        signal: viewers.signal,
      });
    const sr = s.body!.getReader(),
      vr = v.body!.getReader(),
      decoder = new TextDecoder();
    try {
      assert.ok(decoder.decode((await sr.read()).value).includes('"phase":"idle"'));
      await vr.read();
      const r = await json('/api/studio/action', { action: 'start' }, csrf, cookie);
      assert.equal(r.status, 200);
      studio = await r.json();
      const streamStudio = decoder.decode((await sr.read()).value),
        streamViewer = decoder.decode((await vr.read()).value);
      const word = b.rooms.get(studio.room.id)!.round!.word;
      assert.ok(streamStudio.includes(studio.room.round!.id));
      assert.ok(!streamStudio.includes(`"target"`));
      assert.ok(!streamStudio.includes(word));
      assert.ok(streamViewer.includes(`"target":"${word}"`));
    } finally {
      controls.abort();
      viewers.abort();
      await sr.cancel().catch(() => {});
      await vr.cancel().catch(() => {});
    }
  });
  await t.test('public viewer gets target; OBS gets no secret or control token', async () => {
    const viewer = (await (await json(`/api/rooms/${studio.room.id}/viewer`)).json()) as GameView;
    const u = new URL(studio.overlayUrl),
      overlay = await json(`/api/rooms/${studio.room.id}/overlay${u.search}`);
    const raw = await overlay.text();
    assert.equal(overlay.status, 200);
    assert.ok(viewer.round?.target);
    assert.ok(!raw.includes(viewer.round.target));
    assert.ok(!raw.includes(csrf));
    assert.ok(!raw.includes('overlayKey'));
    assert.equal((await json(`/api/rooms/${studio.room.id}/overlay?key=wrong`)).status, 404);
    assert.equal((await json(`/api/rooms/${studio.room.id}/studio`)).status, 404);
  });
  await t.test(
    '50 simultaneous viewer events stay consistent without individual win claims',
    async () => {
      const replies = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          json(
            '/api/demo/chat',
            { name: `viewer_${i}`, text: 'Have you ever tried something unusual?' },
            csrf,
            cookie,
          ),
        ),
      );
      assert.ok(replies.every((r) => r.status === 200));
      const v = await (await json(`/api/rooms/${studio.room.id}/viewer`)).json();
      assert.equal(v.participants, 50);
    },
  );
  await t.test('pause and resume reject stale client transcripts', async () => {
    const old = studio.room.round!;
    assert.equal((await json('/api/studio/action', { action: 'pause' }, csrf, cookie)).status, 200);
    studio = await (await json('/api/studio/action', { action: 'resume' }, csrf, cookie)).json();
    const word = b.rooms.get(studio.room.id)!.round!.word;
    const stale = await (
      await json(
        '/api/demo/transcript',
        { text: word, roundId: old.id, epoch: old.epoch },
        csrf,
        cookie,
      )
    ).json();
    assert.equal(stale.matched, false);
  });
  await t.test(
    'a test transcript ends the round, reveals the word, and can be reversed',
    async () => {
      const round = studio.room.round!,
        word = b.rooms.get(studio.room.id)!.round!.word;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          json(
            '/api/demo/transcript',
            {
              text: `I think it is a ${word.toUpperCase()}!`,
              roundId: round.id,
              epoch: round.epoch,
            },
            csrf,
            cookie,
          ).then((r) => r.json()),
        ),
      );
      assert.equal(results.filter((r) => r.matched).length, 1);
      studio = await (await json('/api/studio', undefined, undefined, cookie)).json();
      assert.equal(studio.room.score.wins, 1);
      assert.equal(studio.room.result!.word, word);
      assert.equal(studio.room.leaders[0].rounds, 1);
      const reversed = (await (
        await json('/api/studio/action', { action: 'reverse' }, csrf, cookie)
      ).json()) as Studio;
      assert.equal(reversed.room.score.wins, 0);
      assert.equal(reversed.room.result!.outcome, 'overturned');
    },
  );
  await t.test('a second streamer gets an isolated room and distinct control session', async () => {
    const r = await json('/api/demo/start', {}),
      secondCookie = r.headers.get('set-cookie')!.split(';')[0],
      secondCsrf = (await r.json()).csrf;
    const second = (await (
      await json('/api/studio', undefined, undefined, secondCookie)
    ).json()) as Studio;
    assert.notEqual(second.room.id, studio.room.id);
    assert.equal(second.room.score.played, 0);
    assert.equal(
      (await json('/api/studio/action', { action: 'start' }, csrf, secondCookie)).status,
      403,
    );
    assert.notEqual(secondCsrf, csrf);
  });
  await t.test('invalid OAuth state fails before exchanging any token', async () => {
    const r = await fetch(base + '/auth/twitch/callback?state=forged&code=forged', {
      redirect: 'manual',
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/?notice=oauth');
  });
  await t.test('speech upgrade without an authorized microphone binding is rejected', async () => {
    const code = await new Promise<number>((resolve) => {
      const ws = new WebSocket(base.replace('http:', 'ws:') + '/api/speech', {
        headers: { Origin: config.origin },
      });
      ws.on('unexpected-response', (_req, res) => {
        resolve(res.statusCode!);
        res.resume();
        ws.terminate();
      });
      ws.on('error', () => {});
    });
    assert.equal(code, 403);
  });
  await t.test('logout invalidates cookie-based access', async () => {
    assert.equal((await json('/api/logout', {}, csrf, cookie)).status, 200);
    assert.equal((await json('/api/studio', undefined, undefined, cookie)).status, 401);
  });
});

test('production never exposes development fixture routes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-production-'));
  const c = loadConfig({
      PORT: '0',
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://bait.example',
      DATA_DIR: dir,
      ENABLE_DEMO: 'true',
    }),
    b = await createBait(c);
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await b.close();
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  const status = await new Promise<number>((resolve) => {
    const req = httpRequest(
      base + '/api/demo/start',
      {
        method: 'POST',
        headers: { Origin: c.origin, Host: 'bait.example', 'Content-Type': 'application/json' },
      },
      (r) => {
        r.resume();
        resolve(r.statusCode!);
      },
    );
    req.end('{}');
  });
  assert.equal(status, 404);
  const wrongHost = await fetch(base + '/api/session');
  assert.equal(wrongHost.status, 421);
});
