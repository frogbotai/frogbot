import { afterAll, beforeAll, expect, it } from 'vitest';

import { createSearchDatabase, describePostgres, driver, type SearchDatabase } from './fixture.js';
import { articles, articlesSlug } from './shared.js';

type Booted = Awaited<ReturnType<SearchDatabase['boot']>>;

type SearchOptions = Parameters<Booted['frogbot']['search']>[0];

const rankConstant = 60;

describePostgres(`postgres hybrid search [${driver}]`, () => {
  let database: SearchDatabase;
  let booted: Booted;
  const vector = [1, 0, 0];

  const search = (options: Partial<SearchOptions>) =>
    booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'frog', vector },
      overrideAccess: true,
      ...options,
    });

  async function fuse(
    options: Partial<SearchOptions>,
    weights = { lexical: 1, vector: 1 },
    candidates = 100,
  ) {
    const [lexical, semantic] = await Promise.all([
      search({ ...options, query: { text: 'frog' }, limit: candidates }),
      search({ ...options, query: { vector }, limit: candidates }),
    ]);

    const fused = new Map<
      number,
      {
        id: number;
        score: number;
        components: Record<'lexical' | 'vector', { rank: number; score: number } | null>;
      }
    >();

    const add = (component: 'lexical' | 'vector', hits: typeof lexical.hits) => {
      hits.forEach(({ doc, score }, index) => {
        const id = doc.id as number;
        const entry = fused.get(id) ?? {
          id,
          score: 0,
          components: { lexical: null, vector: null },
        };

        entry.score += weights[component] / (rankConstant + index + 1);
        entry.components[component] = { rank: index + 1, score };
        fused.set(id, entry);
      });
    };

    add('lexical', lexical.hits);
    add('vector', semantic.hits);

    return [...fused.values()].sort((a, b) => b.score - a.score || a.id - b.id);
  }

  function expectComponents(
    hits: Awaited<ReturnType<typeof search>>['hits'],
    expected: Awaited<ReturnType<typeof fuse>>,
  ) {
    hits.forEach(({ components }, index) => {
      for (const component of ['lexical', 'vector'] as const) {
        const want = expected[index].components[component];

        if (want === null) {
          expect(components?.[component]).toBeNull();
        } else {
          expect(components?.[component]?.rank).toBe(want.rank);
          expect(components?.[component]?.score).toBeCloseTo(want.score, 10);
        }
      }
    });
  }

  beforeAll(async () => {
    database = await createSearchDatabase();
    booted = await database.boot({ collections: [articles] });

    const records = [
      { title: 'Frog frog frog', embedding: [0, 1, 0], tenant: 'a' },
      { title: 'Frog and toad', embedding: [0.9, 0.1, 0], tenant: 'a' },
      { title: 'Frog habitats', embedding: [0.5, 0.5, 0], tenant: 'b' },
      { title: 'Vector only', embedding: [1, 0, 0], tenant: 'b' },
      { title: 'Text only frog', tenant: 'a' },
      { title: 'Unrelated', embedding: [-0.2, 0, 1], tenant: 'a' },
    ];

    for (const data of records) {
      await booted.frogbot.create({
        collection: articlesSlug,
        data: { ...data, _status: 'published' },
        overrideAccess: true,
      });
    }
  });

  afterAll(async () => {
    await database?.shutdown();
  });

  it('fuses lexical and vector ranks with reciprocal rank fusion in one query', async () => {
    const result = await search({ limit: 10 });

    expect(result.mode).toBe('hybrid');
    expect(result.ranking).toEqual({
      method: 'rrf',
      higherIsBetter: true,
      approximate: true,
      components: {
        lexical: { method: 'postgres-fts', higherIsBetter: true, approximate: false },
        vector: { method: 'pgvector-hnsw', higherIsBetter: true, approximate: true },
      },
    });

    const expected = await fuse({});

    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));

    result.hits.forEach(({ score }, index) => {
      expect(score).toBeCloseTo(expected[index].score, 10);
    });

    expectComponents(result.hits, expected);
  });

  it('keeps records that appear in only one component with the other component null', async () => {
    const hits = (await search({ limit: 10 })).hits;
    const byTitle = (title: string) => hits.find(({ doc }) => doc.title === title)?.components;

    expect(byTitle('Vector only')).toMatchObject({ lexical: null, vector: { rank: 1 } });
    expect(byTitle('Text only frog')).toMatchObject({ lexical: { rank: 4 }, vector: null });
  });

  it('fuses only the requested number of candidates from each component', async () => {
    const full = await fuse({});
    const narrow = await fuse({}, undefined, 1);

    expect(narrow[0].id).not.toBe(full[0].id);

    const result = await search({ limit: 1, candidates: 1 });

    expect(result.hits.map(({ doc }) => doc.id)).toEqual([narrow[0].id]);
    expectComponents(result.hits, narrow);
  });

  it('uses the index default candidates unless the query overrides them', async () => {
    const full = await fuse({});
    const narrow = await fuse({}, undefined, 1);

    const defaulted = await search({ index: 'narrow', limit: 1 });
    const overridden = await search({ index: 'narrow', limit: 1, candidates: 100 });

    expect(defaulted.hits.map(({ doc }) => doc.id)).toEqual([narrow[0].id]);
    expect(overridden.hits.map(({ doc }) => doc.id)).toEqual([full[0].id]);
  });

  it('never fuses fewer candidates than the requested limit', async () => {
    const result = await search({ index: 'narrow', limit: 10 });
    const expected = await fuse({}, undefined, 10);

    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));
  });

  it('applies configured component weights', async () => {
    const result = await search({ index: 'weighted', limit: 10 });

    const expected = await fuse({ index: 'weighted' }, { lexical: 1, vector: 3 });

    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));

    result.hits.forEach(({ score }, index) => {
      expect(score).toBeCloseTo(expected[index].score, 10);
    });
  });

  it('applies filters to both components before fusing', async () => {
    const where = { tenant: { equals: 'a' } };
    const result = await search({ where, limit: 10 });
    const expected = await fuse({ where });

    expect(result.hits.every(({ doc }) => doc.tenant === 'a')).toBe(true);
    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));
  });

  it('limits the fused result', async () => {
    const result = await search({ limit: 2 });
    const expected = await fuse({});

    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.slice(0, 2).map(({ id }) => id));
  });
});
