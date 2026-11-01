import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BaityChaosRule, BaityChaosSettings } from '../client/BaityChaos';
import { GuessForm } from '../client/mechanics';
import { fixture } from './fixtures';

const settings = { enabled: false, callBait: true, session: { id: 'session', used: true }, locked: false, busy: false, onChange() {}, async onReset() {} };

test('Baity chaos is an optional off switch with its probability and reset boundary explained', () => {
  const markup = renderToStaticMarkup(React.createElement(BaityChaosSettings, settings));
  assert.match(markup, /role="switch"/);
  assert.doesNotMatch(markup, /checked=""/);
  assert.match(markup, /At 3\+ chat wins in a row/);
  assert.match(markup, /1 in 4/);
  assert.match(markup, /At most once per session/);
  assert.match(markup, /Off by default/);
  assert.doesNotMatch(markup, /Reset chaos allowance|Intervention used/);
  const enabled = renderToStaticMarkup(React.createElement(BaityChaosSettings, {...settings, enabled: true}));
  assert.match(enabled, /Scores stay as they are/);
  assert.match(enabled, /class="button secondary"[^>]*>Reset chaos allowance/);
  assert.doesNotMatch(markup, /disabled=""/);
});

test('allowance reset is disabled during rounds, offline/busy and before it is used', () => {
  for (const patch of [{locked:true}, {busy:true}, {session:{id:'session', used:false}}]) {
    const markup = renderToStaticMarkup(React.createElement(BaityChaosSettings, {...settings, enabled:true, ...patch}));
    assert.match(markup, /<button[^>]*disabled=""[^>]*>Reset chaos allowance/);
  }
  const missingGuess = renderToStaticMarkup(React.createElement(BaityChaosSettings, {...settings, enabled:true, callBait:false}));
  assert.match(missingGuess, /Turn on Call the bait/);
});

test('round notice follows the snapshotted rule, not a next-round settings change', () => {
  const f = fixture(); f.game.update({...f.game.data.settings, callBait:true, baityChaos:true}); f.game.begin();
  const game = f.game.view('studio');
  const render = (patch = {}) => renderToStaticMarkup(React.createElement(BaityChaosRule, {game:{...game, ...patch}}));
  assert.match(render({settings:{...game.settings, baityChaos:false}}), /Baity chaos is on/);
  assert.doesNotMatch(render(), new RegExp(f.game.round!.word, 'i'), 'Rule copy must not reveal the secret.');
  assert.equal(render({round:{...game.round, baityChaos:false}}), '');
  assert.equal(render({phase:'idle'}), '');
  assert.equal(render({round:{...game.round, guessEnabled:false}}), '');
  assert.match(render({chaosSession:{id:'session',used:true}}), /already used/);
});

test('guess modal explains the exception before submission without exposing the target', () => {
  const f = fixture(); f.game.update({...f.game.data.settings, callBait:true, baityChaos:true}); f.game.begin();
  const markup = renderToStaticMarkup(React.createElement(GuessForm, {game:f.game.view('studio'), csrf:'fixture', offline:false, onReceive() {}, onClose() {}}));
  assert.match(markup, /A correct guess normally lets you escape/);
  assert.match(markup, /1 in 4 chance/);
  assert.doesNotMatch(markup, new RegExp(f.game.round!.word, 'i'));
});
