import type { CollectionConfig, Field } from 'frogbot';

import { mergeFields } from './shared.js';

type StatesCollectionOptions = {
  slug: string;
  ownerField: { name: string; relationTo: string };
  collection?: Partial<CollectionConfig>;
  existing?: CollectionConfig;
};

export function createOAuthStatesCollection(options: StatesCollectionOptions): CollectionConfig {
  const { slug, ownerField, collection, existing } = options;
  const fields: Field[] = [
    { name: 'state', type: 'text', required: true, unique: true, index: true, access: { read: () => false }, admin: { hidden: true } },
    { name: ownerField.name, type: 'relationship', relationTo: ownerField.relationTo, required: true, index: true, admin: { hidden: true } },
    { name: 'provider', type: 'text', required: true, index: true, admin: { hidden: true } },
    { name: 'returnUrl', type: 'text', required: true, admin: { hidden: true } },
    { name: 'codeVerifier', type: 'text', required: true, access: { read: () => false }, admin: { hidden: true } },
    { name: 'expiresAt', type: 'date', required: true, index: true, admin: { hidden: true } },
  ];

  return {
    slug,
    labels: { singular: 'OAuth State', plural: 'OAuth States' },
    timestamps: true,
    ...existing,
    ...collection,
    access: {
      create: () => false,
      delete: () => false,
      read: () => false,
      update: () => false,
      ...existing?.access,
      ...collection?.access,
    },
    admin: { hidden: true, ...existing?.admin, ...collection?.admin },
    endpoints: [...(existing?.endpoints ?? []), ...(collection?.endpoints ?? [])],
    fields: mergeFields(fields, existing?.fields, collection?.fields),
    hooks: { ...existing?.hooks, ...collection?.hooks },
  };
}
