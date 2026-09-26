import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from '@frogbotai/db-sqlite';
import type { FrogBotInstance } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, buildSearchConfig, notesSlug, pagesSlug } from './shared.js';

const indexedPath = fileURLToPath(new URL('./search-vector-index.db', import.meta.url));

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const norm = (vector: number[]) => Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));

  return dot / (norm(a) * norm(b));
}

function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;

    return state / 4294967296 - 0.5;
  };
}

describe('SQLite approximate vector search', () => {
  let frogbot: FrogBotInstance;
  let db: SQLiteAdapter;

  beforeAll(async () => {
    frogbot = await new FrogBot().init({
      config: await buildSearchConfig({ url: `file:${indexedPath}` }),
    });

    db = (frogbot as unknown as { payload: { db: SQLiteAdapter } }).payload.db;
  });

  afterAll(async () => {
    await frogbot.destroy();
    await rm(indexedPath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(frogbot, 'empty');
  });

  it('creates LibSQL vector indexes and queries them with vector_top_k', async () => {
    const indexes = await db.drizzle.all<{ name: string; sql: string }>(
      sql`SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'index' AND "name" GLOB 'frogbot_search_*'`,
    );

    expect(indexes.map(({ name }) => name)).toContain(
      'frogbot_search_search_articles_content_vectors_idx',
    );
    expect(
      indexes.find(({ name }) => name.endsWith('articles_distance_vectors_idx'))?.sql,
    ).toContain(`'metric=l2'`);

    const next = random(7);
    const vectors = Array.from({ length: 40 }, () => [next(), next(), next()]);
    const docs = [];

    for (const [index, embedding] of vectors.entries()) {
      docs.push(
        (await frogbot.create({
          collection: articlesSlug,
          data: {
            _status: 'published',
            embedding,
            tenant: index < 2 ? 'rare' : 'common',
            title: `v${index}`,
          },
          overrideAccess: true,
        } as never)) as { id: number },
      );
    }

    const query = [0.4, 0.1, -0.2];
    const exact = docs
      .map(({ id }, index) => ({ id, score: cosineSimilarity(vectors[index], query) }))
      .sort((a, b) => b.score - a.score);

    const result = await frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { vector: query },
      limit: 10,
      overrideAccess: true,
    });

    expect(result.ranking).toEqual({
      method: 'libsql-diskann',
      higherIsBetter: true,
      approximate: true,
    });

    const expected = new Set(exact.slice(0, 10).map(({ id }) => id));
    const recall = result.hits.filter(({ doc }) => expected.has(doc.id as number)).length / 10;

    expect(recall).toBeGreaterThanOrEqual(0.8);

    const scores = result.hits.map(({ score }) => score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const rare = exact.filter(({ id }) => docs.findIndex((doc) => doc.id === id) < 2);

    const filtered = (candidates?: number) =>
      frogbot.search({
        collection: articlesSlug,
        index: 'content',
        query: { vector: query },
        where: { tenant: { equals: 'rare' } },
        limit: 2,
        overrideAccess: true,
        ...(candidates ? { candidates } : {}),
      });

    const defaulted = await filtered();
    const narrow = await filtered(2);

    expect(defaulted.hits.map(({ doc }) => doc.id)).toEqual(rare.map(({ id }) => id));
    expect(narrow.hits.length).toBeLessThan(rare.length);
    expect(narrow.hits.every(({ doc }) => (doc as { tenant?: string }).tenant === 'rare')).toBe(
      true,
    );

    const hybrid = await frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'v1', vector: query },
      overrideAccess: true,
    });

    expect(hybrid.ranking).toEqual({
      method: 'rrf',
      higherIsBetter: true,
      approximate: true,
      components: {
        lexical: { method: 'sqlite-fts5', higherIsBetter: true, approximate: false },
        vector: { method: 'libsql-diskann', higherIsBetter: true, approximate: true },
      },
    });
    expect(hybrid.hits[0].doc.id).toBe(docs[1].id);

    await frogbot.delete({
      collection: articlesSlug,
      id: result.hits[0].doc.id,
      overrideAccess: true,
    });

    const afterDelete = await frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { vector: query },
      limit: 10,
      overrideAccess: true,
    });

    expect(afterDelete.hits.map(({ doc }) => doc.id)).not.toContain(result.hits[0].doc.id);
  });

  it('keys indexed vectors by locale rows and text IDs', async () => {
    const page = (await frogbot.create({
      collection: pagesSlug,
      data: { title: 'english', embedding: [1, 0] },
      locale: 'en',
      overrideAccess: true,
    } as never)) as { id: number };

    await frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { embedding: [0, 1] },
      locale: 'es',
      overrideAccess: true,
    } as never);

    const spanish = await frogbot.search({
      collection: pagesSlug,
      index: 'content',
      query: { vector: [0, 1] },
      locale: 'es',
      overrideAccess: true,
    } as never);

    expect(spanish.hits.map(({ doc }) => doc.id)).toEqual([page.id]);
    expect(spanish.hits[0].score).toBeCloseTo(1, 5);

    await frogbot.create({
      collection: notesSlug,
      data: { id: 'note-a', title: 'a', embedding: [1, 0] },
      overrideAccess: true,
    } as never);

    await frogbot.create({
      collection: notesSlug,
      data: { id: 'note-b', title: 'b', embedding: [0, 1] },
      overrideAccess: true,
    } as never);

    const notes = await frogbot.search({
      collection: notesSlug,
      index: 'content',
      query: { vector: [0.1, 1] },
      overrideAccess: true,
    });

    expect(notes.hits.map(({ doc }) => doc.id)).toEqual(['note-b', 'note-a']);
  });
});
