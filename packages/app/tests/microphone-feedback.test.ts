import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MicrophoneFeedback } from '../client/microphone-feedback';
import { microphoneLeaseMessage } from '../client/safety';

test('microphone feedback keeps a persistent actionable alert ahead of transient retry status', () => {
  const render = (issue: string, recovering = false) => renderToStaticMarkup(React.createElement(MicrophoneFeedback, { issue, recovering }));
  assert.equal(render(''), '');
  assert.match(render('', true), /role="status"[^>]*>Retrying the microphone check/);
  assert.match(render('Enable it again.', true), /class="error-banner mic-feedback" role="alert"/);
  assert.doesNotMatch(render('Enable it again.', true), /Retrying/);
});

test('microphone lease copy uses only known metadata and hides arbitrary server details', () => {
  assert.match(microphoneLeaseMessage({ code: 'lease_owner', message: 'PRIVATE' }), /another Studio tab/);
  assert.match(microphoneLeaseMessage({ status: 401 }), /Reconnect Twitch/);
  assert.match(microphoneLeaseMessage({ status: 429 }), /rate-limited/);
  assert.doesNotMatch(microphoneLeaseMessage({ code: 'PRIVATE', message: 'PRIVATE' }), /PRIVATE/);
});
