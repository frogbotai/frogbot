import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

import { DISCOVERY_URL, ISSUER, JWKS_URL, RESOURCE, TOKEN_URL } from './constants.js';

const REQUEST_TIMEOUT_MS = 15_000;

const tokenResponse = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional(),
    id_token: z.string().min(1).optional(),
    expires_in: z.number().nonnegative().optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
  })
  .loose();

export type ChatGPTTokens = z.output<typeof tokenResponse>;

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

async function post(url: string, body: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function requestTokens(body: Record<string, string>): Promise<ChatGPTTokens> {
  const response = await post(TOKEN_URL, body);

  if (!response.ok) throw new Error(`OpenAI's token endpoint answered ${response.status}.`);

  return tokenResponse.parse(await response.json());
}

/** Exchanges a callback code with no client secret, as a public client. */
export function exchangeCode({
  code,
  clientId,
  redirectUri,
  verifier,
}: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
}): Promise<ChatGPTTokens> {
  return requestTokens({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: RESOURCE,
  });
}

/** Renews a token set with the registration's issued client ID. */
export function refreshTokens({
  refreshToken,
  clientId,
}: {
  refreshToken: string;
  clientId: string;
}): Promise<ChatGPTTokens> {
  return requestTokens({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    resource: RESOURCE,
  });
}

/** Ends the renewable session at the discovery document's `revocation_endpoint`. */
export async function revokeRefreshToken({
  refreshToken,
  clientId,
}: {
  refreshToken: string;
  clientId: string;
}): Promise<void> {
  const discovery = await fetch(DISCOVERY_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

  if (!discovery.ok) throw new Error(`OpenAI's discovery document answered ${discovery.status}.`);

  const { revocation_endpoint: endpoint } = z
    .object({ revocation_endpoint: z.url() })
    .parse(await discovery.json());

  const response = await post(endpoint, {
    token: refreshToken,
    token_type_hint: 'refresh_token',
    client_id: clientId,
  });

  if (!response.ok) throw new Error(`OpenAI's revocation endpoint answered ${response.status}.`);
}

/**
 * Checks an ID token against OpenAI's published keys: RS256 signature, issuer, the issued client
 * ID as audience, expiry, subject and this attempt's nonce. Returns its subject and email.
 */
export async function verifyIDToken({
  token,
  clientId,
  nonce,
}: {
  token: string;
  clientId: string;
  nonce: string;
}): Promise<{ sub: string; email?: string }> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER,
    audience: clientId,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'nonce', 'sub'],
  });

  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    throw new Error('The ID token has no subject.');
  }

  if (payload.nonce !== nonce) throw new Error('The ID token is for another sign-in attempt.');

  const email = z.email().safeParse(payload.email);

  return { sub: payload.sub, ...(email.success ? { email: email.data } : {}) };
}
