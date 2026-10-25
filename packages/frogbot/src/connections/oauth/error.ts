export class OAuthError extends Error {
  constructor(
    public readonly code: 'state' | 'configuration' | 'tokens' | 'account' | 'refresh' | 'signUp',
  ) {
    super(`OAuth ${code} validation failed.`);
    this.name = 'OAuthError';
  }
}
