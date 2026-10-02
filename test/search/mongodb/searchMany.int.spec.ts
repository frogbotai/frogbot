import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SearchManyOptions, SearchQuery } from 'frogbot';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import type { SeededArticles } from './shared.js';
import {
  articlesSlug,
  postsSlug,
  seedArticles,
  skipSearch,
  useSearchDatabase,
  waitFor,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const collections = [
  { collection: postsSlug, index: 'content' },
  { collection: articlesSlug, index: 'content' },
];

describe.skipIf(skipSearch)('MongoDB searchMany', () => {
  let booted: BootedFrogBot;
  let restoreDatabase: (() => void) | undefined;
  let ids: SeededArticles;

  const searchEach = async (options: Omit<SearchManyOptions, 'collections'>) => {
    const results = [];

    for (const entry of collections) {
      const result = await booted.frogbot.search({ ...options, ...entry });

      results.push({ collection: entry.collection, ...result });
    }

    return results;
  };

  const count = async (collection: string, query: SearchQuery) => {
    const result = await booted.frogbot.search({
      collection,
      index: 'content',
      query,
      overrideAccess: true,
    });

    return result.hits.length;
  };

  beforeAll(async () => {
    restoreDatabase = useSearchDatabase();
    booted = await bootFrogBot(dirname, 'search-many');
    ids = await seedArticles(booted.frogbot);

    const posts = [
      { title: 'fox tracks', embedding: [1, 0, 0] },
      { title: 'fox den', embedding: [0, 1, 0] },
      { title: 'arctic fox', embedding: [0.6, 0.8, 0] },
      { title: 'hello world', embedding: [0, 0, 1] },
    ];

    for (const data of posts) {
      await booted.frogbot.create({
        collection: postsSlug,
        data: { ...data, _status: 'published' },
        locale: 'en',
        overrideAccess: true,
      });
    }

    await waitFor(
      async () => [
        await count(articlesSlug, { text: 'fox' }),
        await count(articlesSlug, { vector: [1, 0, 0] }),
        await count(postsSlug, { text: 'fox' }),
        await count(postsSlug, { vector: [1, 0, 0] }),
      ],
      (counts) => counts.join() === '3,4,3,4',
    );
  });

  afterAll(async () => {
    await booted?.shutdown();

    restoreDatabase?.();
  });

  it.each<{ mode: string; query: SearchQuery }>([
    { mode: 'lexical', query: { text: 'fox' } },
    { mode: 'vector', query: { vector: [1, 0, 0] } },
    { mode: 'hybrid', query: { text: 'fox', vector: [1, 0, 0] } },
  ])(
    'searchMany returns $mode lists in request order that equal search() on each collection',
    async ({ mode, query }) => {
      const req = await booted.frogbot.createRequest();

      const result = await booted.frogbot.searchMany({ collections, query, limit: 2, req });

      const expected = await searchEach({ query, limit: 2, req });

      expect(
        result.results.map((list) => ({
          collection: list.collection,
          mode: list.mode,
          hits: list.hits.length,
        })),
      ).toEqual(collections.map(({ collection }) => ({ collection, mode, hits: 2 })));
      expect(result.results).toEqual(expected);
    },
  );

  it('searchMany ranks only public articles beside every post', async () => {
    const result = await booted.frogbot.searchMany({
      collections,
      query: { text: 'fox' },
      req: await booted.frogbot.createRequest(),
    });

    const [posts, articles] = result.results;

    expect(posts.hits).toHaveLength(3);
    expect(articles.hits.map(({ doc }) => String(doc.id)).sort()).toEqual(
      [ids.fox, ids.hounds].sort(),
    );
  });

  it('POST /api/frogbot/search returns the Local API result', async () => {
    const options = {
      collections,
      query: { text: 'fox', vector: [1, 0, 0] },
      limit: 3,
    };

    const response = await booted.restClient.post('/api/frogbot/search', options);

    const local = await booted.frogbot.searchMany({
      ...options,
      req: await booted.frogbot.createRequest(),
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(local);
  });
});
