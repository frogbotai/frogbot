import type { Access } from '../collections/config/types.js';
import type { CollectionConfig } from '../collections/config/types.js';

const owner: Access = ({ req }) => (req.user ? { owner: { equals: req.user.id } } : false);

export function defaultConnectionsCollection({
  slug,
  userSlug,
}: {
  slug: string;
  userSlug: string;
}): CollectionConfig {
  return {
    slug,
    admin: {
      icon: 'link-square',
      group: 'Connections',
      useAsTitle: 'accountLabel',
      defaultColumns: ['services', 'accountLabel', 'status', 'updatedAt'],
    },
    access: {
      create: () => false,
      read: owner,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'owner', type: 'relationship', relationTo: userSlug, index: true, required: true },
      { name: 'services', type: 'text', hasMany: true, index: true, required: true },
      {
        name: 'source',
        type: 'select',
        options: ['oauth', 'secret'],
        required: true,
      },
      {
        name: 'credentialType',
        type: 'select',
        options: ['oauth2', 'secret_text', 'basic_auth', 'custom', 'service_account'],
        required: true,
      },
      { name: 'sourceKey', type: 'text', required: true },
      {
        name: 'encryptedCredentials',
        type: 'text',
        hidden: true,
        access: { read: () => false },
        required: true,
        validate: (value: unknown, { data }: { data?: { status?: unknown } }) =>
          value || data?.status === 'revoked' ? true : 'This field is required.',
      },
      { name: 'scopes', type: 'text', hasMany: true },
      {
        name: 'status',
        type: 'select',
        options: ['active', 'error', 'revoked'],
        defaultValue: 'active',
        required: true,
      },
      { name: 'accountId', type: 'text', index: true },
      { name: 'accountLabel', type: 'text' },
      { name: 'expiresAt', type: 'date', index: true },
      { name: 'metadata', type: 'json' },
    ],
  };
}
