import type { FrogBotConfig } from 'frogbot';

export const articlesSlug = 'articles';

export const guidesSlug = 'guides';

export const articles: NonNullable<FrogBotConfig['collections']>[number] = {
  slug: articlesSlug,
  access: {
    read: ({ req }) =>
      req.context.searchTenant ? { tenant: { equals: req.context.searchTenant } } : true,
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'body', type: 'textarea' },
    { name: 'category', type: 'text' },
    { name: 'tenant', type: 'text' },
    { name: 'rank', type: 'number' },
    { name: 'embedding', type: 'vector', dimensions: 3 },
  ],
  search: {
    content: {
      lexical: { fields: ['title', 'body'], language: 'english' },
      vector: { field: 'embedding' },
      filters: { fields: ['category', 'tenant', 'rank'] },
    },
    nearest: {
      vector: { field: 'embedding', metric: 'euclidean' },
    },
    product: {
      vector: { field: 'embedding', metric: 'dotProduct' },
    },
    narrow: {
      lexical: { fields: ['title', 'body'], language: 'english' },
      vector: { field: 'embedding' },
      defaultCandidates: 1,
    },
    exact: {
      vector: { field: 'embedding', approximate: false },
      filters: { fields: ['tenant'] },
    },
    weighted: {
      lexical: { fields: ['title', 'body'], language: 'english' },
      vector: { field: 'embedding' },
      hybrid: { weights: { lexical: 1, vector: 3 } },
      filters: { fields: ['tenant'] },
    },
  },
};

export const guides: NonNullable<FrogBotConfig['collections']>[number] = {
  slug: guidesSlug,
  fields: [
    { name: 'title', type: 'text', localized: true },
    { name: 'summary', type: 'text' },
    {
      name: 'meta',
      type: 'group',
      fields: [{ name: 'embedding', type: 'vector', dimensions: 3, localized: true }],
    },
  ],
  search: {
    guides: {
      lexical: { fields: ['title', 'summary'] },
      vector: { field: 'meta.embedding' },
    },
  },
};

export const localization: FrogBotConfig['localization'] = {
  defaultLocale: 'en',
  locales: ['en', 'es'],
};

export const widesSlug = 'wides';

export const wideDimensions = 2001;

export const wides: NonNullable<FrogBotConfig['collections']>[number] = {
  slug: widesSlug,
  fields: [
    { name: 'title', type: 'text' },
    { name: 'embedding', type: 'vector', dimensions: wideDimensions },
  ],
  search: {
    wide: { vector: { field: 'embedding' } },
  },
};

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = (vector: number[]) => Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));

  return dot / (norm(a) * norm(b));
}

export function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0));
}

export function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}
