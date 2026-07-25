import type { AuthConfig } from 'frogbot';

import { extractApiKeyToken, hashApiKeyToken } from './server/token.js';

type StrategyOptions = {
  authCollection: string;
  collectionSlug: string;
  headerNames?: string[];
  tokenPrefix: string;
};

export function createApiKeyStrategy(options: StrategyOptions): NonNullable<AuthConfig['strategies']>[number] {
  const { authCollection, collectionSlug, headerNames, tokenPrefix } = options;
  return {
    name: 'api-key',
    authenticate: async ({ headers, payload }) => {
      const token = extractApiKeyToken(headers, { headerNames });
      if (!token || !new RegExp(`^${tokenPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_[A-Za-z0-9_-]{43}$`).test(token)) {
        return { user: null };
      }

      const keys = await payload.find({
        collection: collectionSlug,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          and: [{ tokenHash: { equals: hashApiKeyToken(token) } }, { revokedAt: { exists: false } }],
        },
      });
      const key = keys.docs[0] as { id: string | number; owner?: string | number } | undefined;
      if (!key?.owner) return { user: null };

      const user = await payload
        .findByID({ collection: authCollection, id: key.owner, depth: 0, overrideAccess: true })
        .catch(() => null);
      if (!user) return { user: null };

      await payload.update({
        collection: collectionSlug,
        id: key.id,
        data: { lastUsedAt: new Date().toISOString() },
        overrideAccess: true,
      });

      return {
        user: {
          ...user,
          collection: authCollection,
          _strategy: 'api-key',
        },
      };
    },
  };
}
