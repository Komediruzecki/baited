import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AwardReview } from '../client/mechanics';
import type { AwardBoard, HintCandidate } from '../shared/types';

const hint = (name: string, at: number, eligible = true): HintCandidate => ({
  id: `hint-${name}`,
  name,
  text: `${name} hint`,
  eligible,
  reason: eligible ? null : 'Forbidden clue: bird',
  at,
});
const minute = Date.UTC(2026, 9, 27, 20, 14, 0);
// The server keeps hints in arrival order; Blair's message carried the latest time.
const board: AwardBoard = {
  roundId: 'round-1',
  word: 'penguin',
  expiresAt: minute + 600_000,
  selectedHintId: null,
  candidates: [hint('Alex', minute + 5_000), hint('Blair', minute + 41_000), hint('Casey', minute + 38_000)],
};
const render = (value: AwardBoard) =>
  renderToStaticMarkup(
    React.createElement(AwardReview, {
      board: value,
      csrf: 'csrf-test',
      offline: false,
      onReceive: () => {},
      onError: () => {},
    }),
  );

test('the hint review lists the newest hint first', () => {
  const markup = render(board);
  const names = [...markup.matchAll(/<strong>@(\w+)<\/strong>/g)].map((match) => match[1]);
  assert.deepEqual(names, ['Blair', 'Casey', 'Alex']);
});

test('each hint in the review shows when it was sent', () => {
  const markup = render(board);
  const times = [...markup.matchAll(/<time[^>]* dateTime="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(times, [
    new Date(minute + 41_000).toISOString(),
    new Date(minute + 38_000).toISOString(),
    new Date(minute + 5_000).toISOString(),
  ]);
});
