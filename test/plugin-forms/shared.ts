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

export const ticketsSlug = 'tickets';
export const ticketFilesSlug = 'ticket-files';

/** A private upload collection: only signed-in users read its files. */
export function ticketFiles({
  staticDir,
  hooks,
}: {
  staticDir: string;
  hooks?: CollectionConfig['hooks'];
}): CollectionConfig {
  return {
    slug: ticketFilesSlug,
    upload: { staticDir },
    access: { read: ({ req }) => Boolean(req.user) },
    ...(hooks ? { hooks } : {}),
    fields: [{ name: 'note', type: 'text' }],
  };
}

export const Tickets: CollectionConfig = {
  slug: ticketsSlug,
  access: { read: ({ req }) => Boolean(req.user) },
  fields: [
    {
      name: 'subject',
      type: 'text',
      required: true,
      validate: (value: unknown) =>
        typeof value === 'string' && value.length >= 3 ? true : 'Use at least 3 characters.',
    },
    { name: 'screenshot', type: 'upload', relationTo: ticketFilesSlug },
    { name: 'attachments', type: 'upload', relationTo: ticketFilesSlug, hasMany: true },
  ],
};
