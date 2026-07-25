import type { FrogbotRequest } from 'frogbot';

import type { OAuthEncryption } from './crypto.js';
import type { OAuthTokenSet } from '../types.js';

export type OAuthConnectionCredentials = {
  id: string | number;
  provider: string;
  providerAccountId: string;
  tokens: OAuthTokenSet;
};

export async function getOAuthConnectionCredentials(options: {
  req: FrogbotRequest;
  connectionId: string | number;
  collectionSlug?: string;
  ownerField?: string;
  encryption: OAuthEncryption;
}): Promise<OAuthConnectionCredentials | null> {
  const owner = options.req.user?.id;
  if (owner === undefined) return null;
  const result = await options.req.frogbot.find({
    collection: (options.collectionSlug ?? 'oauth-connections') as never,
    limit: 1,
    overrideAccess: true,
    req: options.req,
    where: { and: [
      { id: { equals: options.connectionId } },
      { [options.ownerField ?? 'owner']: { equals: owner } },
    ] },
  });
  const connection = result.docs[0] as Record<string, unknown> | undefined;
  if (!connection || typeof connection.encryptedTokens !== 'string' || typeof connection.provider !== 'string' || typeof connection.providerAccountId !== 'string') return null;
  const value = JSON.parse(await options.encryption.decrypt(connection.encryptedTokens)) as OAuthTokenSet & { expiresAt?: string };
  return {
    id: connection.id as string | number,
    provider: connection.provider,
    providerAccountId: connection.providerAccountId,
    tokens: { ...value, ...(value.expiresAt ? { expiresAt: new Date(value.expiresAt) } : {}) },
  };
}
