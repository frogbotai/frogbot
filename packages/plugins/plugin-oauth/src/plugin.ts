import type { Plugin } from 'frogbot';

import { createOAuthConnectionsCollection } from './collections/connections.js';
import { createOAuthStatesCollection } from './collections/states.js';
import { createOAuthEndpoints } from './endpoints/index.js';
import { createOAuthEncryption } from './server/crypto.js';
import type { OAuthPluginOptions } from './types.js';

export function oauthPlugin(options: OAuthPluginOptions): Plugin {
  const ids = new Set<string>();
  for (const provider of options.providers) {
    if (!provider.id) throw new Error('[plugin-oauth] Provider IDs must not be empty.');
    if (ids.has(provider.id)) throw new Error(`[plugin-oauth] Provider ID '${provider.id}' must be unique.`);
    ids.add(provider.id);
  }

  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const connectionsSlug = options.connectionsSlug ?? 'oauth-connections';
    const statesSlug = options.statesSlug ?? 'oauth-states';
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(`[plugin-oauth] Auth collection '${authCollection}' must exist and have auth enabled.`);
    }
    const ownerField = options.ownerField ?? { name: 'owner', relationTo: authCollection };
    const providers = new Map(options.providers.map((provider) => [provider.id, provider]));
    const baseUrl = options.baseUrl ?? config.serverURL ?? 'http://localhost:3000';
    const paths = {
      authorize: options.paths?.authorize ?? '/oauth/:provider/authorize',
      callback: options.paths?.callback ?? '/oauth/:provider/callback',
      refresh: options.paths?.refresh ?? '/oauth/:provider/refresh',
      revoke: options.paths?.revoke ?? '/oauth/:provider/revoke',
    };
    const endpoints = createOAuthEndpoints({
      baseUrl,
      allowedReturnOrigins: options.allowedReturnOrigins ?? [],
      paths,
      statesSlug,
      connectionsSlug,
      ownerField: ownerField.name,
      providers,
      encryption: options.encryption ?? createOAuthEncryption({ secret: config.secret }),
    });
    const existingConnections = config.collections.find((collection) => collection.slug === connectionsSlug);
    const existingStates = config.collections.find((collection) => collection.slug === statesSlug);
    const connections = createOAuthConnectionsCollection({
      slug: connectionsSlug,
      ownerField,
      collection: options.connectionsCollection,
      existing: existingConnections,
    });
    const states = createOAuthStatesCollection({
      slug: statesSlug,
      ownerField,
      collection: options.statesCollection,
      existing: existingStates,
    });
    return {
      ...config,
      collections: [
        ...config.collections.map((collection) => {
          if (collection.slug === connectionsSlug) return connections;
          if (collection.slug === statesSlug) return states;
          if (collection.slug !== authCollection) return collection;
          return { ...collection, endpoints: [...(collection.endpoints ?? []), ...endpoints] };
        }),
        ...(existingConnections ? [] : [connections]),
        ...(existingStates ? [] : [states]),
      ],
    };
  };
}
