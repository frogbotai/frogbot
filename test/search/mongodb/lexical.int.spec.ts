import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import type { Where } from 'payload';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ensureSearchIndexes } from '../../../packages/db-mongodb/src/search/index.js';
import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import type { SeededArticles } from './shared.js';
import { articlesSlug, seedArticles, skipSearch, useSearchDatabase, waitFor } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe.skipIf(skipSearch)('MongoDB lexical search', () => {
  let booted: BootedFrogBot;
  let restoreDatabase: (() => void) | undefined;
  let ids: SeededArticles;

  const search = async ({
    limit,
    overrideAccess = false,
    text = 'fox',
    where,
  }: {
    limit?: number;
    overrideAccess?: boolean;
    text?: string;
    where?: Where;
  } = {}) => {
    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text },
      limit,
      where,
      overrideAccess,
      ...(overrideAccess ? {} : { req: await booted.frogbot.createRequest() }),
    });

    return { ...result, ids: result.hits.map(({ doc }) => String(doc.id)) };
  };

  beforeAll(async () => {
    restoreDatabase = useSearchDatabase();
    booted = await bootFrogBot(dirname, 'search-lexical');
    ids = await seedArticles(booted.frogbot);

    await waitFor(
      () => search({ overrideAccess: true }),
      (result) => result.ids.length === 3,
    );
  });

  afterAll(async () => {
    await booted?.shutdown();

    restoreDatabase?.();
  });

  it('ranks text matches with the lexical ranking', async () => {
    const result = await search();

    expect(result.mode).toBe('lexical');
    expect(result.ranking).toEqual({
      method: 'mongodb-search',
      higherIsBetter: true,
      approximate: false,
    });
    expect([...result.ids].sort()).toEqual([ids.fox, ids.hounds].sort());
    expect(result.hits[0].score).toBeGreaterThanOrEqual(result.hits[1].score);
  });

  it('uses the configured language analyzer', async () => {
    const result = await search({ text: 'jumping' });

    expect(result.ids).toEqual([ids.fox]);
  });

  it('applies collection access before the result limit', async () => {
    const allowed = await search({ text: 'private fox', limit: 1, overrideAccess: true });
    const denied = await search({ text: 'private fox', limit: 1 });

    expect(allowed.ids).toEqual([ids.secret]);
    expect(denied.ids).toHaveLength(1);
    expect(denied.ids).not.toContain(ids.secret);
  });

  it('applies filters before the result limit', async () => {
    const top = await search({ limit: 1 });
    const filtered = await search({ limit: 1, where: { id: { not_equals: top.ids[0] } } });

    expect(filtered.ids).toHaveLength(1);
    expect(filtered.ids[0]).not.toBe(top.ids[0]);
  });

  it.each<{
    name: string;
    where: (ids: SeededArticles) => Where;
    expected: (keyof SeededArticles)[];
    overrideAccess?: boolean;
  }>([
    { name: 'number range', where: () => ({ rank: { greater_than: 1 } }), expected: ['hounds'] },
    { name: 'boolean', where: () => ({ featured: { equals: true } }), expected: ['fox'] },
    {
      name: 'relationship',
      where: ({ author }) => ({ author: { equals: author } }),
      expected: ['fox'],
    },
    {
      name: 'date range',
      where: () => ({ publishedAt: { greater_than: '2025-01-01T00:00:00.000Z' } }),
      expected: ['hounds'],
    },
    { name: 'id list', where: ({ hounds }) => ({ id: { in: [hounds] } }), expected: ['hounds'] },
    {
      name: 'or',
      where: () => ({ or: [{ rank: { equals: 1 } }, { rank: { equals: 2 } }] }),
      expected: ['fox', 'hounds'],
    },
    {
      name: 'exact text',
      where: () => ({ title: { equals: 'Foxes and hounds' } }),
      expected: ['hounds'],
    },
    { name: 'not in', where: () => ({ rank: { not_in: [1] } }), expected: ['hounds'] },
    {
      name: 'missing value',
      where: () => ({ publishedAt: { exists: false } }),
      expected: ['secret'],
      overrideAccess: true,
    },
    { name: 'present value', where: () => ({ author: { exists: true } }), expected: ['fox'] },
  ])('filters by $name', async ({ where, expected, overrideAccess }) => {
    const result = await search({ where: where(ids), overrideAccess });

    expect([...result.ids].sort()).toEqual(expected.map((key) => ids[key]).sort());
  });

  it('rejects filters on fields the index cannot map', async () => {
    await expect(search({ where: { tags: { equals: 'a' } } })).rejects.toMatchObject({
      name: 'SearchFilterUnsupportedError',
      status: 400,
    });
  });

  it('serves lexical search over REST', async () => {
    const response = await booted.restClient.post<{ hits: { doc: { id: string } }[] }>(
      `/api/${articlesSlug}/search`,
      { index: 'content', query: { text: 'fox' } },
    );

    expect(response.status).toBe(200);
    expect(response.body.hits.map(({ doc }) => doc.id).sort()).toEqual(
      [ids.fox, ids.hounds].sort(),
    );
  });

  it('excludes trashed documents before the result limit', async () => {
    const before = await search({ text: 'hounds fox', limit: 1 });

    await booted.frogbot.update({
      collection: articlesSlug,
      id: ids.hounds,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    });

    const after = await waitFor(
      () => search({ text: 'hounds fox', limit: 1 }),
      (result) => result.ids.length === 1 && result.ids[0] !== ids.hounds,
    );

    expect(before.ids).toEqual([ids.hounds]);
    expect(after.ids).toEqual([ids.fox]);
  });

  it('reports a dropped index as not ready until it is reconciled', async () => {
    const db = booted.payload.db as MongooseAdapter;

    await db.collections[articlesSlug].collection.dropSearchIndex('content_lexical');

    await waitFor(
      () => db.collections[articlesSlug].collection.listSearchIndexes('content_lexical').toArray(),
      (indexes) => indexes.length === 0,
    );

    await expect(search()).rejects.toMatchObject({ name: 'SearchReadinessError', status: 503 });

    await ensureSearchIndexes({ adapter: db });

    const result = await waitFor(search, ({ ids }) => ids.length > 0);

    expect(result.ids).toContain(ids.fox);
  });
});
