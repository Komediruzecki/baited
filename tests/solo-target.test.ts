import assert from 'node:assert/strict';
import test from 'node:test';
import { canRevealSoloTarget, currentSoloTarget } from '../client/SoloTarget';
import type { GameView } from '../shared/types';

test('solo reveal is demo-only even when the live Twitch studio runs on loopback', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1', 'bait.maff.app', 'localhost.example.com', '192.168.1.10']) {
    assert.equal(canRevealSoloTarget(host, 'twitch'), false);
    assert.equal(canRevealSoloTarget(host, 'demo'), true);
  }
});

test('a viewer response cannot reveal a different room, next round, or a finished target', () => {
  const view = {
    id: 'room-one', phase: 'active', round: { id: 'round-one', target: 'volcano' },
  } as GameView;
  for (const phase of ['active', 'paused', 'settling'] as const)
    assert.equal(currentSoloTarget({ ...view, phase }, 'room-one', 'round-one'), 'volcano');
  assert.equal(currentSoloTarget(view, 'room-two', 'round-one'), null);
  assert.equal(currentSoloTarget(view, 'room-one', 'round-two'), null);
  for (const phase of ['idle', 'cooldown'] as const)
    assert.equal(currentSoloTarget({ ...view, phase }, 'room-one', 'round-one'), null);
  assert.equal(currentSoloTarget({ ...view, round: null }, 'room-one', 'round-one'), null);
  assert.equal(currentSoloTarget({ ...view, round: { ...view.round!, target: undefined } }, 'room-one', 'round-one'), null);
});
