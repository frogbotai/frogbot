import type { FrogBotConfig, SearchManyOptions, SearchQuery } from 'frogbot';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

import { createSearchDatabase, describePostgres, driver, type SearchDatabase } from './fixture.js';
import { articles, articlesSlug, guides, guidesSlug, localization } from './shared.js';

type Booted = Awaited<ReturnType<SearchDatabase['boot']>>;

const concurrentQueryWarning = /already executing a query/;

const notesSlug = 'notes';

const notes: NonNullable<FrogBotConfig['collections']>[number] = {
  slug: notesSlug,
  access: { read: () => true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'embedding', type: 'vector', dimensions: 3 },
  ],
  search: {
    notes: {
      lexical: { fields: ['title'] },
      vector: { field: 'embedding' },
    },
  },
};

describePostgres(`postgres searchMany [${driver}]`, () => {
  let database: SearchDatabase;
  let booted: Booted;
  let transactionID: number | string | undefined;
  let emitWarning: ReturnType<typeof vi.spyOn>;

  const collections = [
    { collection: guidesSlug, index: 'guides' },
    { collection: articlesSlug, index: 'content' },
    { collection: notesSlug, index: 'notes' },
  ];

  const searchEach = async (options: Omit<SearchManyOptions, 'collections'>) => {
    const results = [];

    for (const entry of collections) {
      const result = await booted.frogbot.search({ ...options, ...entry });

      results.push({ collection: entry.collection, ...result });
    }

    return results;
  };

  const openTransaction = async () => {
    const req = await booted.frogbot.createRequest();

    transactionID = (await booted.payload.db.beginTransaction()) ?? undefined;
    req.transactionID = transactionID;

    return req;
  };

  beforeAll(async () => {
    emitWarning = vi.spyOn(process, 'emitWarning');

    database = await createSearchDatabase();

    booted = await database.boot({
      collections: [articles, { ...guides, access: { read: () => true } }, notes],
      localization,
    });

    const records = [
      { title: 'Frog frog frog', body: 'A frog chorus', tenant: 'a', embedding: [1, 0, 0] },
      { title: 'Frog habitats', body: 'Where frogs live', tenant: 'a', embedding: [0.8, 0.6, 0] },
      { title: 'Jumping frogs', body: 'Frogs jump far', tenant: 'b', embedding: [0.9, 0, 0.1] },
      { title: 'Newts', body: 'Salamanders and newts', tenant: 'a', embedding: [0, 1, 0] },
    ];

    for (const data of records) {
      await booted.frogbot.create({
        collection: articlesSlug,
        data: { ...data, _status: 'published' },
        overrideAccess: true,
      });
    }

    const guideRecords = [
      { title: 'Frog care', summary: 'Feeding frogs', meta: { embedding: [1, 0.1, 0] } },
      { title: 'Frog ponds', summary: 'Building a frog pond', meta: { embedding: [0.5, 0.5, 0] } },
      { title: 'Frog songs', summary: 'Calls at night', meta: { embedding: [0, 0, 1] } },
      { title: 'Lizards', summary: 'Warm rocks', meta: { embedding: [0, 1, 0] } },
    ];

    for (const data of guideRecords) {
      await booted.frogbot.create({
        collection: guidesSlug,
        data,
        locale: 'en',
        overrideAccess: true,
      });
    }

    const noteRecords = [
      { title: 'Frog spawn', embedding: [1, 0, 0.2] },
      { title: 'Frog legs', embedding: [0.3, 0.3, 0.3] },
      { title: 'Frog calls', embedding: [0, 0.2, 1] },
      { title: 'Tadpoles', embedding: [0, 1, 0] },
    ];

    for (const data of noteRecords) {
      await booted.frogbot.create({ collection: notesSlug, data, overrideAccess: true });
    }
  });

  afterEach(async () => {
    await booted.payload.db.rollbackTransaction(transactionID ?? '');

    transactionID = undefined;
  });

  afterAll(async () => {
    emitWarning?.mockRestore();

    await database?.shutdown();
  });

  it.each<{ mode: string; query: SearchQuery }>([
    { mode: 'lexical', query: { text: 'frog' } },
    { mode: 'vector', query: { vector: [1, 0, 0] } },
    { mode: 'hybrid', query: { text: 'frog', vector: [1, 0, 0] } },
  ])(
    'searchMany returns $mode lists in request order that equal search() on each collection',
    async ({ mode, query }) => {
      const result = await booted.frogbot.searchMany({
        collections,
        query,
        limit: 2,
        overrideAccess: true,
      });

      const expected = await searchEach({ query, limit: 2, overrideAccess: true });

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

  it('searchMany ranks articles inside the caller access predicate without narrowing the others', async () => {
    const req = await booted.frogbot.createRequest();

    req.context.searchTenant = 'b';

    const result = await booted.frogbot.searchMany({
      collections,
      query: { text: 'frog' },
      req,
    });

    const single = await searchEach({ query: { text: 'frog' }, req });
    const unrestricted = await searchEach({ query: { text: 'frog' }, overrideAccess: true });

    const [guideList, articleList, noteList] = result.results;

    expect(result.results).toEqual(single);
    expect(articleList.hits.map(({ doc }) => doc.title)).toEqual(['Jumping frogs']);
    expect(unrestricted[1].hits).toHaveLength(3);
    expect(guideList).toEqual(unrestricted[0]);
    expect(noteList).toEqual(unrestricted[2]);
  });

  it('searchMany inside a transaction returns the same lists as outside it', async () => {
    const options = {
      collections,
      query: { text: 'frog', vector: [1, 0, 0] },
      overrideAccess: true,
    };

    const outside = await booted.frogbot.searchMany(options);

    const req = await openTransaction();

    const inside = await booted.frogbot.searchMany({ ...options, req });

    expect(inside).toEqual(outside);
  });

  it('searchMany reads uncommitted rows in every collection through one transaction client', async () => {
    const req = await openTransaction();

    const guide = await booted.frogbot.create({
      collection: guidesSlug,
      data: { title: 'Uncommitted heron', meta: { embedding: [0, 0.1, 1] } },
      locale: 'en',
      overrideAccess: true,
      req,
    });

    const article = await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'Uncommitted heron', embedding: [0, 0.1, 1], _status: 'published' },
      overrideAccess: true,
      req,
    });

    const note = await booted.frogbot.create({
      collection: notesSlug,
      data: { title: 'Uncommitted heron', embedding: [0, 0.1, 1] },
      overrideAccess: true,
      req,
    });

    const options = {
      collections,
      query: { text: 'heron', vector: [0, 0.1, 1] },
      limit: 1,
      overrideAccess: true,
    };

    const inside = await booted.frogbot.searchMany({ ...options, req });

    await booted.payload.db.rollbackTransaction(transactionID!);

    const after = await booted.frogbot.searchMany(options);

    const warnings = emitWarning.mock.calls.filter(([warning]) =>
      concurrentQueryWarning.test(String(warning)),
    );

    expect(inside.results.map(({ hits }) => hits.map(({ doc }) => doc.id))).toEqual([
      [guide.id],
      [article.id],
      [note.id],
    ]);
    expect(after.results.map(({ hits }) => hits[0]?.doc.title)).not.toContain('Uncommitted heron');
    expect(warnings).toEqual([]);
  });
});
