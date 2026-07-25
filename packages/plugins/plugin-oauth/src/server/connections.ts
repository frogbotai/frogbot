import type { FrogbotRequest } from 'frogbot';

import type { OAuthEncryption } from './crypto.js';
import type { OAuthTokenSet } from '../types.js';

export type OAuthConnectionCredentials = {
  id: string | number;
  sourceKey: string;
  accountId: string;
  tokens: OAuthTokenSet;
};

export async function getOAuthConnectionCredentials(options: {
  req: FrogbotRequest;
  connectionId: string | number;
  collectionSlug?: string;
  encryption: OAuthEncryption;
}): Promise<OAuthConnectionCredentials | null> {
  const owner = options.req.user?.id;
  if (owner === undefined) return null;
  const result = await options.req.frogbot.find({
    collection: (options.collectionSlug ?? 'connections') as never,
    limit: 1,
    overrideAccess: true,
    req: options.req,
    where: { and: [
      { id: { equals: options.connectionId } },
      { owner: { equals: owner } },
    ] },
  });
  const connection = result.docs[0] as Record<string, unknown> | undefined;
  if (!connection || typeof connection.encryptedCredentials !== 'string' || typeof connection.sourceKey !== 'string' || typeof connection.accountId !== 'string') return null;
  const value = JSON.parse(await options.encryption.decrypt(connection.encryptedCredentials)) as Record<string, unknown>;
  return {
    id: connection.id as string | number,
    sourceKey: connection.sourceKey,
    accountId: connection.accountId,
    tokens: {
      accessToken: String(value.access_token ?? ''),
      ...(typeof value.refresh_token === 'string' ? { refreshToken: value.refresh_token } : {}),
      ...(typeof connection.expiresAt === 'string' ? { expiresAt: new Date(connection.expiresAt) } : {}),
      ...(typeof value.scope === 'string' ? { scopes: value.scope.split(' ').filter(Boolean) } : {}),
      ...(typeof value.token_type === 'string' ? { tokenType: value.token_type } : {}),
      ...(typeof value.id_token === 'string' ? { idToken: value.id_token } : {}),
      ...(typeof value.data === 'object' && value.data ? { metadata: value.data as Record<string, unknown> } : {}),
    },
  };
}
