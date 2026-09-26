import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Where } from 'payload';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { supportsRankFusion } from '../../../packages/db-mongodb/src/search/supportsRankFusion.js';
import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import type { SeededArticles } from './shared.js';
import { articlesSlug, seedArticles, skipSearch, useSearchDatabase, waitFor } from './shared.js';

const rankFusion = vi.hoisted(() => ({ disabled: false }));

vi.mock('../../../packages/db-mongodb/src/search/supportsRankFusion.js', async (importOriginal) => {
  const actual = await importOriginal<{ supportsRankFusion: typeof supportsRankFusion }>();

  return {
    supportsRankFusion: (Model: Parameters<typeof supportsRankFusion>[0]) =>
      rankFusion.disabled ? Promise.resolve(false) : actual.supportsRankFusion(Model),
  };
});

const dirname = path.dirname(fileURLToPath(import.meta.url));

type SearchArgs = {
  index: string;
  limit: number;
  text?: string;
  vector?: number[];
  where?: Where;
};

describe.skipIf(skipSearch)('MongoDB hybrid search', () => {
  let booted: BootedFrogBot;
  let restoreDatabase: (() => void) | undefined;
  let ids: SeededArticles;

  const search = async ({ index, limit, text, vector, where }: SearchArgs) => {
    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index,
      query: { ...(text ? { text } : {}), ...(vector ? { vector } : {}) },
      limit,
      where,
      req: await booted.frogbot.createRequest(),
    });

    return { ...result, ids: result.hits.map(({ doc }) => String(doc.id)) };
  };

  const getComponents = async ({
    limit,
    ...args
  }: Required<Omit<SearchArgs, 'where'>> & { where?: Where }) => {
    const depth = Math.max(limit, 100);
    const lexical = await search({ ...args, limit: depth, vector: undefined });
    const vector = await search({ ...args, limit: depth, text: undefined });

    const rank = ({ hits }: typeof lexical) =>
      new Map(
        hits.map(({ doc, score }) => [
          String(doc.id),
          { rank: hits.findIndex((hit) => hit.score === score) + 1, score },
        ]),
      );

    return { lexical: rank(lexical), vector: rank(vector) };
  };

  const fuse = async ({
    weights,
    ...args
  }: Required<Omit<SearchArgs, 'where'>> & {
    where?: Where;
    weights: { lexical: number; vector: number };
  }) => {
    const components = await getComponents(args);
    const scores = new Map<string, number>();

    for (const [weight, component] of [
      [weights.lexical, components.lexical],
      [weights.vector, components.vector],
    ] as const) {
      for (const [id, { rank }] of component) {
        scores.set(id, (scores.get(id) ?? 0) + weight / (60 + rank));
      }
    }

    return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, args.limit);
  };

  beforeAll(async () => {
    restoreDatabase = useSearchDatabase();
    booted = await bootFrogBot(dirname, 'search-hybrid');
    ids = await seedArticles(booted.frogbot);

    await waitFor(
      () => search({ index: 'content', limit: 10, text: 'fox', vector: [1, 0, 0] }),
      (result) => result.ids.length === 3,
    );

    await waitFor(
      () => search({ index: 'nested', limit: 10, text: 'summary', vector: [0, 1, 0] }),
      (result) => result.ids.length === 3,
    );
  });

  afterAll(async () => {
    await booted?.shutdown();

    restoreDatabase?.();
  });

  describe.each([
    { path: '$rankFusion', disabled: false },
    { path: '$unionWith', disabled: true },
  ])('with $path', ({ disabled }) => {
    beforeAll(() => {
      rankFusion.disabled = disabled;
    });

    it.each([
      {
        index: 'content',
        text: 'fox',
        vector: [1, 0, 0],
        weights: { lexical: 1, vector: 1 },
        higherIsBetter: true,
      },
      {
        index: 'nested',
        text: 'summary',
        vector: [0, 1, 0],
        weights: { lexical: 1, vector: 2 },
        higherIsBetter: false,
      },
    ])(
      'fuses $index components with reciprocal rank fusion',
      async ({ higherIsBetter, ...args }) => {
        const expected = await fuse({ ...args, limit: 3 });
        const components = await getComponents({ ...args, limit: 3 });
        const result = await search({ ...args, limit: 3 });
        const scores = result.hits.map(({ score }) => score);

        expect(result.mode).toBe('hybrid');

        expect(result.ranking).toEqual({
          method: 'rrf',
          higherIsBetter: true,
          approximate: true,
          components: {
            lexical: { method: 'mongodb-search', higherIsBetter: true, approximate: false },
            vector: { method: 'mongodb-hnsw', higherIsBetter, approximate: true },
          },
        });

        expect(Object.fromEntries(result.ids.map((id, index) => [id, scores[index]]))).toEqual(
          Object.fromEntries(expected.map(([id, score]) => [id, expect.closeTo(score, 10)])),
        );

        expect(scores).toEqual([...scores].sort((a, b) => b - a));

        for (const { components: hit, doc } of result.hits) {
          for (const component of ['lexical', 'vector'] as const) {
            const ranked = components[component].get(String(doc.id));

            expect(hit?.[component]).toEqual(
              ranked ? { rank: ranked.rank, score: expect.closeTo(ranked.score, 5) } : null,
            );
          }
        }
      },
    );

    it('applies access and filters inside both components', async () => {
      const where: Where = { rank: { greater_than: 1 } };

      const expected = await fuse({
        index: 'content',
        limit: 1,
        text: 'fox',
        vector: [1, 0, 0],
        where,
        weights: { lexical: 1, vector: 1 },
      });

      const result = await search({
        index: 'content',
        limit: 1,
        text: 'fox',
        vector: [1, 0, 0],
        where,
      });

      expect(result.ids).toEqual([ids.hounds]);
      expect(result.ids).toEqual(expected.map(([id]) => id));
    });
  });
});
