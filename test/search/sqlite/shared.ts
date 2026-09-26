import { fileURLToPath } from 'node:url';

import { sqliteAdapter } from '@frogbotai/db-sqlite';
import type { CollectionConfig, FrogBotConfig } from 'frogbot';
import { buildConfig } from 'frogbot';

export const databasePath = fileURLToPath(new URL('./search.db', import.meta.url));

export const articlesSlug = 'search-articles';
export const pagesSlug = 'search-pages';
export const notesSlug = 'search-notes';
export const usersSlug = 'search-users';

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
    { name: 'embedding', type: 'vector', dimensions: 3 },
    {
      name: 'details',
      type: 'group',
      fields: [
        { name: 'summary', type: 'text' },
        { name: 'embedding', type: 'vector', dimensions: 2 },
      ],
    },
  ],
  search: {
    content: {
      lexical: { fields: ['title', 'body'] },
      vector: { field: 'embedding' },
    },
    distance: {
      vector: { field: 'embedding', metric: 'euclidean' },
    },
    english: {
      lexical: { fields: ['title'], language: 'english' },
    },
    narrow: {
      lexical: { fields: ['title', 'body'] },
      vector: { field: 'embedding' },
      defaultCandidates: 1,
    },
    details: {
      lexical: { fields: ['details.summary'] },
      vector: { field: 'details.embedding' },
      hybrid: { weights: { lexical: 2, vector: 1 } },
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
      vector: { field: 'embedding' },
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
    { name: 'embedding', type: 'vector', dimensions: 2 },
  ],
  search: {
    content: {
      lexical: { fields: ['title'] },
      vector: { field: 'embedding' },
    },
  },
};

function withApproximate(collection: CollectionConfig, approximate: boolean): CollectionConfig {
  if (!collection.search) return collection;

  return {
    ...collection,
    search: Object.fromEntries(
      Object.entries(collection.search).map(([name, index]) => [
        name,
        index.vector ? { ...index, vector: { ...index.vector, approximate } } : index,
      ]),
    ),
  };
}

export function buildSearchConfig({
  approximate,
  collections = [Users, Articles, Pages, Notes],
  migrationDir,
  push,
  url = `file:${databasePath}`,
}: {
  approximate?: boolean;
  collections?: CollectionConfig[];
  migrationDir?: string;
  push?: boolean;
  url?: string;
} = {}) {
  const config: FrogBotConfig = {
    secret: 'search-sqlite-test',
    db: sqliteAdapter({
      client: { url },
      transactionOptions: {},
      ...(migrationDir ? { migrationDir } : {}),
      ...(push === undefined ? {} : { push }),
    }),
    typescript: { autoGenerate: false },
    collections:
      approximate === undefined
        ? collections
        : collections.map((collection) => withApproximate(collection, approximate)),
    localization: { defaultLocale: 'en', locales: ['en', 'es'] },
  };

  return buildConfig(config);
}
