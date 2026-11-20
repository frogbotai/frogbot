import { apiKeysPlugin } from '@frogbotai/plugin-api-keys';
import { blockTools, mcpPlugin } from '@frogbotai/plugin-mcp';
import { rolesPlugin } from '@frogbotai/plugin-roles';
import type { Access, Block, CollectionConfig, FieldAccess } from 'frogbot';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';

export const adminEmail = 'admin@frogbot.local';
export const memberEmail = 'member@frogbot.local';

const isAdmin: FieldAccess = ({ req }) => req.user?.email === adminEmail;
const ownsDoc: Access = ({ req }) =>
  req.user ? (req.user.email === adminEmail ? true : { owner: { equals: req.user.id } }) : false;

const card: Block = {
  slug: 'card',
  fields: [
    { name: 'note', type: 'text', access: { read: isAdmin, update: isAdmin } },
    { name: 'text', type: 'text' },
    { name: 'locked', type: 'text', access: { update: isAdmin } },
    { name: 'items', type: 'blocks', blocks: ['tile'] },
  ],
};

const tile: Block = { slug: 'tile', fields: [{ name: 'label', type: 'text' }] };

const box: Block = {
  slug: 'box',
  fields: [
    { name: 'text', type: 'text' },
    { name: 'items', type: 'blocks', blocks: ['tile'] },
    { name: 'more', type: 'blocks', blocks: ['tile'] },
    { name: 'slots', type: 'blocks', blocks: ['tile'], access: { update: isAdmin } },
    { name: 'inner', type: 'blocks', blocks: ['tile'], access: { read: isAdmin } },
  ],
};

const intl: Block = {
  slug: 'intl',
  fields: [
    { name: 'text', type: 'text', localized: true },
    { name: 'size', type: 'text' },
  ],
};

const Users: CollectionConfig = { slug: 'users', auth: true, access: openAccess, fields: [] };

const Guarded: CollectionConfig = {
  slug: 'guarded',
  access: { ...openAccess, update: ownsDoc },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users' },
    { name: 'body', type: 'blocks', blocks: ['card'] },
    { name: 'aside', type: 'blocks', blocks: ['card'] },
    { name: 'internal', type: 'blocks', blocks: ['card'], access: { read: isAdmin } },
    { name: 'frozen', type: 'blocks', blocks: ['card'], access: { update: isAdmin } },
    { name: 'vault', type: 'blocks', blocks: ['tile'], access: { read: isAdmin } },
  ],
};

const Docs: CollectionConfig = {
  slug: 'docs',
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', localized: true },
    { name: 'layout', type: 'blocks', blocks: ['intl', 'card'] },
    { name: 'sidebar', type: 'blocks', blocks: ['intl', 'card'] },
  ],
};

const Pages: CollectionConfig = {
  slug: 'pages',
  access: openAccess,
  fields: [
    { name: 'body', type: 'blocks', blocks: ['box', 'tile'] },
    { name: 'frozen', type: 'blocks', blocks: ['tile'], access: { update: isAdmin } },
    { name: 'vault', type: 'blocks', blocks: ['tile'], access: { read: isAdmin } },
  ],
};

const Notes: CollectionConfig = {
  slug: 'notes',
  access: openAccess,
  fields: [{ name: 'body', type: 'blocks', blocks: ['intl'], localized: true }],
};

export default await buildTestConfig({
  admin: { user: 'users' },
  blocks: [card, tile, box, intl],
  collections: [Users, Guarded, Docs, Pages, Notes],
  localization: { locales: ['en', 'es'], defaultLocale: 'en' },
  plugins: [
    rolesPlugin(),
    apiKeysPlugin({ authCollection: 'users', collectionSlug: 'api-keys' }),
    mcpPlugin({ tools: blockTools() }),
  ],
});
