import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { type BootedSearch, createSearchDatabase, type SearchDatabase } from './fixture.js';
import { articlesSlug, pagesSlug } from './shared.js';

describe('D1 searchMany', () => {
  let database: SearchDatabase;
  let booted: BootedSearch;

  const collections = [
    { collection: pagesSlug, index: 'content' },
    { collection: articlesSlug, index: 'content' },
  ];

  beforeAll(async () => {
    database = await createSearchDatabase();
    booted = await database.boot();
  });

  afterAll(async () => {
    await database.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('searchMany returns lexical lists in request order that equal search() on each collection', async () => {
    for (const title of ['Garden tools', 'Garden gloves garden', 'Kitchen knives']) {
      await booted.frogbot.create({
        collection: articlesSlug,
        data: { title, _status: 'published' },
        overrideAccess: true,
      });
    }

    for (const title of ['Garden plan', 'Garden party', 'Office hours']) {
      await booted.frogbot.create({ collection: pagesSlug, data: { title }, overrideAccess: true });
    }

    const result = await booted.frogbot.searchMany({
      collections,
      query: { text: 'garden' },
      limit: 2,
      overrideAccess: true,
    });

    const expected = [];

    for (const entry of collections) {
      const single = await booted.frogbot.search({
        ...entry,
        query: { text: 'garden' },
        limit: 2,
        overrideAccess: true,
      });

      expected.push({ collection: entry.collection, ...single });
    }

    expect(result.results.map(({ collection, hits }) => [collection, hits.length])).toEqual([
      [pagesSlug, 2],
      [articlesSlug, 2],
    ]);
    expect(result.results).toEqual(expected);
  });

  it('searchMany rejects a vector query with SearchValidationError naming the collection and index', async () => {
    await expect(
      booted.frogbot.searchMany({
        collections: [...collections].reverse(),
        query: { vector: Array.from({ length: 1536 }, () => 0.1) },
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({
      name: 'SearchValidationError',
      status: 400,
      message: `Search index 'content' in collection '${articlesSlug}' does not configure vector search.`,
    });
  });
});
