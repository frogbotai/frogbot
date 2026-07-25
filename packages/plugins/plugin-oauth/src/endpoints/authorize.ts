import type { Endpoint } from 'frogbot';

import { createPKCECodes } from '../server/pkce.js';
import { createOAuthState, createOAuthStateExpiration } from '../server/state.js';
import type { OAuthProvider } from '../types.js';
import { getProvider, getReturnUrl, isRSCRequest } from './shared.js';

type AuthorizeEndpointOptions = {
  path: string;
  callbackPath: string;
  baseUrl: string;
  allowedReturnOrigins: string[];
  statesSlug: string;
  ownerField: string;
  providers: Map<string, OAuthProvider>;
};

export function createAuthorizeEndpoint(options: AuthorizeEndpointOptions): Endpoint {
  return {
    method: 'get',
    path: options.path,
    handler: async (req) => {
      if (isRSCRequest(req)) return new Response(null, { status: 204 });
      const provider = getProvider({ providers: options.providers, req });
      if (!provider) return Response.json({ error: 'OAuth provider not found' }, { status: 404 });
      const owner = req.user?.id;
      if (owner === undefined) return Response.json({ error: 'Authentication required' }, { status: 401 });
      let returnUrl: string;
      try {
        returnUrl = getReturnUrl({
          allowedOrigins: options.allowedReturnOrigins,
          baseUrl: options.baseUrl,
          value: req.searchParams.get('returnUrl'),
        });
      } catch {
        return Response.json({ error: 'Return URL is not allowed' }, { status: 400 });
      }
      const state = createOAuthState();
      const pkce = createPKCECodes();
      const callbackUrl = new URL(options.callbackPath.replace(':provider', provider.id), options.baseUrl).toString();
      await req.frogbot.create({
        collection: options.statesSlug as never,
        data: {
          state,
          [options.ownerField]: owner,
          provider: provider.id,
          returnUrl,
          codeVerifier: pkce.verifier,
          expiresAt: createOAuthStateExpiration().toISOString(),
        },
        overrideAccess: true,
        req,
      });
      const url = await provider.authorize({ callbackUrl, codeChallenge: pkce.challenge, state });
      return Response.redirect(url);
    },
  };
}
