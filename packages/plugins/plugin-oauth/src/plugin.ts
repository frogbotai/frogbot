import type { Plugin } from 'frogbot';

import { createOAuthStatesCollection } from './collections/states.js';
import { createOAuthEndpoints } from './endpoints/index.js';
import { dropboxProvider } from './providers/dropbox.js';
import { githubProvider } from './providers/github.js';
import { googleProvider } from './providers/google.js';
import { microsoftProvider } from './providers/microsoft.js';
import { notionProvider } from './providers/notion.js';
import { slackProvider } from './providers/slack.js';
import { stripeProvider } from './providers/stripe.js';
import { xeroProvider } from './providers/xero.js';
import { zoomProvider } from './providers/zoom.js';
import { createOAuthEncryption } from './server/crypto.js';
import { createOAuthCredentialSource } from './source.js';
import type { OAuthPluginOptions } from './types.js';
import type { OAuthProvider } from './types.js';

function createProvider(id: string, clientId: string, clientSecret: string, scopes: string[]): OAuthProvider {
  const options = { clientId, clientSecret, service: id, scopes };
  if (id === 'google') return googleProvider(options);
  if (id === 'github') return githubProvider(options);
  if (id === 'dropbox') return dropboxProvider(options);
  if (id === 'microsoft') return microsoftProvider(options);
  if (id === 'notion') return notionProvider(options);
  if (id === 'slack') return slackProvider(options);
  if (id === 'stripe') return stripeProvider(options);
  if (id === 'xero') return xeroProvider(options);
  if (id === 'zoom') return zoomProvider(options);
  throw new Error(`[plugin-oauth] No OAuth provider is available for '${id}'.`);
}

function providerId(service: string): string {
  if (service.startsWith('google_') || service.startsWith('google-') || service === 'gmail') return 'google';
  if (service.startsWith('microsoft_') || service.startsWith('microsoft-')) return 'microsoft';
  return service;
}

export function oauthPlugin(options: OAuthPluginOptions = {}): Plugin {
  const explicit = (options as OAuthPluginOptions & { providers?: OAuthProvider[] }).providers;
  if (explicit) {
    const ids = new Set<string>();
    for (const provider of explicit) {
      if (!provider.id) throw new Error('[plugin-oauth] Provider IDs must not be empty.');
      if (!provider.service) throw new Error('[plugin-oauth] Provider service IDs must not be empty.');
      if (ids.has(provider.id)) throw new Error(`[plugin-oauth] Provider ID '${provider.id}' must be unique.`);
      ids.add(provider.id);
    }
  }

  return (config) => {
    const authCollection = options.authCollection ?? 'users';
    const connectionsSlug = config.collections.find((collection) => collection.connections)?.slug ?? 'connections';
    const statesSlug = options.statesSlug ?? 'oauth-states';
    const auth = config.collections.find((collection) => collection.slug === authCollection);
    if (!auth || auth.auth === undefined || auth.auth === false) {
      throw new Error(`[plugin-oauth] Auth collection '${authCollection}' must exist and have auth enabled.`);
    }
    const ownerField = options.ownerField ?? { name: 'owner', relationTo: authCollection };
    const groups = new Map<object, { id: string; services: string[]; scopes: Set<string>; clientId: string; clientSecret: string }>();
    for (const piece of config.pieces ?? []) {
      if (piece.credentialType !== 'oauth2') continue;
      if (piece.policy.type !== 'oauth') throw new Error(`[plugin-oauth] OAuth piece '${piece.service}' requires OAuth app credentials.`);
      const key = piece.separateConsent ? piece : piece.policy.source;
      const current = groups.get(key) ?? { id: providerId(piece.service), services: [], scopes: new Set(), clientId: piece.policy.clientId, clientSecret: piece.policy.clientSecret };
      current.services.push(piece.service);
      for (const scope of piece.scopes ?? []) current.scopes.add(scope);
      groups.set(key, current);
    }
    const derived = explicit ?? [...groups.values()].map((group, index) => {
      const id = [...groups.values()].filter((candidate) => candidate.id === group.id).length > 1 ? `${group.id}-${index + 1}` : group.id;
      return { ...createProvider(id.startsWith(`${group.id}-`) ? group.id : id, group.clientId, group.clientSecret, [...group.scopes]), id, service: group.services[0]!, services: group.services };
    });
    const providers = new Map(derived.map((provider) => [provider.id, provider]));
    const baseUrl = options.baseUrl ?? config.serverURL ?? 'http://localhost:3000';
    const paths = {
      authorize: options.paths?.authorize ?? '/oauth/:provider/authorize',
      callback: options.paths?.callback ?? '/oauth/:provider/callback',
      refresh: options.paths?.refresh ?? '/oauth/:provider/refresh',
      revoke: options.paths?.revoke ?? '/oauth/:provider/revoke',
    };
    const encryption = options.encryption ?? createOAuthEncryption({ secret: config.secret });
    const endpoints = createOAuthEndpoints({
      baseUrl,
      allowedReturnOrigins: options.allowedReturnOrigins ?? [],
      paths,
      statesSlug,
      connectionsSlug,
      ownerField: ownerField.name,
      providers,
      encryption,
    });
    const existingStates = config.collections.find((collection) => collection.slug === statesSlug);
    const states = createOAuthStatesCollection({
      slug: statesSlug,
      ownerField,
      collection: options.statesCollection,
      existing: existingStates,
    });
    return {
      ...config,
      credentialSources: [
        ...(config.credentialSources ?? []),
        ...derived.map((provider) => createOAuthCredentialSource({ provider, encryption, connectionsSlug })),
      ],
      collections: [
        ...config.collections.map((collection) => {
          if (collection.slug === statesSlug) return states;
          if (collection.slug !== authCollection) return collection;
          return { ...collection, endpoints: [...(collection.endpoints ?? []), ...endpoints] };
        }),
        ...(existingStates ? [] : [states]),
      ],
    };
  };
}
