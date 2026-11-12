import type { AuthStrategy, CollectionMeHook } from 'frogbot';

import { extractApiKeyToken, hashApiKeyToken } from './server/token.js';

export const apiKeyStrategyName = 'api-key';

/** The time an `expiresAt` value names, or `null` when it names none. */
export function expiryTime(value: unknown): number | null {
  const time =
    value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;

  return Number.isNaN(time) ? null : time;
}

/** True when the key has an `expiresAt` that has passed. */
export function isExpiredKey(key: Record<string, unknown>): boolean {
  const time = expiryTime(key.expiresAt);

  return time !== null && time <= Date.now();
}

const lastUsedInterval = 60_000;

function isRecentlyUsed(key: Record<string, unknown>): boolean {
  const time = expiryTime(key.lastUsedAt);

  if (time === null) return false;

  const age = Date.now() - time;

  return age >= -lastUsedInterval && age < lastUsedInterval;
}

const apiKeyStrategies = new WeakSet<AuthStrategy>();

let loggedStampFailure = false;

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
        (typeof key.owner !== 'string' && typeof key.owner !== 'number') ||
        isExpiredKey(key)
      ) {
        return { user: null };
      }

      const user = await frogbot
        .findByID({ collection: authCollection, id: key.owner, depth: 0, overrideAccess: true })
        .catch(() => null);

      if (!user) return { user: null };

      const { tokenHash: _tokenHash, ...apiKey } = key;

      if (!isRecentlyUsed(key)) {
        await frogbot.db
          .updateOne({
            collection: collectionSlug,
            id: key.id,
            data: { lastUsedAt: new Date().toISOString() },
            returning: false,
          })
          .catch((error: unknown) => {
            if (loggedStampFailure) return;

            loggedStampFailure = true;

            frogbot.logger.error(
              { err: error },
              '[plugin-api-keys] Failed to stamp lastUsedAt; sign-in continues and later failures are not logged',
            );
          });
      }

      return {
        user: {
          ...user,
          collection: authCollection,
          _strategy: apiKeyStrategyName,
          apiKeyId: key.id,
          apiKey,
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
