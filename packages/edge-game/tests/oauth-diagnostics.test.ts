import assert from 'node:assert/strict';
import test from 'node:test';
import { oauthDiagnostic, OAuthProviderError } from '../src/oauth-diagnostics.js';

test('OAuth diagnostics expose only fixed categories and bounded provider status', () => {
  assert.deepEqual(oauthDiagnostic('token-exchange', new OAuthProviderError(400)), {
    event: 'baited_oauth_failure', phase: 'token-exchange', reason: 'provider_rejected', providerStatus: 400,
  });
  assert.equal(oauthDiagnostic('token-validation', new Error('token_revoked')).reason, 'token_revoked');
  assert.equal(oauthDiagnostic('identity', new DOMException('sensitive fixture text', 'TimeoutError')).reason, 'provider_timeout');
  for (const error of [new Error('fixture-secret=never-log-me'), new TypeError('fixture-secret=never-log-me'),
    { message: 'fixture-secret=never-log-me' }, 'fixture-secret=never-log-me', new OAuthProviderError(200)]) {
    const value = JSON.stringify(oauthDiagnostic('session-storage', error));
    assert(!value.includes('never-log-me'));
    assert(!value.includes('"providerStatus":200'));
  }
});
