import type { CollectionConfig, Field, FrogbotRequest } from 'frogbot';

import { mergeFields } from './shared.js';

type ConnectionsCollectionOptions = {
  slug: string;
  ownerField: { name: string; relationTo: string };
  collection?: Partial<CollectionConfig>;
  existing?: CollectionConfig;
};

export function createOAuthConnectionsCollection(options: ConnectionsCollectionOptions): CollectionConfig {
  const { slug, ownerField, collection, existing } = options;
  const ownerAccess = ({ req }: { req: FrogbotRequest }) => {
    const owner = req.user?.id;
    return owner === undefined ? false : { [ownerField.name]: { equals: owner } };
  };
  const fields: Field[] = [
    { name: ownerField.name, type: 'relationship', relationTo: ownerField.relationTo, required: true, index: true },
    { name: 'provider', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'providerAccountId', type: 'text', required: true, index: true, admin: { readOnly: true } },
    { name: 'accountEmail', type: 'email', index: true, admin: { readOnly: true } },
    { name: 'accountName', type: 'text', admin: { readOnly: true } },
    { name: 'encryptedTokens', type: 'text', required: true, access: { read: () => false }, admin: { hidden: true } },
    { name: 'expiresAt', type: 'date', index: true, admin: { readOnly: true } },
    { name: 'scopes', type: 'text', hasMany: true, admin: { readOnly: true } },
    { name: 'status', type: 'select', required: true, defaultValue: 'active', options: ['active', 'error', 'revoked'], index: true },
    { name: 'metadata', type: 'json', admin: { readOnly: true } },
  ];

  return {
    slug,
    labels: { singular: 'OAuth Connection', plural: 'OAuth Connections' },
    timestamps: true,
    ...existing,
    ...collection,
    access: {
      create: () => false,
      delete: () => false,
      read: ownerAccess,
      update: () => false,
      ...existing?.access,
      ...collection?.access,
    },
    admin: { useAsTitle: 'accountEmail', ...existing?.admin, ...collection?.admin },
    endpoints: [...(existing?.endpoints ?? []), ...(collection?.endpoints ?? [])],
    fields: mergeFields(fields, existing?.fields, collection?.fields),
    hooks: { ...existing?.hooks, ...collection?.hooks },
  };
}
