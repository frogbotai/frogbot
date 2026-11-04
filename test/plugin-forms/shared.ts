import type { CollectionConfig } from 'frogbot';

import { openAccess } from '../__helpers/shared/buildTestConfig.js';

export const leadsSlug = 'leads';
export const hookMarkerPrefix = 'test:lead-hook:';
export const staffFormSlug = 'staff-leave';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

export const Leads: CollectionConfig = {
  slug: leadsSlug,
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return;

        const form = (req.context.form as { form?: { slug?: string } } | undefined)?.form?.slug;

        await req.frogbot.kv.set(`${hookMarkerPrefix}${doc.id}`, form ?? 'none');
      },
    ],
  },
  fields: [
    { name: 'email', type: 'email', required: true },
    {
      type: 'row',
      fields: [
        { name: 'firstName', type: 'text' },
        { name: 'lastName', type: 'text' },
      ],
    },
    { name: 'interest', type: 'select', options: ['sales', 'support', 'partnership'] },
    { name: 'source', type: 'text' },
    {
      name: 'priority',
      type: 'select',
      options: ['low', 'normal', 'high'],
      required: true,
      defaultValue: 'normal',
    },
    { name: 'internalNote', type: 'text', access: { create: () => false } },
    { name: 'meta', type: 'json' },
  ],
};
