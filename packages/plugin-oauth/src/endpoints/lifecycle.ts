import type { Endpoint } from 'frogbot';

import { getOAuthConnectionCredentials } from '../server/connections.js';
import type { OAuthEncryption } from '../server/crypto.js';
import { mergeOAuthTokenSets } from '../server/tokens.js';
import type { OAuthProvider, OAuthTokenSet } from '../types.js';
import { getProvider } from './shared.js';

type LifecycleEndpointOptions = {
  paths: { refresh: string; revoke: string };
  connectionsSlug: string;
  ownerField: string;
  providers: Map<string, OAuthProvider>;
  encryption: OAuthEncryption;
};

async function getConnectionId(req: Parameters<Endpoint['handler']>[0]): Promise<string | number | null> {
  const body = (await req.json?.().catch(() => null) ?? null) as { connectionId?: unknown } | null;
  return typeof body?.connectionId === 'string' || typeof body?.connectionId === 'number' ? body.connectionId : null;
}

function serialize(tokens: OAuthTokenSet): string {
  return JSON.stringify({ ...tokens, expiresAt: tokens.expiresAt?.toISOString() });
}

export function createLifecycleEndpoints(options: LifecycleEndpointOptions): Endpoint[] {
  return [
    {
      method: 'post',
      path: options.paths.refresh,
      handler: async (req) => {
        const provider = getProvider({ providers: options.providers, req });
        if (!provider) return Response.json({ error: 'OAuth provider not found' }, { status: 404 });
        if (!provider.refresh) return Response.json({ error: 'OAuth provider does not support refresh' }, { status: 400 });
        const connectionId = await getConnectionId(req);
        if (connectionId === null) return Response.json({ error: 'Connection ID is required' }, { status: 400 });
        const connection = await getOAuthConnectionCredentials({
          req,
          connectionId,
          collectionSlug: options.connectionsSlug,
          ownerField: options.ownerField,
          encryption: options.encryption,
        });
        if (!connection || connection.provider !== provider.id) return Response.json({ error: 'OAuth connection not found' }, { status: 404 });
        try {
          const next = mergeOAuthTokenSets({ current: connection.tokens, next: await provider.refresh({ tokens: connection.tokens, req }) });
          await req.frogbot.update({
            collection: options.connectionsSlug,
            id: connection.id as never,
            data: {
              encryptedTokens: await options.encryption.encrypt(serialize(next)),
              expiresAt: next.expiresAt?.toISOString(),
              scopes: next.scopes,
              status: 'active',
            },
            overrideAccess: true,
            req,
          });
          return Response.json({ id: connection.id, status: 'active', expiresAt: next.expiresAt?.toISOString() });
        } catch {
          await req.frogbot.update({ collection: options.connectionsSlug, id: connection.id as never, data: { status: 'error' }, overrideAccess: true, req });
          return Response.json({ error: 'OAuth token refresh failed' }, { status: 502 });
        }
      },
    },
    {
      method: 'post',
      path: options.paths.revoke,
      handler: async (req) => {
        const provider = getProvider({ providers: options.providers, req });
        if (!provider) return Response.json({ error: 'OAuth provider not found' }, { status: 404 });
        const connectionId = await getConnectionId(req);
        if (connectionId === null) return Response.json({ error: 'Connection ID is required' }, { status: 400 });
        const connection = await getOAuthConnectionCredentials({
          req,
          connectionId,
          collectionSlug: options.connectionsSlug,
          ownerField: options.ownerField,
          encryption: options.encryption,
        });
        if (!connection || connection.provider !== provider.id) return Response.json({ error: 'OAuth connection not found' }, { status: 404 });
        let providerRevoked = true;
        try {
          await provider.revoke?.({ tokens: connection.tokens, req });
        } catch {
          providerRevoked = false;
        }
        await req.frogbot.update({
          collection: options.connectionsSlug,
          id: connection.id as never,
          data: { status: 'revoked' },
          overrideAccess: true,
          req,
        });
        return Response.json({ id: connection.id, status: 'revoked', providerRevoked });
      },
    },
  ];
}
