import type { CollectionConfig } from 'frogbot';
import { embedFrom } from 'frogbot/search';

import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import {
  articlesSlug,
  chunksSlug,
  dimensions,
  embedderModel,
  guidesSlug,
  modelPort,
  notesSlug,
  pagesSlug,
  postsSlug,
  usersSlug,
} from './shared.js';

const model = `test/${embedderModel}` as const;

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [],
};

const Posts: CollectionConfig = {
  slug: postsSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'views', type: 'number' },
    {
      name: 'embedding',
      type: 'vector',
      dimensions,
      hooks: { beforeChange: [embedFrom({ fields: ['title', 'body'], model })] },
    },
  ],
  search: {
    content: { vector: { field: 'embedding' } },
  },
};

const Articles: CollectionConfig = {
  slug: articlesSlug,
  access: openAccess,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'embedding',
      type: 'vector',
      dimensions,
      hooks: { beforeChange: [embedFrom({ fields: ['title'], model })] },
    },
  ],
};

const Pages: CollectionConfig = {
  slug: pagesSlug,
  access: openAccess,
  fields: [
    { name: 'title', type: 'text', localized: true },
    {
      name: 'embedding',
      type: 'vector',
      dimensions,
      localized: true,
      hooks: { beforeChange: [embedFrom({ fields: ['title'], model })] },
    },
  ],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: openAccess,
  versions: true,
  fields: [
    { name: 'title', type: 'text' },
    {
      name: 'embedding',
      type: 'vector',
      dimensions,
      hooks: { beforeChange: [embedFrom({ fields: ['title'], model })] },
    },
  ],
};

const Guides: CollectionConfig = {
  slug: guidesSlug,
  access: openAccess,
  hooks: {
    afterChange: [
      ({ doc, req }) =>
        req.context.reportRequest
          ? { ...doc, request: { depth: req.query.depth, fallbackLocale: req.fallbackLocale } }
          : doc,
    ],
  },
  versions: { drafts: { autosave: true } },
  fields: [
    { name: 'title', type: 'text', localized: true },
    { name: 'views', type: 'number' },
    {
      name: 'embedding',
      type: 'vector',
      dimensions,
      localized: true,
      hooks: { beforeChange: [embedFrom({ fields: ['title'], model })] },
    },
  ],
};

const Chunks: CollectionConfig = {
  slug: chunksSlug,
  access: openAccess,
  fields: [
    {
      name: 'parts',
      type: 'array',
      fields: [
        { name: 'text', type: 'text' },
        {
          name: 'embedding',
          type: 'vector',
          dimensions,
          hooks: { beforeChange: [embedFrom({ fields: ['text'], model })] },
        },
      ],
    },
  ],
};

export default buildTestConfig({
  collections: [Users, Posts, Articles, Pages, Notes, Guides, Chunks],
  localization: { locales: ['en', 'es'], defaultLocale: 'en' },
  ai: {
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [{ id: embedderModel, mode: 'embedding' }],
      },
    },
  },
});
