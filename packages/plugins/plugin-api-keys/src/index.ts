import type { CollectionConfig, Plugin } from 'frogbot';
import { createApiKeysCollection } from './collection.js';
import { createApiKeyStrategy } from './strategy.js';

export {
  createApiKeyToken,
  extractApiKeyToken,
  getApiKeyPrefix,
  hashApiKeyToken,
} from './server/token.js';
export type { ApiKeyHeaderOptions, ApiKeyTokenOptions } from './server/token.js';

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
    const collection = createApiKeysCollection({
      authCollection,
      collectionSlug,
      tokenPrefix: options.tokenPrefix ?? 'fbt',
      collection: options.collection,
      existing,
    });
    const strategy = createApiKeyStrategy({
      authCollection,
      collectionSlug,
      headerNames: options.headerNames,
      tokenPrefix: options.tokenPrefix ?? 'fbt',
    });
    return {
      ...config,
      collections: [
        ...config.collections.map((item) => {
          if (item.slug === collectionSlug) return collection;
          if (item.slug !== authCollection) return item;
          const authConfig = typeof item.auth === 'object' ? item.auth : {};
          return {
            ...item,
            auth: {
              ...authConfig,
              strategies: [...(authConfig.strategies ?? []), strategy],
            },
          };
        }),
        ...(existing ? [] : [collection]),
      ],
    };
  };
}
