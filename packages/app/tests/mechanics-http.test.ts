import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { GameView, Studio } from '../shared/types.js';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';

test('HTTP mission, private guesses and manual awards enforce ownership and clue eligibility', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'bait-mechanics-'));
  const config = loadConfig({ PORT: '0', DATA_DIR: dir }),
    b = await createBait(config);
  await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
  t.after(async () => {
    await b.close();
    await rm(dir, { recursive: true, force: true });
  });
  const call = (path: string, body?: unknown, csrf = '', cookie = '', origin = config.origin) =>
    fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = await call('/api/demo/start', {}),
    cookie = login.headers.get('set-cookie')!.split(';')[0],
    csrf = (await login.json()).csrf;
  let studio = (await (await call('/api/studio', undefined, '', cookie)).json()) as Studio;
  studio = await (
    await call(
      '/api/studio/settings',
      { ...studio.room.settings, mission: 'three', missionDuration: 60, callBait: true },
      csrf,
      cookie,
    )
  ).json();
  studio = await (await call('/api/studio/action', { action: 'start' }, csrf, cookie)).json();
  const viewerPath =
    new URL(studio.viewerUrl).pathname.replace('/play/', '/api/rooms/') + '/viewer';
  const overlayUrl = new URL(studio.overlayUrl),
    overlayPath =
      overlayUrl.pathname.replace('/overlay/', '/api/rooms/') + '/overlay' + overlayUrl.search;
  const viewer = (await (await call(viewerPath)).json()) as GameView;
  const roundId = studio.room.round!.id,
    epoch = studio.room.round!.epoch;

  await t.test('public projections expose one card only to viewers', async () => {
    const overlay = (await (await call(overlayPath)).json()) as GameView;
    assert.equal(viewer.mission!.total, 3);
    assert.equal(viewer.round!.forbiddenClues!.length, 2);
    assert.equal(studio.room.round!.target, undefined);
    assert.equal(overlay.round!.target, undefined);
    assert.equal(studio.room.round!.forbiddenClues, undefined);
    assert.equal(overlay.round!.forbiddenClues, undefined);
    assert.equal(studio.awardBoard, null);
    assert.ok(!('candidates' in viewer));
  });
  await t.test(
    'guesses require the controller session, CSRF and the live round binding',
    async () => {
      const body = { roundId, epoch, word: 'privatewrongguess' };
      assert.equal((await call('/api/studio/guess', body)).status, 401);
      assert.equal((await call('/api/studio/guess', body, 'wrong', cookie)).status, 403);
      assert.equal(
        (await call('/api/studio/guess', body, csrf, cookie, 'https://unrelated.example')).status,
        403,
      );
      assert.equal(
        (await call('/api/studio/guess', { ...body, roundId: 'stale' }, csrf, cookie)).status,
        400,
      );
      const response = await call('/api/studio/guess', body, csrf, cookie);
      assert.equal(response.status, 200);
      const reply = await response.json();
      assert.equal(reply.bonus, 15);
      assert.equal(reply.studio.room.mission.remaining > 60000, true);
      assert.ok(!JSON.stringify(reply).includes('privatewrongguess'));
      assert.equal((await call('/api/studio/guess', body, csrf, cookie)).status, 400);
    },
  );
  await t.test(
    'clue violations flag only their own hints and all other play continues',
    async () => {
      await call(
        '/api/demo/chat',
        { name: 'rule_breaker', text: `perhaps ${viewer.round!.forbiddenClues![0]}` },
        csrf,
        cookie,
      );
      await call(
        '/api/demo/chat',
        { name: 'clean_viewer', text: 'the formal outfit is giving something away' },
        csrf,
        cookie,
      );
      const current = (await (await call('/api/studio', undefined, '', cookie)).json()) as Studio;
      assert.equal(current.room.phase, 'active');
      assert.equal(current.room.violations, 1);
      assert.equal(current.awardBoard, null);
      assert.ok(!JSON.stringify(current).includes('formal outfit'));
      await call(
        '/api/demo/transcript',
        { roundId, epoch, text: `I said ${viewer.round!.target}!` },
        csrf,
        cookie,
      );
      studio = await (await call('/api/studio', undefined, '', cookie)).json();
      assert.equal(studio.room.score.wins, 1);
      assert.equal(studio.room.mission!.completed, 1);
      assert.equal(studio.awardBoard!.candidates.length, 2);
    },
  );
  await t.test(
    'only the owner can pick an eligible hint and public state contains no raw chat',
    async () => {
      const board = studio.awardBoard!,
        bad = board.candidates.find((h) => !h.eligible)!,
        good = board.candidates.find((h) => h.eligible)!;
      const payload = { roundId, hintId: good.id };
      assert.equal((await call('/api/studio/award', payload)).status, 401);
      assert.equal((await call('/api/studio/award', payload, 'wrong', cookie)).status, 403);
      assert.equal(
        (await call('/api/studio/award', { roundId, hintId: bad.id }, csrf, cookie)).status,
        400,
      );
      const other = await call('/api/demo/start', {}),
        otherCookie = other.headers.get('set-cookie')!.split(';')[0],
        otherCsrf = (await other.json()).csrf;
      assert.equal((await call('/api/studio/award', payload, otherCsrf, otherCookie)).status, 400);
      const picked = await call('/api/studio/award', payload, csrf, cookie);
      assert.equal(picked.status, 200);
      for (const path of [viewerPath, overlayPath]) {
        const value = (await (await call(path)).json()) as GameView;
        assert.equal(value.history[0].award!.name, 'clean_viewer');
        assert.ok(!JSON.stringify(value).includes('formal outfit'));
        assert.ok(!JSON.stringify(value).includes('candidates'));
      }
      const reversed = (await (
        await call('/api/studio/action', { action: 'reverse' }, csrf, cookie)
      ).json()) as Studio;
      assert.equal(reversed.room.score.wins, 0);
      assert.equal(reversed.room.mission!.completed, 0);
      assert.equal(reversed.room.history[0].award, undefined);
      assert.equal(reversed.room.leaders.find((l) => l.name === 'clean_viewer')!.baits, 0);
    },
  );
});
