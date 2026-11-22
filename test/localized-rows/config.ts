import type { Block, CollectionConfig, Field } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const draftySlug = 'drafty';
export const plainSlug = 'plain';
export const strictSlug = 'strict';
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
  {
    name: 'hero',
    type: 'group',
    fields: [
      { name: 'heading', type: 'text', localized: true },
      { name: 'ctas', type: 'array', fields: [{ name: 'label', type: 'text', localized: true }] },
    ],
  },
  {
    type: 'tabs',
    tabs: [
      {
        name: 'meta',
        fields: [
          { name: 'summary', type: 'text', localized: true },
          {
            name: 'links',
            type: 'array',
            fields: [{ name: 'text', type: 'text', localized: true }],
          },
        ],
      },
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

const Strict: CollectionConfig = {
  slug: strictSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [{ name: 'code', type: 'text', required: true }, ...fields],
};

export default await buildTestConfig({
  collections: [Users, Drafty, Plain, Strict],
  localization: { locales: ['en', 'es'], defaultLocale: 'en' },
});
