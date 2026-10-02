import { Forbidden } from 'payload';
import { describe, expect, it } from 'vitest';

import { SearchValidationError } from '../../../../packages/frogbot/src/search/errors.js';
import {
  searchManyOperation,
  searchOperation,
} from '../../../../packages/frogbot/src/search/operation.js';
import { faqIndex, hybridRanking, ranking, searchFixture } from './fixture.js';

const articles = { collection: 'articles', index: 'content' };
const faqs = { collection: 'faqs', index: 'answers' };
const query = { text: 'hello' };

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('searchMany results', () => {
  it('returns one list per collection in request order, tagged with its collection', async () => {
    const { frogbot, payload, req } = searchFixture();

    const { results } = await searchManyOperation(frogbot, payload, {
      collections: [faqs, articles],
      query,
      req,
    });

    expect(results).toEqual([
      {
        collection: 'faqs',
        mode: 'lexical',
        ranking,
        hits: [{ doc: { id: 7, question: 'stored' }, score: 0.4 }],
      },
      {
        collection: 'articles',
        mode: 'lexical',
        ranking,
        hits: [{ doc: { id: 1, title: 'stored' }, score: 0.5 }],
      },
    ]);
  });

  it('returns each list exactly as a single search of that collection returns it', async () => {
    const { frogbot, payload, req } = searchFixture({
      rowRanking: hybridRanking,
      rows: [
        {
          id: 1,
          score: 0.03,
          components: { lexical: { rank: 1, score: 0.1 }, vector: { rank: 2, score: 0.9 } },
        },
      ],
      faqs: {
        rows: [
          { id: 7, score: 0.02, components: { lexical: null, vector: { rank: 1, score: 0.8 } } },
        ],
      },
    });

    const shared = { query: { text: 'hello', vector: [1, 0, 0] }, limit: 5, req };

    const { results } = await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      ...shared,
    });

    const articleResult = await searchOperation(frogbot, payload, { ...articles, ...shared });
    const faqResult = await searchOperation(frogbot, payload, { ...faqs, ...shared });

    expect(results).toEqual([
      { collection: 'articles', ...articleResult },
      { collection: 'faqs', ...faqResult },
    ]);
  });

  it('accepts a single collection', async () => {
    const { frogbot, payload, req } = searchFixture();

    const { results } = await searchManyOperation(frogbot, payload, {
      collections: [faqs],
      query,
      req,
    });

    const faqResult = await searchOperation(frogbot, payload, { ...faqs, query, req });

    expect(results).toEqual([{ collection: 'faqs', ...faqResult }]);
  });

  it("sends each entry's where, select, depth and candidates to its own collection only", async () => {
    const { find, frogbot, payload, req, search } = searchFixture();

    await searchManyOperation(frogbot, payload, {
      collections: [
        {
          ...articles,
          where: { title: { equals: 'hello' } },
          select: { title: true },
          depth: 1,
          candidates: 250,
        },
        faqs,
      ],
      query: { vector: [1, 0, 0] },
      overrideAccess: true,
      req,
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        collection: 'articles',
        candidates: 250,
        where: {
          and: [
            { title: { equals: 'hello' } },
            { deletedAt: { exists: false } },
            { _status: { equals: 'published' } },
          ],
        },
      }),
    );
    expect(search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: 'faqs', candidates: 20, where: {} }),
    );
    expect(find).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ collection: 'articles', select: { title: true }, depth: 1 }),
    );
    expect(find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ collection: 'faqs', select: undefined, depth: 0 }),
    );
  });

  it('keeps the other lists unchanged when one collection drops a ranked row', async () => {
    const { frogbot, payload, req } = searchFixture({
      rows: [
        { id: 1, score: 0.9 },
        { id: 2, score: 0.8 },
      ],
      docs: [{ id: 2, title: 'visible' }],
      faqs: {
        rows: [
          { id: 7, score: 0.6 },
          { id: 8, score: 0.5 },
        ],
        docs: [
          { id: 7, question: 'first' },
          { id: 8, question: 'second' },
        ],
      },
    });

    const { results } = await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      query,
      req,
    });

    expect(results.map(({ hits }) => hits)).toEqual([
      [{ doc: { id: 2, title: 'visible' }, score: 0.8 }],
      [
        { doc: { id: 7, question: 'first' }, score: 0.6 },
        { doc: { id: 8, question: 'second' }, score: 0.5 },
      ],
    ]);
  });
});

