import { APIError, type AuthStrategy, type CollectionMeHook } from 'frogbot';
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

const refusalKey = Symbol.for('@frogbotai/plugin-api-keys/refusal');

const signInOperations = new Set(['forgotPassword', 'login', 'resetPassword']);

function refusalReason(key: Record<string, unknown>): string | undefined {
  if (key.revokedAt != null) {
    return `was revoked at ${new Date(expiryTime(key.revokedAt) ?? Date.now()).toISOString()}`;
  }

  const expiresAt = expiryTime(key.expiresAt);

  if (expiresAt !== null && expiresAt <= Date.now()) {
    return `expired at ${new Date(expiresAt).toISOString()}`;
  }
}

/**
 * Why the request's API key was refused, when it named a key that was revoked or has expired.
 * The caller already holds the token, so saying so leaks nothing.
 */
export function apiKeyRefusal(req: object | null | undefined): string | undefined {
  const refusal: unknown = req ? Reflect.get(req, refusalKey) : undefined;

  return typeof refusal === 'string' ? refusal : undefined;
}

/** The `error` and `error_description` of a `WWW-Authenticate: Bearer` challenge for a refused key. */
export function apiKeyChallenge(message: string): string {
  return `error="invalid_token", error_description="${message}"`;
}

/** Answers an operation run as the caller with 401 and the reason, when its only credential was a refused key. */
export function refuseRejectedApiKey({
  operation,
  overrideAccess,
  req,
}: {
  operation: string;
  overrideAccess?: boolean;
  req: { responseHeaders?: Headers; user?: unknown };
}): void {
  const message =
    req.user || overrideAccess || signInOperations.has(operation) ? undefined : apiKeyRefusal(req);

  if (!message) return;

  req.responseHeaders = new Headers(req.responseHeaders);
  req.responseHeaders.set('WWW-Authenticate', `Bearer ${apiKeyChallenge(message)}`);

  throw new APIError(message, 401, null, true);
}

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

      const reason = refusalReason(key);

      if (reason) {
        if (req) {
          const api = toPayloadRequest(req).payload.config.routes.api.replace(/\/+$/, '');

          Object.defineProperty(req, refusalKey, {
            configurable: true,
            value: `API key ${reason}. Mint a new one with POST ${api}/${collectionSlug}/mint.`,
          });
        }

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
