import type { CollectionConfig, FrogBotConfig } from 'frogbot';

export const articlesSlug = 'search-articles';
export const pagesSlug = 'search-pages';
export const notesSlug = 'search-notes';
export const usersSlug = 'search-users';
export const embeddingsSlug = 'search-embeddings';

export const localization: FrogBotConfig['localization'] = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

type SearchUser = { tenant?: string };

const tenantAccess: CollectionConfig['access'] = {
  create: () => true,
  delete: () => true,
  read: ({ req }) => {
    const tenant = (req.user as SearchUser | null)?.tenant;

    return tenant ? { tenant: { equals: tenant } } : true;
  },
  update: () => true,
};

export const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: { create: () => true, delete: () => true, read: () => true, update: () => true },
  fields: [{ name: 'tenant', type: 'text' }],
};

export const Articles: CollectionConfig = {
  slug: articlesSlug,
  access: tenantAccess,
  trash: true,
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'tenant', type: 'text' },
    { name: 'rating', type: 'number' },
    { name: 'embedding', type: 'vector', dimensions: 1536 },
    {
      name: 'details',
      type: 'group',
      fields: [
        { name: 'summary', type: 'text' },
        { name: 'embedding', type: 'vector', dimensions: 3 },
      ],
    },
  ],
  search: {
    content: {
      lexical: { fields: ['title', 'body'] },
    },
    english: {
      lexical: { fields: ['title'], language: 'english' },
    },
    details: {
      lexical: { fields: ['details.summary'] },
    },
  },
};

export const Pages: CollectionConfig = {
  slug: pagesSlug,
  access: tenantAccess,
  fields: [
    { name: 'title', type: 'text', localized: true },
    { name: 'summary', type: 'text' },
    { name: 'tenant', type: 'text' },
    { name: 'embedding', type: 'vector', dimensions: 2, localized: true },
  ],
  search: {
    content: {
      lexical: { fields: ['title', 'summary'] },
    },
  },
};

export const Notes: CollectionConfig = {
  slug: notesSlug,
  access: tenantAccess,
  fields: [
    { name: 'id', type: 'text' },
    { name: 'title', type: 'text' },
    { name: 'tenant', type: 'text' },
  ],
  search: {
    content: {
      lexical: { fields: ['title'] },
    },
  },
};

export const Embeddings: CollectionConfig = {
  slug: embeddingsSlug,
  fields: [
    { name: 'label', type: 'text' },
    { name: 'embedding', type: 'vector', dimensions: 3072, required: true },
  ],
};

export const collections = [Users, Articles, Pages, Notes, Embeddings];
