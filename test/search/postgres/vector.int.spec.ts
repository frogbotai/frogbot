import { sql } from 'drizzle-orm';
import type { PayloadRequest } from 'payload';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createSearchDatabase, describePostgres, driver, type SearchDatabase } from './fixture.js';
import {
  articles,
  articlesSlug,
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  seededRandom,
  wideDimensions,
  wides,
  widesSlug,
} from './shared.js';

type Booted = Awaited<ReturnType<SearchDatabase['boot']>>;

const corpusSize = 1000;
const recallFloor = 0.9;

describePostgres(`postgres vector search [${driver}]`, () => {
  let database: SearchDatabase;
  let booted: Booted;
  const random = seededRandom(139);
  const corpus: { id: number; embedding: number[]; tenant: string }[] = [];
  const query = [0.3, -0.2, 0.9];

  const search = (index: string, options: Partial<Parameters<Booted['frogbot']['search']>[0]>) =>
    booted.frogbot.search({
      collection: articlesSlug,
      index,
      query: { vector: query },
      overrideAccess: true,
      ...options,
    });

  beforeAll(async () => {
    database = await createSearchDatabase();
    booted = await database.boot({ collections: [articles, wides] });

    const rows = Array.from({ length: corpusSize }, (_, index) => ({
      embedding: [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1],
      tenant: index % 10 === 0 ? 'a' : 'b',
    }));

    const values = rows.map(
      (_, index) =>
        `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3}::vector, 'published', now(), now())`,
    );

    const { rows: inserted } = await database.client.query<{ id: number }>(
      `insert into articles (title, tenant, embedding, _status, updated_at, created_at) values ${values.join(', ')} returning id`,
      rows.flatMap(({ embedding, tenant }, index) => [
        `Vector ${index}`,
        tenant,
        JSON.stringify(embedding),
      ]),
    );

    inserted.forEach(({ id }, index) => corpus.push({ id, ...rows[index] }));

    await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'No vector', tenant: 'a', _status: 'published' },
      overrideAccess: true,
    });
  });

  afterAll(async () => {
    await database?.shutdown();
  });

  it.each([
    ['content', 'cosine', true, (vector: number[]) => cosineSimilarity(vector, query)],
    ['nearest', 'euclidean', false, (vector: number[]) => euclideanDistance(vector, query)],
    ['product', 'dotProduct', true, (vector: number[]) => dotProduct(vector, query)],
  ] as const)(
    'ranks %s by %s and reports the score direction',
    async (index, _metric, higherIsBetter, score) => {
      const result = await search(index, { limit: 10 });

      expect(result.mode).toBe('vector');
      expect(result.ranking).toEqual({
        method: 'pgvector-hnsw',
        higherIsBetter,
        approximate: true,
      });

      const expected = [...corpus]
        .map(({ id, embedding }) => ({ id, score: score(embedding) }))
        .sort((a, b) => (higherIsBetter ? b.score - a.score : a.score - b.score))
        .slice(0, 10);

      expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));

      result.hits.forEach(({ score: actual }, position) => {
        expect(actual).toBeCloseTo(expected[position].score, 5);
      });
    },
  );

  it('excludes records without a vector', async () => {
    const result = await search('content', { limit: corpusSize + 1 });

    expect(result.hits).toHaveLength(corpusSize);
    expect(result.hits.some(({ doc }) => doc.title === 'No vector')).toBe(false);
  });

  it(`keeps filtered HNSW recall at or above ${recallFloor} inside a 10% access predicate`, async () => {
    const req = await booted.frogbot.createRequest();

    req.context.searchTenant = 'a';

    let found = 0;
    let total = 0;

    for (let attempt = 0; attempt < 20; attempt++) {
      const vector = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];

      const result = await booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { vector },
        limit: 10,
        overrideAccess: false,
        req,
      });

      expect(result.hits.every(({ doc }) => doc.tenant === 'a')).toBe(true);

      const expected = new Set(
        corpus
          .filter(({ tenant }) => tenant === 'a')
          .map(({ id, embedding }) => ({ id, score: cosineSimilarity(embedding, vector) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(({ id }) => id),
      );

      found += result.hits.filter(({ doc }) => expected.has(doc.id as number)).length;
      total += expected.size;
    }

    expect(found / total).toBeGreaterThanOrEqual(recallFloor);
  });

  it('does not leak transaction-scoped HNSW settings to pooled connections', async () => {
    await search('content', { limit: 200 });

    const { drizzle } = booted.payload.db as unknown as {
      drizzle: {
        transaction<T>(
          callback: (tx: { execute(query: unknown): Promise<{ rows: T[] }> }) => Promise<T>,
        ): Promise<T>;
      };
    };

    const settings = await Promise.all(
      Array.from({ length: 4 }, () =>
        drizzle.transaction<string>(async (tx) => {
          await tx.execute(sql`select '[1,2,3]'::vector`);

          const { rows } = await tx.execute(
            sql`select current_setting('hnsw.iterative_scan') || ',' || current_setting('hnsw.ef_search') as value, pg_sleep(0.05)`,
          );

          return (rows[0] as { value: string }).value;
        }),
      ),
    );

    expect(settings).toEqual(['off,40', 'off,40', 'off,40', 'off,40']);
  });

  it('reads uncommitted rows through the request transaction', async () => {
    const { payload } = booted;
    const req = (await booted.frogbot.createRequest()) as unknown as PayloadRequest;

    req.transactionID = (await payload.db.beginTransaction()) ?? undefined;

    try {
      const created = await payload.create({
        collection: articlesSlug,
        data: { title: 'Uncommitted', embedding: query, _status: 'published' },
        req,
      });

      const result = await booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { vector: query },
        limit: 1,
        overrideAccess: true,
        req: req as never,
      });

      expect(result.hits.map(({ doc }) => doc.id)).toEqual([created.id]);
    } finally {
      await payload.db.rollbackTransaction(req.transactionID!);
    }

    const outside = await search('content', { limit: 1 });

    expect(outside.hits[0]?.doc.title).not.toBe('Uncommitted');
  });

  it('runs exact search when the index opts out of approximation', async () => {
    const where = { tenant: { equals: 'a' } };
    const result = await search('exact', { limit: 25, where });

    const expected = corpus
      .filter(({ tenant }) => tenant === 'a')
      .map(({ embedding, id }) => ({ id, score: cosineSimilarity(embedding, query) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);

    expect(result.ranking).toEqual({
      method: 'pgvector-exact',
      higherIsBetter: true,
      approximate: false,
    });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));
  });

  it('uses exact search when dimensions exceed the HNSW limit', async () => {
    const vector = Array.from({ length: wideDimensions }, (_, index) => (index % 7) / 7);

    await booted.frogbot.create({
      collection: widesSlug,
      data: { title: 'Wide', embedding: vector },
      overrideAccess: true,
    });

    const result = await booted.frogbot.search({
      collection: widesSlug,
      index: 'wide',
      query: { vector },
      overrideAccess: true,
    });

    expect(result.ranking).toEqual({
      method: 'pgvector-exact',
      higherIsBetter: true,
      approximate: false,
    });

    expect(result.hits.map(({ doc }) => doc.title)).toEqual(['Wide']);
    expect(result.hits[0].score).toBeCloseTo(1, 5);
  });

  it('rejects vectors with the wrong length or non-finite values', async () => {
    for (const vector of [[], [1, 2], [1, 2, Number.NaN], [1, 2, Number.POSITIVE_INFINITY]]) {
      await expect(search('content', { query: { vector } })).rejects.toMatchObject({
        name: 'SearchValidationError',
        status: 400,
      });
    }
  });
});
