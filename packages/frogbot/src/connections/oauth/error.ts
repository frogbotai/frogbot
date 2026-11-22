export class OAuthError extends Error {
  constructor(
    public readonly code: 'state' | 'configuration' | 'tokens' | 'account' | 'refresh' | 'signUp',
    {
      cause,
      message = `OAuth ${code} validation failed.`,
    }: { cause?: unknown; message?: string } = {},
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'OAuthError';
  }
}
