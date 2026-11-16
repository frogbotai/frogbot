import type { CollectionConfig, Field } from 'frogbot';

import { createAccess, ownAccess } from './access.js';
import { defaultNotificationsSlug } from './shared.js';
import type { NotificationsCollectionOverrides } from './types.js';

type CollectionOptions = {
  overrides: NotificationsCollectionOverrides;
  userSlug: string;
};

const fixed = { update: () => false };

function defaultFields(userSlug: string): Field[] {
  return [
    {
      name: 'user',
      type: 'relationship',
      relationTo: userSlug,
      required: true,
      index: true,
      access: fixed,
    },
    { name: 'actor', type: 'relationship', relationTo: userSlug, access: fixed },
    { name: 'kind', type: 'text', index: true, access: fixed },
    { name: 'title', type: 'text', required: true, access: fixed },
    { name: 'excerpt', type: 'textarea', access: fixed },
    { name: 'link', type: 'text', access: fixed },
    { name: 'source', type: 'text', index: true, access: fixed },
    {
      name: 'readAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'createdAt',
      type: 'date',
      index: true,
      admin: { disabled: { bulkEdit: true }, hidden: true },
      access: fixed,
    },
  ];
}

export function createNotificationsCollection({
  overrides: { fields: overrideFields, ...overrides },
  userSlug,
}: CollectionOptions): CollectionConfig {
  const builtIns = defaultFields(userSlug);

  return {
    versions: false,
    custom: { frogbot: { internal: true } },
    ...overrides,
    slug: overrides.slug ?? defaultNotificationsSlug,
    admin: {
      hidden: true,
      icon: 'bell',
      useAsTitle: 'title',
      views: [{ type: 'list', defaultFields: ['title', 'user', 'readAt', 'createdAt'] }],
      ...overrides.admin,
    },
    access: {
      read: ownAccess(userSlug),
      create: createAccess,
      update: ownAccess(userSlug),
      delete: ownAccess(userSlug),
      ...overrides.access,
    },
    fields: overrideFields ? overrideFields({ defaultFields: builtIns }) : builtIns,
  };
}
