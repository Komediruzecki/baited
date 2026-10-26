import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultCard } from '../client/ResultCard';
import { ObsHud } from '../client/ObsHud';
import { cardArtFile, winLabel } from '../extension/presentation.js';
import type { Result } from '../shared/types';
import { fixture } from './fixtures';

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

test('words without an illustration get a deliberate word face without placeholder artwork', () => {
  const markup = renderToStaticMarkup(
    React.createElement(ResultCard, {
      result: { ...result, word: 'PINEAPPLE' },
    }),
  );
  assert.match(markup, /data-art="word"/);
  assert.match(markup, /PINEAPPLE/);
  assert.doesNotMatch(markup, /class="bait-card-art"/);
  assert.match(renderToStaticMarkup(React.createElement(ResultCard, { result })), /data-art="art"/);
});

test('OBS HUD independently refuses words from unapproved outcomes', () => {
  const game = fixture().game.view('viewer');
  for (const outcome of [
    'review',
    'caught',
    'escaped',
    'skipped',
    'ended',
    'overturned',
  ] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(ObsHud, {
        game: { ...game, phase: 'cooldown', result: { ...result, outcome } },
        timeLeft: '00:00',
        now: 1000,
        offset: 0,
        offline: false,
      }),
    );
    assert.equal(markup.includes('VOLCANO'), ['caught', 'escaped'].includes(outcome), outcome);
    assert.equal(markup.includes('—'), false, outcome);
    if (outcome === 'review') assert.match(markup, /Did they say it\?/);
    if (['skipped', 'ended', 'overturned'].includes(outcome)) assert.match(markup, /NEW WORD NEXT/);
  }
});

test('broadcast score copy handles zero, one and multiple wins', () => {
  assert.equal(winLabel(0), '0 WINS');
  assert.equal(winLabel(1), '1 WIN');
  assert.equal(winLabel(2), '2 WINS');
});
