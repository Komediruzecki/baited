import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResultCard } from '../client/ResultCard';
import { ObsHud } from '../client/ObsHud';
import { CatchDecision } from '../client/CatchDecision';
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
  // Use a synthetic custom word: pineapple now belongs to the illustrated deck.
  const customWord = 'COMMUNITYWORD';
  assert.equal(cardArtFile(customWord), null);
  const markup = renderToStaticMarkup(
    React.createElement(ResultCard, {
      result: { ...result, word: customWord },
    }),
  );
  assert.match(markup, /data-art="word"/);
  assert.match(markup, /COMMUNITYWORD/);
  assert.doesNotMatch(markup, /<img\b/);
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
    if (['skipped', 'ended', 'overturned'].includes(outcome)) assert.match(markup, /New word next/);
  }
});

test('broadcast score copy handles zero, one and multiple wins', () => {
  assert.equal(winLabel(0), '0 WINS');
  assert.equal(winLabel(1), '1 WIN');
  assert.equal(winLabel(2), '2 WINS');
});

test('reconnecting OBS stops its clocks and labels retained scores as last known', () => {
  const f = fixture();
  f.game.update({ ...f.game.data.settings, mission: 'three' });
  f.game.begin();
  const game = {
    ...f.game.view('overlay'),
    score: { wins: 2, played: 3, streak: 2, best: 2 },
  };
  const render = (now: number, timeLeft: string, offline: boolean) =>
    renderToStaticMarkup(
      React.createElement(ObsHud, { game, timeLeft, now, offset: 0, offline }),
    );
  const stale = render(f.now(), '01:30', true);
  assert.match(stale, /Reconnecting/);
  assert.match(stale, /Waiting for updates/);
  assert.match(stale, /Timer unavailable while reconnecting/);
  assert.match(stale, /—:—/);
  assert.match(stale, /Last known:/);
  assert.match(stale, /2 wins/);
  assert.match(stale, /streak 2/);
  assert.doesNotMatch(stale, /01:30|mission-clock|THREE-WORD MISSION/);
  assert.match(stale, /width:0%/);
  assert.equal(render(f.now() + 15000, '01:15', true), stale);

  const recovered = render(f.now() + 15000, '01:15', false);
  assert.doesNotMatch(recovered, /Reconnecting|Last known:|Waiting for updates/);
  assert.match(recovered, /01:15/);
  assert.match(recovered, /THREE-WORD MISSION/);
});

test('reconnecting OBS hides prior result words and fresh-win presentation', () => {
  const game = fixture().game.view('overlay');
  for (const outcome of ['review', 'caught', 'escaped', 'skipped', 'ended', 'overturned'] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(ObsHud, {
        game: { ...game, phase: 'cooldown', result: { ...result, outcome } },
        timeLeft: '00:00',
        now: 1000,
        offset: 0,
        offline: true,
      }),
    );
    assert.match(markup, /Reconnecting/);
    assert.match(markup, /Waiting for updates/);
    assert.match(markup, /Last known:/);
    assert.doesNotMatch(markup, /VOLCANO|volcano\.png|Chat wins|\+1|obs-hud-win|obs-win/);
  }
});


test('OBS gives the result word to the card during its reveal, then returns it to the HUD', () => {
  const game = fixture().game.view('overlay');
  for (const outcome of ['caught', 'escaped'] as const) {
    const render = (showCard: boolean) => renderToStaticMarkup(React.createElement(ObsHud, {
      game: { ...game, phase: 'cooldown', result: { ...result, outcome } },
      timeLeft: '00:00', now: 1000, offset: 0, offline: false, showCard,
    }));
    assert.doesNotMatch(render(true), /VOLCANO|volcano\.png/);
    assert.match(render(false), /VOLCANO/);
    assert.match(render(true), outcome === 'caught' ? /\+1 for chat/ : /Time ran out/);
  }
});


test('catch confirmation names the word as text without relying on its animated card', () => {
  const markup = renderToStaticMarkup(React.createElement(CatchDecision, {
    result, disabled: false, hasAward: false, onDecide() {}, onReverse() {},
  }));
  assert.match(markup, /<h2[^>]*tabindex="-1"[^>]*>Did you say it\?<\/h2>/);
  assert.match(markup, /<p class="studio-result__word"[^>]*>VOLCANO<\/p>/);
  assert.match(markup, /Yes gives chat the win\. No ends this round/);
  assert.match(markup, /aria-label="Confirm speech result"/);
  assert.match(markup, /Yes, chat wins/);
  assert.doesNotMatch(markup, /result-card|volcano\.png/);
});

test('automatic catch review uses the server deadline and retains reject and confirm controls', () => {
  const markup = renderToStaticMarkup(React.createElement(CatchDecision, {
    result: { ...result, confirmAt: 16000 }, now: 1000,
    disabled: false, hasAward: false, onDecide() {}, onReverse() {},
  }));
  assert.match(markup, /Catch heard\./);
  assert.match(markup, /15s/);
  assert.match(markup, /role="timer" aria-live="off"/);
  assert.match(markup, /Reject it if Moonshine misheard/);
  assert.match(markup, /No, I didn&#x27;t/);
  assert.match(markup, /Confirm now/);
  assert.doesNotMatch(markup, /Yes gives chat the win|result-card|volcano\.png/);
});

test('reopened catch review does not restart its countdown or claim a local win', () => {
  const render = (now: number) => renderToStaticMarkup(React.createElement(CatchDecision, {
    result: { ...result, confirmAt: 16000 }, now,
    disabled: false, hasAward: false, onDecide() {}, onReverse() {},
  }));
  assert.match(render(12001), /4s/);
  const due = render(17000);
  assert.match(due, /Waiting for the confirmed result/);
  assert.doesNotMatch(due, /Chat got you\.|Reverse win|>0s</);
});
