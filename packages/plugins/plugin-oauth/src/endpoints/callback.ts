import type { Endpoint, FrogbotRequest } from 'frogbot';

import type { OAuthEncryption } from '../server/crypto.js';
import { getSafeOAuthError } from '../server/error.js';
import { isOAuthStateExpired } from '../server/state.js';
import type { OAuthProvider, OAuthTokenSet } from '../types.js';
import { getProvider, withOAuthResult } from './shared.js';

type CallbackEndpointOptions = {
  path: string;
  baseUrl: string;
  statesSlug: string;
  connectionsSlug: string;
  ownerField: string;
  providers: Map<string, OAuthProvider>;
  encryption: OAuthEncryption;
};

type StateDocument = {
  id: string | number;
  provider: string;
  returnUrl: string;
  codeVerifier: string;
  expiresAt: string;
  [key: string]: unknown;
};

async function extractCallback(req: FrogbotRequest): Promise<{ code?: string; state?: string; error?: string }> {
  if (req.method === 'GET') {
    return {
      code: req.searchParams.get('code') ?? undefined,
      state: req.searchParams.get('state') ?? undefined,
      error: req.searchParams.get('error') ?? undefined,
    };
  }
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = new URLSearchParams(await req.text?.() ?? '');
    return { code: body.get('code') ?? undefined, state: body.get('state') ?? undefined, error: body.get('error') ?? undefined };
  }
  const body = (await req.json?.().catch(() => ({})) ?? {}) as Record<string, unknown>;
  return {
    code: typeof body.code === 'string' ? body.code : undefined,
    state: typeof body.state === 'string' ? body.state : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
  };
}

function serializeTokens(tokens: OAuthTokenSet): string {
  return JSON.stringify({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: tokens.expiresAt ? Math.max(0, Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000)) : undefined,
    scope: tokens.scopes?.join(' '),
    token_type: tokens.tokenType,
    id_token: tokens.idToken,
    data: tokens.metadata,
  });
}

export function createCallbackEndpoints(options: CallbackEndpointOptions): Endpoint[] {
  const handler: Endpoint['handler'] = async (req) => {
    const provider = getProvider({ providers: options.providers, req });
    if (!provider) return Response.json({ error: 'OAuth provider not found' }, { status: 404 });
    const callback = await extractCallback(req);
    if (!callback.state) return Response.json({ error: 'OAuth state is required' }, { status: 400 });
    const consumed = await req.frogbot.delete({
      collection: options.statesSlug as never,
      overrideAccess: true,
      req,
      where: { and: [{ state: { equals: callback.state } }, { provider: { equals: provider.id } }] },
    });
    const state = consumed.docs[0] as StateDocument | undefined;
    if (!state || isOAuthStateExpired({ expiresAt: state.expiresAt })) {
      return Response.json({ error: 'OAuth state is invalid or expired' }, { status: 400 });
    }
    if (callback.error) return Response.redirect(withOAuthResult({ returnUrl: state.returnUrl, error: 'access_denied' }));
    if (!callback.code) return Response.redirect(withOAuthResult({ returnUrl: state.returnUrl, error: 'invalid_request' }));
    try {
      const callbackUrl = new URL(options.path.replace(':provider', provider.id), options.baseUrl).toString();
      const tokens = await provider.exchange({ callbackUrl, code: callback.code, codeVerifier: state.codeVerifier, req });
      const account = await provider.getAccount({ tokens, req });
      const owner = state[options.ownerField];
      const existing = await req.frogbot.find({
        collection: options.connectionsSlug as never,
        limit: 1,
        overrideAccess: true,
        req,
        where: { and: [
          { owner: { equals: owner } },
          { sourceKey: { equals: provider.id } },
          { accountId: { equals: account.id } },
        ] },
      });
      const data = {
        owner,
        service: provider.service,
        source: 'oauth',
        sourceKey: provider.id,
        credentialType: 'oauth2',
        accountId: account.id,
        accountLabel: account.name ?? account.email,
        encryptedCredentials: await options.encryption.encrypt(serializeTokens(tokens)),
        expiresAt: tokens.expiresAt?.toISOString(),
        scopes: tokens.scopes,
        status: 'active',
        metadata: account.metadata,
      };
      const current = existing.docs[0] as Record<string, unknown> | undefined;
      const connection = current
        ? await req.frogbot.update({ collection: options.connectionsSlug as never, id: current.id as never, data, overrideAccess: true, req })
        : await req.frogbot.create({ collection: options.connectionsSlug as never, data, overrideAccess: true, req });
      return Response.redirect(withOAuthResult({ returnUrl: state.returnUrl, connection: connection.id }));
    } catch (error) {
      const safe = getSafeOAuthError(error);
      return Response.redirect(withOAuthResult({ returnUrl: state.returnUrl, error: safe.code }));
    }
  };
  return [{ method: 'get', path: options.path, handler }, { method: 'post', path: options.path, handler }];
}
