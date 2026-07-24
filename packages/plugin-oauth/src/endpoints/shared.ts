import type { FrogbotRequest } from 'frogbot';

import type { OAuthProvider } from '../types.js';

export function getProvider({ providers, req }: { providers: Map<string, OAuthProvider>; req: FrogbotRequest }): OAuthProvider | null {
  const id = req.routeParams?.provider;
  return typeof id === 'string' ? providers.get(id) ?? null : null;
}

export function isRSCRequest(req: FrogbotRequest): boolean {
  return req.headers.get('RSC') === '1' || req.headers.has('Next-Router-State-Tree') || req.headers.has('Next-Router-Prefetch') || req.searchParams.has('_rsc');
}

export function getReturnUrl({ allowedOrigins, baseUrl, value }: { allowedOrigins: string[]; baseUrl: string; value: string | null }): string {
  if (!value) return new URL('/', baseUrl).toString();
  if (value.startsWith('/') && !value.startsWith('//')) return new URL(value, baseUrl).toString();
  const url = new URL(value);
  if (!allowedOrigins.includes(url.origin)) throw new Error('Return URL is not allowed.');
  return url.toString();
}

export function withOAuthResult({ returnUrl, error, connection }: { returnUrl: string; error?: string; connection?: string | number }): string {
  const url = new URL(returnUrl);
  if (error) url.searchParams.set('oauth_error', error);
  if (connection !== undefined) url.searchParams.set('oauth_connection', String(connection));
  return url.toString();
}
