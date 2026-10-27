import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Landing from '../client/Landing';
import { botNotices } from '../client/ui';
import type { SessionInfo } from '../shared/types';

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
