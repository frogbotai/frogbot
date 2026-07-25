import type { OAuthTokenSet } from '../types.js';

export function parseOAuthTokenSet({ value, now = new Date() }: { value: Record<string, unknown>; now?: Date }): OAuthTokenSet {
  if (typeof value.access_token !== 'string' || !value.access_token) throw new Error('OAuth provider did not return an access token.');
  const expiresIn = typeof value.expires_in === 'number' ? value.expires_in : Number(value.expires_in);
  const scope = typeof value.scope === 'string' ? value.scope.split(/\s+/).filter(Boolean) : undefined;
  return {
    accessToken: value.access_token,
    ...(typeof value.refresh_token === 'string' ? { refreshToken: value.refresh_token } : {}),
    ...(Number.isFinite(expiresIn) ? { expiresAt: new Date(now.getTime() + expiresIn * 1000) } : {}),
    ...(scope?.length ? { scopes: scope } : {}),
    ...(typeof value.token_type === 'string' ? { tokenType: value.token_type } : {}),
    ...(typeof value.id_token === 'string' ? { idToken: value.id_token } : {}),
  };
}

export function mergeOAuthTokenSets({ current, next }: { current: OAuthTokenSet; next: OAuthTokenSet }): OAuthTokenSet {
  return {
    ...current,
    ...next,
    refreshToken: next.refreshToken ?? current.refreshToken,
  };
}
