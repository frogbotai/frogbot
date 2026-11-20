import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { blockTools, mcpPlugin } from '@frogbotai/plugin-mcp';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { Block, CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';

export const usersSlug = 'users';
export const apiKeysSlug = 'api-keys';
export const pagesSlug = 'pages';
export const notesSlug = 'notes';
export const lockedSlug = 'locked';
export const unlistedSlug = 'unlisted';
export const plainSlug = 'plain';
export const groupedSlug = 'grouped';
export const mcpEndpoint = '/api/mcp';
export const apiKeyToken = `fb_${'A'.repeat(43)}`;
export const testCredentials = { email: 'blocks-owner@frogbot.local', password: 'frogbot-test' };

const heading: Block = {
  slug: 'heading',
  fields: [
    { name: 'text', type: 'text', required: true },
    { name: 'secret', type: 'text', hidden: true },
    {
      name: 'style',
      type: 'group',
      fields: [
        { name: 'size', type: 'select', options: ['s', 'm', 'l'] },
        { name: 'color', type: 'text' },
      ],
    },
  ],
};

const quote: Block = {
  slug: 'quote',
  fields: [
    { name: 'body', type: 'textarea' },
    { name: 'author', type: 'text' },
  ],
};

const columns: Block = {
  slug: 'columns',
  fields: [{ name: 'items', type: 'blocks', blocks: [heading, quote] }],
};

const banner: Block = { slug: 'banner', fields: [{ name: 'label', type: 'text' }] };

const Users: CollectionConfig = { slug: usersSlug, auth: true, access: openAccess, fields: [] };

const Pages: CollectionConfig = {
  slug: pagesSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      type: 'tabs',
      tabs: [
        { label: 'Hero', fields: [{ name: 'hero', type: 'blocks', blocks: [banner], maxRows: 1 }] },
        {
          label: 'Content',
          fields: [{ name: 'layout', type: 'blocks', blocks: [heading, quote, columns] }],
        },
      ],
    },
  ],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'blocks', blocks: [heading, quote], localized: true },
  ],
};

const Locked: CollectionConfig = {
  slug: lockedSlug,
  access: { ...openAccess, update: () => false },
  fields: [{ name: 'body', type: 'blocks', blocks: [heading] }],
};

const Unlisted: CollectionConfig = {
  slug: unlistedSlug,
  access: openAccess,
  fields: [{ name: 'body', type: 'blocks', blocks: [heading] }],
};

const Grouped: CollectionConfig = {
  slug: groupedSlug,
  access: openAccess,
  fields: [
    {
      name: 'content',
      type: 'group',
      fields: [{ name: 'layout', type: 'blocks', blocks: [heading] }],
    },
    {
      type: 'tabs',
      tabs: [{ name: 'seo', fields: [{ name: 'extra', type: 'blocks', blocks: [quote] }] }],
    },
  ],
};

const Plain: CollectionConfig = {
  slug: plainSlug,
  access: openAccess,
  fields: [{ name: 'title', type: 'text' }],
};

export default await buildTestConfig({
  admin: { user: usersSlug },
  collections: [Users, Pages, Notes, Locked, Unlisted, Plain, Grouped],
  localization: { locales: ['en', 'es'], defaultLocale: 'en' },
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({ authCollection: usersSlug, collectionSlug: apiKeysSlug }),
    mcpPlugin({
      tools: blockTools({
        collections: [pagesSlug, notesSlug, lockedSlug, plainSlug, apiKeysSlug, groupedSlug],
      }),
    }),
  ],
});
