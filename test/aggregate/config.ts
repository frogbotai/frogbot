import type { CollectionConfig } from 'frogbot';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { accountsSlug, dealsSlug, usersSlug } from './shared.js';

const isAdmin = ({ req }: { req: { user?: unknown } }) =>
  (req.user as { role?: string } | null | undefined)?.role === 'admin';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: { create: () => true, delete: () => true, read: () => true, update: () => true },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'team', type: 'select', options: ['red', 'blue'] },
    { name: 'role', type: 'select', options: ['admin', 'member', 'guest'], defaultValue: 'member' },
  ],
};

const Accounts: CollectionConfig = {
  slug: accountsSlug,
  access: {
    create: () => true,
    delete: () => true,
    read: (args) => (isAdmin(args) ? true : { visible: { equals: true } }),
    update: () => true,
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'tier', type: 'select', options: ['gold', 'silver'] },
    { name: 'visible', type: 'checkbox', defaultValue: true },
  ],
};

const Deals: CollectionConfig = {
  slug: dealsSlug,
  trash: true,
  versions: { drafts: true },
  access: {
    create: () => true,
    delete: () => true,
    read: ({ req }) => {
      const user = req.user as { id: number | string; role?: string } | null | undefined;

      if (!user) return false;

      return user.role === 'guest' ? { owner: { equals: user.id } } : true;
    },
    update: () => true,
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'stage', type: 'select', options: ['lead', 'proposal', 'won', 'lost'] },
    { name: 'amount', type: 'number' },
    { name: 'closedAt', type: 'date' },
    { name: 'won', type: 'checkbox' },
    { name: 'owner', type: 'relationship', relationTo: usersSlug },
    { name: 'account', type: 'relationship', relationTo: accountsSlug },
    { name: 'watchers', type: 'relationship', relationTo: usersSlug, hasMany: true },
    { name: 'partners', type: 'relationship', relationTo: accountsSlug, hasMany: true },
    { name: 'tags', type: 'select', hasMany: true, options: ['hot', 'cold', 'big'] },
    { name: 'scores', type: 'number', hasMany: true },
    { name: 'region', type: 'text', localized: true },
    { name: 'margin', type: 'number', access: { read: isAdmin } },
    { name: 'secret', type: 'number', hidden: true },
    { name: 'confidential', type: 'checkbox' },
    {
      name: 'audit',
      type: 'number',
      access: {
        read: ({ doc, req }) =>
          isAdmin({ req }) ||
          (doc as { confidential?: boolean } | undefined)?.confidential !== true,
      },
    },
    { name: 'details', type: 'group', fields: [{ name: 'probability', type: 'number' }] },
    { name: 'lines', type: 'array', fields: [{ name: 'product', type: 'text' }] },
  ],
};

export default await buildTestConfig({
  collections: [Users, Accounts, Deals],
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
});
