import { buildTestConfig, openAccess } from '../../__helpers/shared/buildTestConfig.js';
import { articlesSlug, authorsSlug, postsSlug } from './shared.js';

export default buildTestConfig({
  localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  collections: [
    {
      slug: authorsSlug,
      access: openAccess,
      fields: [{ name: 'name', type: 'text' }],
    },
    {
      slug: articlesSlug,
      trash: true,
      access: { ...openAccess, read: () => ({ visibility: { equals: 'public' } }) },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'body', type: 'textarea' },
        {
          name: 'visibility',
          type: 'select',
          defaultValue: 'public',
          options: ['public', 'private'],
        },
        { name: 'rank', type: 'number' },
        { name: 'featured', type: 'checkbox' },
        { name: 'publishedAt', type: 'date' },
        { name: 'author', type: 'relationship', relationTo: authorsSlug },
        { name: 'tags', type: 'select', hasMany: true, options: ['a', 'b'] },
        { name: 'embedding', type: 'vector', dimensions: 3 },
        {
          name: 'meta',
          type: 'group',
          fields: [
            { name: 'summary', type: 'text' },
            { name: 'embedding', type: 'vector', dimensions: 3 },
          ],
        },
      ],
      search: {
        content: {
          lexical: { fields: ['title', 'body'], language: 'english' },
          vector: { field: 'embedding' },
        },
        exact: {
          vector: { field: 'embedding', approximate: false },
        },
        nested: {
          lexical: { fields: ['meta.summary'] },
          vector: { field: 'meta.embedding', metric: 'euclidean' },
          filters: { fields: ['visibility', 'rank'] },
          hybrid: { weights: { lexical: 1, vector: 2 } },
        },
      },
    },
    {
      slug: postsSlug,
      access: openAccess,
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', localized: true },
        { name: 'embedding', type: 'vector', dimensions: 3, localized: true },
      ],
      search: {
        content: {
          lexical: { fields: ['title'] },
          vector: { field: 'embedding', metric: 'dotProduct' },
        },
      },
    },
  ],
});
