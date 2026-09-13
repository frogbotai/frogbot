import type { CollectionConfig } from '../collections/config/types.js';

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
      useAsTitle: 'piece',
      views: [
        {
          type: 'list',
          defaultFields: ['piece', 'method', 'account', 'status', 'updatedAt'],
        },
      ],
    },
    access: {
      create: () => false,
      read: ({ req }) =>
        req.user?.collection === userSlug ? { owner: { equals: req.user.id } } : false,
      update: () => false,
      delete: () => false,
    },
    indexes: [{ fields: ['owner', 'piece'], unique: true }],
    fields: [
      { name: 'owner', type: 'relationship', relationTo: userSlug, index: true, required: true },
      { name: 'piece', type: 'text', index: true, required: true },
      {
        name: 'method',
        type: 'select',
        options: ['oauth', 'secret'],
        required: true,
      },
      {
        name: 'credential',
        type: 'text',
        hidden: true,
        access: { read: () => false },
        required: true,
      },
      {
        name: 'account',
        type: 'json',
        validate: (value: unknown) => {
          if (value == null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return 'Invalid account.';
          const account = value as Record<string, unknown>;
          return (
            (typeof account.id === 'string' &&
              !!account.id &&
              typeof account.label === 'string' &&
              !!account.label &&
              (account.email === undefined || typeof account.email === 'string') &&
              Object.keys(account).every((key) => ['id', 'label', 'email'].includes(key))) ||
            'Invalid account.'
          );
        },
      },
      { name: 'scopes', type: 'text', hasMany: true, defaultValue: [] },
      { name: 'expiresAt', type: 'date', index: true },
      {
        name: 'status',
        type: 'select',
        options: ['active', 'error', 'revoked'],
        defaultValue: 'active',
        required: true,
      },
    ],
  };
}
