import type { CollectionConfig, Plugin } from 'frogbot';

import { createApiKeysCollection } from './collection.js';
import { createApiKeyStrategy } from './strategy.js';

export type { ApiKeyHeaderOptions, ApiKeyTokenOptions } from './server/token.js';
export {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './server/token.js';

export type ApiKeysPluginOptions = {
  authCollection?: string;
  collectionSlug?: string;
  tokenPrefix?: string;
  headerNames?: string[];
  collection?: Partial<CollectionConfig>;
};

export function apiKeysPlugin(options: ApiKeysPluginOptions = {}): Plugin {
  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const collectionSlug = options.collectionSlug ?? 'api-keys';
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(`[plugin-api-keys] Auth collection '${authCollection}' must exist and have auth enabled.`);
    }
    const existing = config.collections.find((collection) => collection.slug === collectionSlug);
    const usageLog = config.ai
      ? config.collections.find((item) => item.usageLog === true) ?? {
          slug: 'usage-logs',
          usageLog: true,
          fields: [],
        }
      : undefined;
    const collection = createApiKeysCollection({
      authCollection,
      collectionSlug,
      tokenPrefix: options.tokenPrefix ?? 'fb',
      usageCollection: usageLog?.slug,
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
          auth: {
            ...authConfig,
            strategies: [...(authConfig.strategies ?? []), strategy],
          },
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
      ...(config.ai
        ? {
            ai: {
              ...config.ai,
              hooks: {
                ...config.ai.hooks,
                beforeOperation: [
                  ...(config.ai.hooks?.beforeOperation ?? []),
                  (args) => {
                    const apiKeyId = args.req?.user?.apiKeyId;
                    if (apiKeyId === undefined) return;
                    args.context.usageFields = {
                      ...(args.context.usageFields as Record<string, unknown> | undefined),
                      apiKey: apiKeyId,
                    };
                  },
                ],
              },
            },
          }
        : {}),
    };
  };
}
