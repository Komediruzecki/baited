import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Landing from '../client/Landing';
import { AllowBotButton, botNotices, BotSignInLink } from '../client/ui';
import type { Phase, SessionInfo } from '../shared/types';

const session = { authenticated: false, twitchReady: true, demoAvailable: false } as SessionInfo;
const landing = (notice: string, info: SessionInfo = session) => {
  const previous = (globalThis as { location?: unknown }).location;
  (globalThis as { location?: unknown }).location = { search: `?notice=${notice}`, pathname: '/' };
  try {
    return renderToStaticMarkup(React.createElement(Landing, { session: info, reload: () => {} }));
  } finally {
    (globalThis as { location?: unknown }).location = previous;
  }
};

test('a sign-in that dropped the bot permission says so on the landing page and in the studio', () => {
  const text = botNotices.errors['bot-declined'];
  assert.match(text, /Allow the bot in Stream setup/);
  assert.doesNotMatch(text, /—/);
  assert.match(landing('bot-declined'), /Allow the bot in Stream setup/);
});

test('a bot sign-in that did not finish links back to the bot sign-in, not only Connect Twitch', () => {
  for (const notice of ['bot-oauth', 'bot-account']) {
    const html = landing(notice);
    assert.match(html, new RegExp(botNotices.errors[notice].slice(0, 30)));
    assert.match(html, /href="\/auth\/twitch\/bot"[^>]*>Sign in as the bot account/);
  }
  assert.match(botNotices.errors['bot-oauth'], /bot account sign-in did not finish/i);
  // A streamer's own failed sign-in offers no bot link.
  assert.doesNotMatch(landing('oauth'), /auth\/twitch\/bot/);
  // The studio shows the same link inside its notice banner.
  const banner = renderToStaticMarkup(React.createElement(BotSignInLink, { notice: 'bot-oauth' }));
  assert.match(banner, /href="\/auth\/twitch\/bot"/);
  assert.equal(renderToStaticMarkup(React.createElement(BotSignInLink, { notice: 'oauth' })), '');
});

test('allowing the bot waits until no round is running, and says why', () => {
  const render = (phase: Phase) => renderToStaticMarkup(React.createElement(AllowBotButton, { phase }));
  for (const phase of ['active', 'paused', 'settling'] as const) {
    const html = render(phase);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Allow the bot in your chat/, phase);
    assert.match(html, /Finish the round first\./, phase);
  }
  for (const phase of ['idle', 'cooldown'] as const) {
    const html = render(phase);
    assert.doesNotMatch(html, /disabled/, phase);
    assert.doesNotMatch(html, /Finish the round first/, phase);
  }
});
