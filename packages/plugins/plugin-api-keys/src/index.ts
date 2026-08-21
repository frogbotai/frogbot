import { type CollectionConfig, type FrogbotRequest, type Plugin } from 'frogbot';

import { createApiKeysCollection } from './collection.js';
import { createApiKeyStrategy } from './strategy.js';

export type {
  MintApiKeyOptions,
  RevokeApiKeyOptions,
  RotateApiKeyOptions,
} from './server/services.js';
export { ApiKeyServiceError, mintApiKey, revokeApiKey, rotateApiKey } from './server/services.js';
export type { ApiKeyHeaderOptions, ApiKeyTokenOptions } from './server/token.js';
export {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './server/token.js';
export type { ApiKeyStrategy } from './strategy.js';
export { isApiKeyStrategy } from './strategy.js';

export type ApiKeysPluginOptions = {
  authCollection?: string;
  collectionSlug?: string;
  tokenPrefix?: string;
  headerNames?: string[];
  collection?: Partial<CollectionConfig>;
  canRevokeAnyKey?: (req: FrogbotRequest) => boolean | Promise<boolean>;
};

export function apiKeysPlugin(options: ApiKeysPluginOptions = {}): Plugin {
  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const collectionSlug = options.collectionSlug ?? 'api-keys';
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(
        `[plugin-api-keys] Auth collection '${authCollection}' must exist and have auth enabled.`,
      );
    }
    const existing = config.collections.find((collection) => collection.slug === collectionSlug);
    const usageLog = config.ai
      ? (config.collections.find((item) => item.usageLog === true) ?? {
          slug: 'usage-logs',
          usageLog: true,
          fields: [],
        })
      : undefined;
    const collection = createApiKeysCollection({
      authCollection,
      collectionSlug,
      tokenPrefix: options.tokenPrefix ?? 'fb',
      usageCollection: usageLog?.slug,
      canRevokeAnyKey: options.canRevokeAnyKey,
      collection: options.collection,
      existing,
    });
    const strategy = createApiKeyStrategy({
      authCollection,
      collectionSlug,
      headerNames: options.headerNames,
      tokenPrefix: options.tokenPrefix ?? 'fb',
    });
    const usageField = {
      name: 'apiKey',
      type: 'relationship' as const,
      relationTo: collectionSlug,
      index: true,
    };
    const collections = config.collections.map((item) => {
      let next = item;
      if (item.slug === collectionSlug) next = collection;
      if (item.slug === authCollection) {
        const authConfig = typeof next.auth === 'object' ? next.auth : {};
        next = {
          ...next,
          auth: { ...authConfig, strategies: [...(authConfig.strategies ?? []), strategy] },
        };
      }
      if (item === usageLog) next = { ...next, fields: [...next.fields, usageField] };
      return next;
    });
    return {
      ...config,
      collections: [
        ...collections,
        ...(existing ? [] : [collection]),
        ...(usageLog && !config.collections.includes(usageLog)
          ? [{ ...usageLog, fields: [usageField] }]
          : []),
      ],
      ...(config.ai && {
        ai: {
          ...config.ai,
          hooks: {
            ...config.ai.hooks,
            beforeOperation: [
              ...(config.ai.hooks?.beforeOperation ?? []),
              ({ req, context }) => {
                if (req?.user && 'apiKeyId' in req.user && typeof req.user.apiKeyId === 'string') {
                  context.usageFields = { apiKey: req.user.apiKeyId };
                }
              },
            ],
          },
        },
      }),
    };
  };
}
