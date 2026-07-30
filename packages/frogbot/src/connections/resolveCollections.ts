import { resolveUserSlug } from '../chat/resolveUserSlug.js';
import type { CollectionConfig } from '../types/collection.js';
import type { FrogbotConfig } from '../types/config.js';
import type { SanitizedConnectionsConfig } from '../types/connections.js';
import type { SanitizedPiecesConfig } from '../types/piece.js';
import { defaultConnectionsCollection } from './collection.js';
import { createCredentialEncryption } from './encryption.js';

export const DEFAULT_CONNECTIONS_SLUG = 'connections';

const RESERVED_FIELDS = [
  'owner',
  'services',
  'source',
  'credentialType',
  'sourceKey',
  'encryptedCredentials',
  'scopes',
  'status',
  'accountId',
  'accountLabel',
  'expiresAt',
];

function fieldName(field: CollectionConfig['fields'][number]): string | undefined {
  return 'name' in field && typeof field.name === 'string' ? field.name : undefined;
}

function mergeCollection(user: CollectionConfig, base: CollectionConfig): CollectionConfig {
  for (const field of user.fields) {
    const name = fieldName(field);
    if (name && RESERVED_FIELDS.includes(name)) {
      throw new Error(`[frogbot] Field '${name}' on collection '${user.slug}' is reserved by connections.`);
    }
  }
  const metadata = user.fields.find((field) => fieldName(field) === 'metadata');
  if (metadata && (!('type' in metadata) || metadata.type !== 'json')) {
    throw new Error(`[frogbot] Field 'metadata' on collection '${user.slug}' must use type 'json'.`);
  }
  return {
    ...base,
    ...user,
    fields: [...user.fields, ...base.fields.filter((field) => !user.fields.some((item) => fieldName(item) === fieldName(field)))],
    access: { ...base.access, ...user.access },
    admin: { ...base.admin, ...user.admin },
  };
}

export function resolveConnectionsCollections(
  config: FrogbotConfig,
  pieces: SanitizedPiecesConfig,
): { collections: CollectionConfig[]; connections: SanitizedConnectionsConfig } {
  const marked = config.collections.filter((collection) => collection.connections === true);
  if (marked.length > 1) {
    throw new Error(`[frogbot] Multiple collections marked \`connections: true\` (${marked.map((c) => c.slug).join(', ')}). Mark exactly one.`);
  }
  const enabled = pieces.pieces.some((piece) => piece.credentialType !== 'none') || marked.length === 1 || !!config.credentialSources?.length;
  const encryption = config.connections?.encryption ?? createCredentialEncryption({ secret: config.secret });
  const sources = config.credentialSources ?? [];
  const assignments = config.connections?.assignments ?? {};
  if (!enabled) return { collections: config.collections, connections: { enabled: false, encryption, sources, assignments } };

  const existing = marked[0];
  const slug = existing?.slug ?? DEFAULT_CONNECTIONS_SLUG;
  const base = defaultConnectionsCollection({ slug, userSlug: resolveUserSlug(config) });
  if (existing) {
    const collections = [...config.collections];
    collections[collections.indexOf(existing)] = mergeCollection(existing, base);
    return { collections, connections: { enabled: true, slug, encryption, sources, assignments } };
  }
  if (config.collections.some((collection) => collection.slug === slug)) {
    throw new Error(`[frogbot] Collection slug '${slug}' conflicts with the default connections collection. Add \`connections: true\` to adopt it, or rename it.`);
  }
  return {
    collections: [...config.collections, base],
    connections: { enabled: true, slug, encryption, sources, assignments },
  };
}
