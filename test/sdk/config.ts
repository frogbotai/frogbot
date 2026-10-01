import os from 'node:os';
import path from 'node:path';

import type { CollectionConfig } from 'frogbot';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import { mediaSlug, pagesSlug, usersSlug } from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const Pages: CollectionConfig = {
  slug: pagesSlug,
  versions: { drafts: { autosave: true } },
  access: {
    ...openAccess,
    read: ({ req }) => (req.user ? true : { _status: { equals: 'published' } }),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text' },
    { name: 'group', type: 'group', fields: [{ name: 'field', type: 'text' }] },
    { name: 'summary', type: 'text', localized: true },
    { name: 'parent', type: 'relationship', relationTo: pagesSlug },
    { name: 'children', type: 'join', collection: pagesSlug, on: 'parent' },
  ],
};

const Media: CollectionConfig = {
  slug: mediaSlug,
  upload: { staticDir: path.join(os.tmpdir(), 'frogbot-sdk-int') },
  access: openAccess,
  fields: [{ name: 'alt', type: 'text' }],
};

export default await buildTestConfig({
  collections: [Users, Pages, Media],
  localization: { defaultLocale: 'en', fallback: true, locales: ['en', 'fr'] },
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:3988/v1',
        apiKey: 'test-key',
        models: [{ id: 'test-model', mode: 'chat' }],
      },
    },
  },
  agents: [{ slug: 'sdk-agent', model: 'test/test-model', instructions: 'Test agent.' }],
});
