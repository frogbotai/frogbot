import {
  APIError,
  type AuthStrategy,
  type CollectionBeforeOperationHook,
  type CollectionMeHook,
} from 'frogbot';
import { toPayloadRequest } from 'frogbot/internal';

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

const refusals = new WeakMap<object, string>();

function refusalMessage(key: Record<string, unknown>, mintPath: string): string | undefined {
  const revokedAt = key.revokedAt == null ? null : (expiryTime(key.revokedAt) ?? Date.now());
  const expiresAt = isExpiredKey(key) ? expiryTime(key.expiresAt) : null;
  const reason =
    revokedAt !== null
      ? `was revoked at ${new Date(revokedAt).toISOString()}`
      : expiresAt !== null
        ? `expired at ${new Date(expiresAt).toISOString()}`
        : undefined;

  return reason && `API key ${reason}. Mint a new one with POST ${mintPath}.`;
}

/**
 * Why the request's API key was refused, when it named a key that was revoked or has expired.
 * The caller already holds the token, so saying so leaks nothing.
 */
export function apiKeyRefusal(req: object | null | undefined): string | undefined {
  return req ? refusals.get(req) : undefined;
}

/** The `error` and `error_description` of a `WWW-Authenticate: Bearer` challenge for a refused key. */
export function apiKeyChallenge(message: string): string {
  return `error="invalid_token", error_description="${message}"`;
}

/** Answers an operation run as the caller with 401 and the reason, when its only credential was a refused key. */
export const refuseRejectedApiKey: CollectionBeforeOperationHook = ({ overrideAccess, req }) => {
  const message = req.user || overrideAccess ? undefined : apiKeyRefusal(req);

  if (!message) return;

  req.responseHeaders = new Headers(req.responseHeaders);
  req.responseHeaders.set('WWW-Authenticate', `Bearer ${apiKeyChallenge(message)}`);

  throw new APIError(message, 401, null, true);
};

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
    authenticate: async ({ frogbot, headers, req }) => {
      const token = extractApiKeyToken(headers, { headerNames, tokenPrefix });

      if (!token) return { user: null };

      const keys = await frogbot.find({
        collection: collectionSlug,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: { tokenHash: { equals: hashApiKeyToken(token) } },
      });

      const key = keys.docs[0];

      if (
        !key ||
        (typeof key.id !== 'string' && typeof key.id !== 'number') ||
        (typeof key.owner !== 'string' && typeof key.owner !== 'number')
      ) {
        return { user: null };
      }

      const api = req ? toPayloadRequest(req).payload.config.routes.api : '/api';
      const refusal = refusalMessage(key, `${api.replace(/\/+$/, '')}/${collectionSlug}/mint`);

      if (refusal) {
        if (req) refusals.set(req, refusal);

        return { user: null };
      }

      const user = await frogbot
        .findByID({ collection: authCollection, id: key.owner, depth: 0, overrideAccess: true })
        .catch(() => null);

      if (!user) return { user: null };

      const { tokenHash: _tokenHash, ...apiKey } = key;

      if (!isRecentlyUsed(key)) {
        await frogbot
          .update({
            collection: collectionSlug,
            id: key.id,
            data: { lastUsedAt: new Date().toISOString() },
            overrideAccess: true,
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
