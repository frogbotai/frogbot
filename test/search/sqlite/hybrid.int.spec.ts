import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, databasePath } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Hit = { doc: { id: number | string }; score: number };

function fuse(lists: { hits: Hit[]; weight: number }[]): { id: number; score: number }[] {
  const scores = new Map<number, number>();

  for (const { hits, weight } of lists) {
    for (const [index, { doc }] of hits.entries()) {
      const id = doc.id as number;

      scores.set(id, (scores.get(id) ?? 0) + weight / (60 + index + 1));
    }
  }

  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

describe('SQLite hybrid search', () => {
  let booted: BootedFrogBot;

  const create = (data: Record<string, unknown>) =>
    booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', ...data },
      overrideAccess: true,
    } as never) as Promise<{ id: number }>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-hybrid');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('fuses lexical and vector rankings with reciprocal rank fusion in one query', async () => {
    const lexicalOnly = await create({ title: 'Recovery guide recovery' });
    const both = await create({ title: 'Recovery steps', embedding: [1, 0, 0] });
    const vectorOnly = await create({ title: 'Unrelated', embedding: [0.9, 0.1, 0] });

    await create({ title: 'Other', embedding: [-1, 0, 0] });

    const text = 'recovery';
    const vector = [1, 0.05, 0];

    const [hybrid, lexical, semantic] = await Promise.all([
      booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text, vector },
        overrideAccess: true,
      }),
      booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { text },
        limit: 100,
        overrideAccess: true,
      }),
      booted.frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { vector },
        limit: 100,
        overrideAccess: true,
      }),
    ]);

    const expected = fuse([
      { hits: lexical.hits, weight: 1 },
      { hits: semantic.hits, weight: 1 },
    ]);

    expect(hybrid.mode).toBe('hybrid');
    expect(hybrid.ranking).toEqual({
      method: 'rrf',
      higherIsBetter: true,
      approximate: false,
      components: {
        lexical: { method: 'sqlite-fts5', higherIsBetter: true, approximate: false },
        vector: { method: 'libsql-exact', higherIsBetter: true, approximate: false },
      },
    });
    expect(hybrid.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));

    for (const [index, hit] of hybrid.hits.entries()) {
      expect(hit.score).toBeCloseTo(expected[index].score, 10);
    }

    for (const hit of hybrid.hits) {
      const component = (hits: Hit[]) => {
        const rank = hits.findIndex(({ doc }) => doc.id === hit.doc.id);

        return rank < 0 ? null : { rank: rank + 1, score: hits[rank].score };
      };

      expect(hit.components).toEqual({
        lexical: component(lexical.hits),
        vector: component(semantic.hits),
      });
    }

    expect(hybrid.hits.find(({ doc }) => doc.id === lexicalOnly.id)?.components?.vector).toBe(
      null,
    );
    expect(hybrid.hits.find(({ doc }) => doc.id === vectorOnly.id)?.components?.lexical).toBe(
      null,
    );
    expect(hybrid.hits[0].doc.id).toBe(both.id);
    expect(hybrid.hits.map(({ doc }) => doc.id)).toEqual(
      expect.arrayContaining([lexicalOnly.id, vectorOnly.id]),
    );
  });

  it('applies configured weights and predicates to both components', async () => {
    const lexical = await create({
      details: { summary: 'weighted keyword' },
      rating: 5,
    });

    const semantic = await create({
      details: { summary: 'nothing', embedding: [1, 0] },
      rating: 5,
    });

    await create({ details: { summary: 'weighted keyword', embedding: [1, 0] }, rating: 1 });

    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'details',
      query: { text: 'keyword', vector: [1, 0] },
      where: { rating: { greater_than: 3 } },
      overrideAccess: true,
    });

    expect(result.hits.map(({ doc }) => doc.id)).toEqual([lexical.id, semantic.id]);
    expect(result.hits[0].score).toBeCloseTo(2 / 61, 10);
    expect(result.hits[1].score).toBeCloseTo(1 / 61, 10);
  });

  const seedCandidates = async () => {
    const lexicalFirst = await create({ title: 'frog frog frog', embedding: [-1, 0, 0] });
    const balanced = await create({
      title: 'frog',
      body: 'a long body about ponds, lilies and quiet evenings',
      embedding: [0.95, 0.05, 0],
    });

    await create({ title: 'toad', embedding: [1, 0, 0] });
    await create({ title: 'newt', embedding: [0.8, 0.6, 0] });

    return { balanced, lexicalFirst };
  };

  const hybridSearch = (options: Record<string, unknown>) =>
    booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'frog', vector: [1, 0, 0] },
      overrideAccess: true,
      ...options,
    } as never);

  it('fuses only the requested number of candidates from each component', async () => {
    const { balanced, lexicalFirst } = await seedCandidates();

    const full = await hybridSearch({ limit: 1 });
    const narrow = await hybridSearch({ limit: 1, candidates: 1 });

    expect(full.hits.map(({ doc }) => doc.id)).toEqual([balanced.id]);
    expect(narrow.hits.map(({ doc }) => doc.id)).toEqual([lexicalFirst.id]);
    expect(narrow.hits[0].components).toMatchObject({ lexical: { rank: 1 }, vector: null });
  });

  it('uses the index default candidates unless the query overrides them', async () => {
    const { balanced, lexicalFirst } = await seedCandidates();

    const defaulted = await hybridSearch({ index: 'narrow', limit: 1 });
    const overridden = await hybridSearch({ index: 'narrow', limit: 1, candidates: 100 });
    const floored = await hybridSearch({ index: 'narrow', limit: 4 });

    expect(defaulted.hits.map(({ doc }) => doc.id)).toEqual([lexicalFirst.id]);
    expect(overridden.hits.map(({ doc }) => doc.id)).toEqual([balanced.id]);
    expect(floored.hits[0].doc.id).toBe(balanced.id);
  });

  it('ranks the vector component when the text has no searchable terms', async () => {
    const created = await create({ title: 'Anything', embedding: [1, 0, 0] });

    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: '!!!', vector: [1, 0, 0] },
      overrideAccess: true,
    });

    expect(result.hits.map(({ doc }) => doc.id)).toEqual([created.id]);
    expect(result.hits[0].components).toEqual({
      lexical: null,
      vector: { rank: 1, score: expect.closeTo(1, 5) },
    });
  });
});
