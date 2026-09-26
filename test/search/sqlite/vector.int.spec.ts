import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from '@frogbotai/db-sqlite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, databasePath, pagesSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = (vector: number[]) => Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));

  return dot / (norm(a) * norm(b));
}

describe('SQLite vector search', () => {
  let booted: BootedFrogBot;

  const create = (data: Record<string, unknown>) =>
    booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', ...data },
      overrideAccess: true,
    } as never) as Promise<{ id: number }>;

  const search = (vector: number[], options: Record<string, unknown> = {}) =>
    booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { vector },
      overrideAccess: true,
      ...options,
    } as never);

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-vector');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('orders records by exact cosine similarity', async () => {
    const vectors = [
      [1, 0, 0],
      [0.9, 0.3, 0],
      [0, 1, 0],
      [-1, 0, 0],
      [0.5, 0.5, 0.5],
    ];

    const docs = [];

    for (const [index, embedding] of vectors.entries()) {
      docs.push(await create({ title: `v${index}`, embedding }));
    }
    const query = [0.8, 0.2, 0.1];

    const expected = docs
      .map(({ id }, index) => ({ id, score: cosineSimilarity(vectors[index], query) }))
      .sort((a, b) => b.score - a.score);

    const result = await search(query);

    expect(result.mode).toBe('vector');
    expect(result.ranking).toEqual({
      method: 'libsql-exact',
      higherIsBetter: true,
      approximate: false,
    });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual(expected.map(({ id }) => id));

    for (const [index, hit] of result.hits.entries()) {
      expect(hit.score).toBeCloseTo(expected[index].score, 5);
    }

    const limited = await search(query, { limit: 2 });

    expect(limited.hits.map(({ doc }) => doc.id)).toEqual(expected.slice(0, 2).map(({ id }) => id));
  });

  it('builds no vector index when the index opts out of approximation', async () => {
    const { drizzle } = booted.payload.db as unknown as SQLiteAdapter;

    const objects = await drizzle.all<{ name: string }>(
      sql`SELECT "name" FROM sqlite_master WHERE "name" GLOB 'frogbot_search_*_vectors*'`,
    );

    expect(objects).toEqual([]);
  });

  it('orders records by euclidean distance and breaks ties by ID', async () => {
    const first = await create({ title: 'a', embedding: [1, 0, 0] });
    const second = await create({ title: 'b', embedding: [-1, 0, 0] });
    const far = await create({ title: 'c', embedding: [5, 5, 5] });

    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'distance',
      query: { vector: [0, 0, 0] },
      overrideAccess: true,
    });

    expect(result.ranking).toEqual({
      method: 'libsql-exact',
      higherIsBetter: false,
      approximate: false,
    });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual([first.id, second.id, far.id]);
    expect(result.hits[0].score).toBeCloseTo(1, 5);
  });

  it('skips records without a usable vector', async () => {
    const valid = await create({ title: 'valid', embedding: [1, 0, 0] });

    await create({ title: 'missing' });
    await create({ title: 'zero', embedding: [0, 0, 0] });

    const result = await search([1, 0, 0]);

    expect(result.hits.map(({ doc }) => doc.id)).toEqual([valid.id]);
  });

  it('rejects malformed and mismatched query vectors', async () => {
    await expect(search([1, Number.NaN, 0])).rejects.toMatchObject({
      name: 'SearchValidationError',
    });
    await expect(search([1, 0])).rejects.toMatchObject({ name: 'SearchValidationError' });
  });

  it('applies where, draft and trash visibility before ranking', async () => {
    const near = await create({ title: 'near', embedding: [1, 0, 0], rating: 1 });
    const far = await create({ title: 'far', embedding: [0, 1, 0], rating: 5 });

    const filtered = await search([1, 0, 0], { where: { rating: { greater_than: 3 } } });

    expect(filtered.hits.map(({ doc }) => doc.id)).toEqual([far.id]);

    await booted.frogbot.update({
      collection: articlesSlug,
      id: far.id,
      data: { embedding: [1, 0.01, 0] },
      draft: true,
      overrideAccess: true,
    } as never);

    const published = await search([0, 1, 0]);
    const drafts = await search([0, 1, 0], { draft: true });
    const score = (result: typeof published, id: number) =>
      result.hits.find(({ doc }) => doc.id === id)?.score;

    expect(published.hits.map(({ doc }) => doc.id)).toEqual([far.id, near.id]);
    expect(score(published, far.id)).toBeCloseTo(1, 5);
    expect(score(drafts, far.id)).toBeLessThan(0.1);

    await booted.frogbot.update({
      collection: articlesSlug,
      id: near.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    } as never);

    expect((await search([1, 0, 0])).hits.map(({ doc }) => doc.id)).toEqual([far.id]);
  });

  it('ranks group and localized vector fields', async () => {
    const grouped = await create({ title: 'grouped', details: { embedding: [1, 0] } });

    await create({ title: 'other', details: { embedding: [0, 1] } });

    const details = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'details',
      query: { vector: [1, 0.1] },
      overrideAccess: true,
    });

    expect(details.hits[0].doc.id).toBe(grouped.id);

    const page = (await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'english', embedding: [1, 0] },
      locale: 'en',
      overrideAccess: true,
    } as never)) as { id: number };

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { title: 'spanish', embedding: [0, 1] },
      locale: 'es',
      overrideAccess: true,
    } as never);

    const english = await booted.frogbot.search({
      collection: pagesSlug,
      index: 'content',
      query: { vector: [1, 0] },
      locale: 'en',
      overrideAccess: true,
    } as never);

    const spanish = await booted.frogbot.search({
      collection: pagesSlug,
      index: 'content',
      query: { vector: [1, 0] },
      locale: 'es',
      overrideAccess: true,
    } as never);

    expect(english.hits[0].score).toBeCloseTo(1, 5);
    expect(spanish.hits[0].score).toBeCloseTo(0, 5);
  });
});
