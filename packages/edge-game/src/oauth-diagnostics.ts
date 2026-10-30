export type OAuthPhase = 'state' | 'token-exchange' | 'token-validation' | 'identity' | 'session-storage';

/** Keep provider bodies, tokens, URLs and arbitrary exception text out of logs. */
export class OAuthProviderError extends Error {
  constructor(readonly status: number) { super('oauth_provider_rejected'); }
}

const reasons = new Set(['provider_redirect', 'token_exchange_failed', 'invalid_token_response', 'invalid_refresh_token', 'token_revoked',
  'validation_unavailable', 'identity_unavailable', 'identity_mismatch', 'control_busy', 'control_record_capacity', 'control_capacity']);

export function oauthDiagnostic(phase: OAuthPhase, error: unknown) {
  const reason = error instanceof OAuthProviderError ? 'provider_rejected' :
    error instanceof Error && reasons.has(error.message) ? error.message :
    error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name) ? 'provider_timeout' :
    error instanceof TypeError ? 'runtime_or_network' : 'unexpected_failure';
  const providerStatus = error instanceof OAuthProviderError && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
  return { event: 'baited_oauth_failure', phase, reason, ...(providerStatus ? { providerStatus } : {}) };
}
