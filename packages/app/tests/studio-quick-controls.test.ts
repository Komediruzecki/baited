import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudioQuickControls } from '../client/StudioQuickControls.js';
import { defaults, settingsSchema } from '@baited/game-core';
import type { ChatBotStatus } from '../shared/types';

const bot: ChatBotStatus = { mode: 'twitch', name: 'baity_bot', channelAllowed: true, problem: null, recent: [] };
const render = (patch = {}, botPatch = {}, disabled = false) => renderToStaticMarkup(React.createElement(StudioQuickControls, {
  settings: { ...defaults, ...patch }, bot: { ...bot, ...botPatch }, disabled, onChange: async () => {},
}));

test('new channel announcements default on while stored opt-out and legacy missing values stay off', () => {
  assert.equal(defaults.chatBot, true);
  assert.equal(defaults.auto, false);
  assert.equal(defaults.modCommands, false);
  assert.equal(settingsSchema.parse({ ...defaults, chatBot: false }).chatBot, false);
  const { chatBot: _unused, ...legacy } = defaults;
  assert.equal(settingsSchema.parse(legacy).chatBot, false);
});

test('shortcuts expose the actual saved state with distinct switch names', () => {
  const html = render({ auto: false, chatBot: true });
  assert.match(html, /role="switch" aria-label="Automatic rounds" aria-checked="false"/);
  assert.match(html, /role="switch" aria-label="Baity announcements" aria-checked="true"/);
  assert.match(html, />Auto rounds</);
  assert.match(html, />Baity</);
  assert.doesNotMatch(html, /Needs setup/);
});

test('enabled announcements distinguish an unavailable bot and disabled controls', () => {
  const html = render({ chatBot: true }, { mode: 'unauthorized', channelAllowed: false }, true);
  assert.match(html, /Needs setup/);
  assert.match(html, /Finish connecting Baity in Stream setup/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(render({ chatBot: false }, { mode: 'unauthorized' }), /Needs setup/);
});
