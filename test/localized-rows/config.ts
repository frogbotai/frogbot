import type { Block, CollectionConfig, Field } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const draftySlug = 'drafty';
export const plainSlug = 'plain';
export const usersSlug = 'users';

const intl: Block = {
  slug: 'intl',
  fields: [
    { name: 'text', type: 'text', localized: true },
    { name: 'size', type: 'text' },
  ],
};

const fields: Field[] = [
  { name: 'title', type: 'text', localized: true },
  { name: 'layout', type: 'blocks', blocks: [intl] },
  {
    name: 'items',
    type: 'array',
    fields: [
      { name: 'label', type: 'text', localized: true },
      { name: 'size', type: 'text' },
    ],
  },
  {
    name: 'sections',
    type: 'array',
    fields: [
      { name: 'heading', type: 'text', localized: true },
      { name: 'content', type: 'blocks', blocks: [intl] },
    ],
  },
];

const Users: CollectionConfig = { slug: usersSlug, auth: true, access: openAccess, fields: [] };

const Drafty: CollectionConfig = {
  slug: draftySlug,
  access: openAccess,
  versions: { drafts: true },
  fields,
};

const Plain: CollectionConfig = { slug: plainSlug, access: openAccess, fields };

export default await buildTestConfig({
  collections: [Users, Drafty, Plain],
  localization: { locales: ['en', 'es'], defaultLocale: 'en' },
});
