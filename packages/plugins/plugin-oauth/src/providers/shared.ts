import { parseOAuthTokenSet } from '../server/tokens.js';
import type { OAuthAuthorizeContext, OAuthTokenSet } from '../types.js';

export type OAuthProviderOptions = {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  service?: string;
  fetch?: typeof fetch;
};

export function authorizationUrl(options: {
  url: string;
  clientId: string;
  scopes: string[];
  context: OAuthAuthorizeContext;
  params?: Record<string, string>;
}): URL {
  const url = new URL(options.url);
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.context.callbackUrl,
    response_type: 'code',
    scope: options.scopes.join(' '),
    state: options.context.state,
    code_challenge: options.context.codeChallenge,
    code_challenge_method: 'S256',
    ...options.params,
  }).toString();
  return url;
}

export async function tokenRequest(options: {
  fetch: typeof fetch;
  url: string;
  body: Record<string, string | undefined>;
  headers?: HeadersInit;
}): Promise<{ tokens: OAuthTokenSet; value: Record<string, unknown> }> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(options.body)) {
    if (value !== undefined) body.set(key, value);
  }
  const response = await options.fetch(options.url, { method: 'POST', headers: options.headers, body });
  if (!response.ok) throw new Error('OAuth token request failed.');
  const value = await response.json() as Record<string, unknown>;
  return { tokens: parseOAuthTokenSet({ value }), value };
}

export async function jsonRequest(options: { fetch: typeof fetch; url: string; accessToken: string }): Promise<Record<string, unknown>> {
  const response = await options.fetch(options.url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  if (!response.ok) throw new Error('OAuth account request failed.');
  return response.json() as Promise<Record<string, unknown>>;
}

export function basicCredentials(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}
