import type { AuthStrategy, CollectionMeHook } from 'frogbot';

import { extractApiKeyToken, hashApiKeyToken } from './server/token.js';

export const apiKeyStrategyName = 'api-key';

const apiKeyStrategies = new WeakSet<AuthStrategy>();

type StrategyOptions = {
  authCollection: string;
  collectionSlug: string;
  headerNames?: string[];
  tokenPrefix: string;
};

export function createApiKeyStrategy(options: StrategyOptions): AuthStrategy {
  const { authCollection, collectionSlug, headerNames, tokenPrefix } = options;
  const strategy: AuthStrategy = {
    name: apiKeyStrategyName,
    authenticate: async ({ frogbot, headers }) => {
      const token = extractApiKeyToken(headers, { headerNames, tokenPrefix });

      if (!token) return { user: null };

      const keys = await frogbot.find({
        collection: collectionSlug,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: {
          and: [
            { tokenHash: { equals: hashApiKeyToken(token) } },
            { revokedAt: { exists: false } },
          ],
        },
      });

      const key = keys.docs[0];

      if (
        !key ||
        (typeof key.id !== 'string' && typeof key.id !== 'number') ||
        (typeof key.owner !== 'string' && typeof key.owner !== 'number')
      ) {
        return { user: null };
      }

      const user = await frogbot
        .findByID({ collection: authCollection, id: key.owner, depth: 0, overrideAccess: true })
        .catch(() => null);

      if (!user) return { user: null };

      await frogbot.update({
        collection: collectionSlug,
        id: key.id,
        data: { lastUsedAt: new Date().toISOString() },
        overrideAccess: true,
      });

      return {
        user: {
          ...user,
          collection: authCollection,
          _strategy: apiKeyStrategyName,
          apiKeyId: key.id,
          ...(key.capture !== undefined ? { capture: key.capture } : {}),
          ...(typeof key.captureSampleRate === 'number'
            ? { captureSampleRate: key.captureSampleRate }
            : {}),
        },
      };
    },
  };

  apiKeyStrategies.add(strategy);

  return strategy;
}

export function isApiKeyStrategy(strategy: AuthStrategy): boolean {
  return apiKeyStrategies.has(strategy);
}

export const apiKeyMeHook: CollectionMeHook = ({ user }) => {
  if (user?._strategy !== apiKeyStrategyName) return;

  return { user } as Awaited<ReturnType<CollectionMeHook>>;
};
