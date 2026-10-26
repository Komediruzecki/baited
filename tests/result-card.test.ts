import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultCard } from '../client/ResultCard';
import { cardArtFile, winLabel } from '../extension/presentation.js';
import type { Result } from '../shared/types';

const result: Result = {
  id: 'review-card',
  number: 1,
  word: 'VOLCANO',
  outcome: 'review',
  elapsed: 12,
  participants: 4,
  at: 1000,
};

test('OBS result card cannot expose an unconfirmed word through text or artwork', () => {
  assert.equal(
    renderToStaticMarkup(
      React.createElement(ResultCard, {
        result: { ...result, word: undefined, outcome: 'caught' },
        broadcast: true,
      }),
    ),
    '',
  );
  for (const outcome of ['review', 'ended', 'skipped', 'overturned'] as const) {
    assert.equal(
      renderToStaticMarkup(
        React.createElement(ResultCard, {
          result: { ...result, outcome },
          broadcast: true,
        }),
      ),
      '',
    );
  }
  for (const outcome of ['caught', 'escaped'] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(ResultCard, {
        result: { ...result, outcome },
        broadcast: true,
      }),
    );
    assert.match(markup, /VOLCANO/);
    assert.match(markup, /volcano\.png/);
  }
});

test('native card artwork is restricted to the approved local assets', () => {
  assert.equal(cardArtFile('VOLCANO'), 'card-volcano.png');
  for (const word of ['unknown', '../volcano', '<Pineapple>', 'volcano?token=example'])
    assert.equal(cardArtFile(word), null);
});

test('broadcast score copy handles zero, one and multiple wins', () => {
  assert.equal(winLabel(0), '0 WINS');
  assert.equal(winLabel(1), '1 WIN');
  assert.equal(winLabel(2), '2 WINS');
});
