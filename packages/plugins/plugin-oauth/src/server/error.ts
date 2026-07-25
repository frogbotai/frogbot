export type OAuthErrorCode = 'invalid_request' | 'invalid_state' | 'provider_error' | 'unsupported_provider';

export class OAuthError extends Error {
  constructor(public code: OAuthErrorCode, message: string, public status = 400) {
    super(message);
    this.name = 'OAuthError';
  }
}

export function getSafeOAuthError(error: unknown): OAuthError {
  return error instanceof OAuthError ? error : new OAuthError('provider_error', 'The OAuth provider request failed.', 502);
}