describe('searchMany validation', () => {
  it.each([
    ['an empty list', [], 'Search requires a non-empty collections list.'],
    ['a non-array list', { 0: articles }, 'Search requires a non-empty collections list.'],
    [
      'a non-object entry',
      [articles, null],
      'Search requires every collections entry to be an object.',
    ],
    [
      'an entry without an index',
      [articles, { collection: 'faqs' }],
      'Search requires a collection and an index on every collections entry.',
    ],
    [
      'an entry with a non-string collection',
      [{ collection: 1, index: 'content' }],
      'Search requires a collection and an index on every collections entry.',
    ],
    [
      'a repeated collection',
      [articles, { collection: 'articles', index: 'content' }],
      "Search lists collection 'articles' more than once.",
    ],
    [
      'a per-collection query',
      [articles, { ...faqs, query: { text: 'faq' } }],
      "Search index 'answers' in collection 'faqs' does not accept a per-collection 'query' option.",
    ],
    [
      'a per-collection limit',
      [{ ...articles, limit: 3 }],
      "Search index 'content' in collection 'articles' does not accept a per-collection 'limit' option.",
    ],
  ])('rejects %s before searching', async (_case, collections, message) => {
    const { find, frogbot, payload, req, search } = searchFixture();

    const searching = searchManyOperation(frogbot, payload, {
      collections: collections as never,
      query,
      req,
    });

    await expect(searching).rejects.toThrow(SearchValidationError);
    await expect(searching).rejects.toThrow(message);

    expect(search).not.toHaveBeenCalled();
    expect(find).not.toHaveBeenCalled();
  });

  it('checks every collection before searching any of them', async () => {
    const { frogbot, payload, req, search } = searchFixture();

    frogbot.collections.faqs.search!.answers = {
      ...faqIndex,
      vector: { ...faqIndex.vector, dimensions: 2 },
    };

    await expect(
      searchManyOperation(frogbot, payload, {
        collections: [articles, faqs],
        query: { vector: [1, 0, 0] },
        req,
      }),
    ).rejects.toThrow(
      "Search index 'answers' in collection 'faqs' requires a vector of 2 finite numbers.",
    );

    expect(search).not.toHaveBeenCalled();
  });

  it('reports a vector query on a collection without vector search', async () => {
    const { frogbot, payload, req, search } = searchFixture();
    const { vector: _vector, hybrid: _hybrid, ...lexicalIndex } = faqIndex;

    frogbot.collections.faqs.search!.answers = lexicalIndex;

    await expect(
      searchManyOperation(frogbot, payload, {
        collections: [articles, faqs],
        query: { vector: [1, 0, 0] },
        req,
      }),
    ).rejects.toThrow(
      "Search index 'answers' in collection 'faqs' does not configure vector search.",
    );

    expect(search).not.toHaveBeenCalled();
  });

  it('reports an invalid shared limit on the first collection', async () => {
    const { frogbot, payload, req, search } = searchFixture();

    await expect(
      searchManyOperation(frogbot, payload, {
        collections: [articles, faqs],
        query,
        limit: 0,
        req,
      }),
    ).rejects.toThrow(
      "Search index 'content' in collection 'articles' requires a positive integer limit.",
    );

    expect(search).not.toHaveBeenCalled();
  });
});

describe('searchMany access and execution', () => {
  it('fails the whole call when a later collection denies read access', async () => {
    const { frogbot, payload, req } = searchFixture({ faqs: { read: () => false } });

    await expect(
      searchManyOperation(frogbot, payload, {
        collections: [articles, faqs],
        query,
        req,
      }),
    ).rejects.toThrow(Forbidden);
  });

  it('skips read access for every collection with overrideAccess', async () => {
    const { frogbot, payload, req } = searchFixture({
      read: () => false,
      faqs: { read: () => false },
    });

    const { results } = await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      query,
      overrideAccess: true,
      req,
    });

    expect(results.map(({ hits }) => hits.length)).toEqual([1, 1]);
  });

  it('runs one collection to completion before starting the next', async () => {
    const { find, frogbot, payload, req, search } = searchFixture();

    const events: string[] = [];

    search.mockImplementation(async ({ collection }) => {
      events.push(`search ${collection}`);

      await nextTurn();

      events.push(`searched ${collection}`);

      return { ranking, rows: [{ id: 1, score: 0.5 }] };
    });

    find.mockImplementation(async ({ collection }) => {
      events.push(`find ${collection}`);

      await nextTurn();

      events.push(`found ${collection}`);

      return { docs: [{ id: 1 }] };
    });

    await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      query,
      req,
    });

    expect(events).toEqual([
      'search articles',
      'searched articles',
      'find articles',
      'found articles',
      'search faqs',
      'searched faqs',
      'find faqs',
      'found faqs',
    ]);
  });

  it('passes the caller request to every collection search and read', async () => {
    const { find, frogbot, payload, req, search } = searchFixture();

    await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      query,
      req,
    });

    const requests = [...search.mock.calls, ...find.mock.calls].map(([args]) => args.req);

    expect(requests).toHaveLength(4);
    expect(requests.filter((request) => request !== req)).toEqual([]);
  });

  it('creates one request for every collection when req is omitted', async () => {
    const { createRequest, frogbot, payload, search } = searchFixture();

    await searchManyOperation(frogbot, payload, {
      collections: [articles, faqs],
      query,
      overrideAccess: true,
    });

    expect(createRequest).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]![0].req).toBe(search.mock.calls[1]![0].req);
  });
});
