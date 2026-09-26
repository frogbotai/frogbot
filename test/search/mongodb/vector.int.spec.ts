import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Where } from 'payload';
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

describe.skipIf(skipSearch)('MongoDB vector search', () => {
  let booted: BootedFrogBot;
  let restoreDatabase: (() => void) | undefined;
  let ids: SeededArticles;
  let posts: { first: string; second: string; draft: string };

  const search = async ({
    candidates,
    collection = articlesSlug,
    draft,
    index = 'content',
    limit,
    locale,
    overrideAccess = false,
    text,
    vector,
    where,
  }: {
    candidates?: number;
    collection?: string;
    draft?: boolean;
    index?: string;
    limit?: number;
    locale?: string;
    overrideAccess?: boolean;
    text?: string;
    vector?: number[];
    where?: Where;
  }) => {
    const result = await booted.frogbot.search({
      collection,
      index,
      query: { ...(text ? { text } : {}), ...(vector ? { vector } : {}) },
      candidates,
      draft,
      limit,
      locale,
      where,
      overrideAccess,
      ...(overrideAccess ? {} : { req: await booted.frogbot.createRequest() }),
    });

    return { ...result, ids: result.hits.map(({ doc }) => String(doc.id)) };
  };

  beforeAll(async () => {
    restoreDatabase = useSearchDatabase();
    booted = await bootFrogBot(dirname, 'search-vector');
    ids = await seedArticles(booted.frogbot);

    const first = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'hello world', embedding: [1, 0, 0], _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: postsSlug,
      id: first.id,
      data: { title: 'bonjour monde', embedding: [0, 1, 0], _status: 'published' },
      locale: 'fr',
      overrideAccess: true,
    });

    const second = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'goodbye world', embedding: [0, 1, 0], _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: postsSlug,
      id: second.id,
      data: { title: 'au revoir', embedding: [1, 0, 0], _status: 'published' },
      locale: 'fr',
      overrideAccess: true,
    });

    const draft = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'draft world', embedding: [0, 0, 1], _status: 'draft' },
      draft: true,
      locale: 'en',
      overrideAccess: true,
    });

    posts = { first: String(first.id), second: String(second.id), draft: String(draft.id) };

    await waitFor(
      () => search({ vector: [1, 0, 0], overrideAccess: true }),
      (result) => result.ids.length === 4,
    );

    await waitFor(
      () => search({ collection: postsSlug, vector: [0, 0, 1], draft: true, overrideAccess: true }),
      (result) => result.ids.length === 3,
    );

    await waitFor(
      () =>
        search({ collection: postsSlug, vector: [1, 0, 0], locale: 'fr', overrideAccess: true }),
      (result) => result.ids[0] === posts.second,
    );
  });

  afterAll(async () => {
    await booted?.shutdown();

    restoreDatabase?.();
  });

  it('ranks by the index metric', async () => {
    const result = await search({ vector: [1, 0, 0] });

    expect(result.mode).toBe('vector');

    expect(result.ranking).toEqual({
      method: 'mongodb-hnsw',
      higherIsBetter: true,
      approximate: true,
    });

    expect(result.ids).toEqual([ids.fox, ids.hounds, ids.cats]);

    expect(result.hits.map(({ score }) => score)).toEqual([
      expect.closeTo(1, 5),
      expect.closeTo(0.8 / Math.sqrt(0.68), 5),
      expect.closeTo(0, 5),
    ]);
  });

  it('searches exactly when the index is not approximate', async () => {
    const approximate = await search({ vector: [1, 0, 0] });
    const result = await search({ index: 'exact', vector: [1, 0, 0] });

    expect(result.ranking).toEqual({
      method: 'mongodb-exact',
      higherIsBetter: true,
      approximate: false,
    });

    expect(result.ids).toEqual(approximate.ids);
    expect(result.hits.map(({ score }) => score)).toEqual(
      approximate.hits.map(({ score }) => expect.closeTo(score, 5)),
    );
  });

  it('caps candidates at the engine limit', async () => {
    const result = await search({ vector: [1, 0, 0], limit: 2, candidates: 20000 });

    expect(result.ranking.approximate).toBe(true);
    expect(result.ids).toEqual([ids.fox, ids.hounds]);
  });

  it('switches to exact search beyond the candidate limit', async () => {
    const result = await search({ vector: [1, 0, 0], limit: 10001 });

    expect(result.ranking).toEqual({
      method: 'mongodb-exact',
      higherIsBetter: true,
      approximate: false,
    });

    expect(result.ids).toEqual([ids.fox, ids.hounds, ids.cats]);
  });

  it('applies collection access before the result limit', async () => {
    const result = await search({
      vector: [1, 0, 0],
      limit: 1,
      where: { rank: { greater_than: 1 } },
    });
    const overridden = await search({
      vector: [1, 0, 0],
      limit: 1,
      overrideAccess: true,
      where: { rank: { greater_than: 1 } },
    });

    expect(result.ids).toEqual([ids.hounds]);
    expect(overridden.ids).toEqual([ids.secret]);
  });

  it('filters inside the vector stage', async () => {
    const result = await search({
      vector: [1, 0, 0],
      where: {
        and: [
          { publishedAt: { less_than: '2025-01-01T00:00:00.000Z' } },
          { author: { equals: ids.author } },
        ],
      },
    });

    expect(result.ids).toEqual([ids.fox]);
  });

  it('ranks a nested vector with its own metric and filter mappings', async () => {
    const result = await search({ index: 'nested', vector: [0, 1, 0] });

    expect(result.ranking).toEqual({
      method: 'mongodb-hnsw',
      higherIsBetter: false,
      approximate: true,
    });

    expect(result.ids[0]).toBe(ids.hounds);
    expect(result.hits[0].score).toBeCloseTo(0, 5);
    expect(result.hits[1].score).toBeGreaterThan(result.hits[0].score);

    await expect(
      search({ index: 'nested', vector: [0, 1, 0], where: { featured: { equals: true } } }),
    ).rejects.toMatchObject({ name: 'SearchFilterUnsupportedError' });
  });

  it('ranks the requested locale', async () => {
    const en = await search({ collection: postsSlug, vector: [1, 0, 0], locale: 'en' });
    const fr = await search({ collection: postsSlug, vector: [1, 0, 0], locale: 'fr' });

    expect(en.ranking).toEqual({
      method: 'mongodb-hnsw',
      higherIsBetter: true,
      approximate: true,
    });

    expect(en.ids[0]).toBe(posts.first);
    expect(en.hits.map(({ score }) => score)).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5)]);
    expect(fr.ids[0]).toBe(posts.second);
    expect(fr.ids).not.toContain(posts.draft);
  });

  it('matches text in the requested locale', async () => {
    const fr = await search({ collection: postsSlug, text: 'bonjour', locale: 'fr' });
    const en = await search({ collection: postsSlug, text: 'bonjour', locale: 'en' });

    expect(fr.ids).toEqual([posts.first]);
    expect(en.ids).toEqual([]);
  });

  it('ranks drafts only in draft context', async () => {
    const published = await search({
      collection: postsSlug,
      vector: [0, 0, 1],
      overrideAccess: true,
    });
    const drafts = await search({
      collection: postsSlug,
      vector: [0, 0, 1],
      draft: true,
      overrideAccess: true,
    });

    expect(published.ids).not.toContain(posts.draft);
    expect(drafts.ids[0]).toBe(posts.draft);
  });

  it('ranks the latest draft version of a published document', async () => {
    await booted.frogbot.update({
      collection: postsSlug,
      id: posts.second,
      data: { embedding: [0, 0, -1] },
      draft: true,
      locale: 'en',
      overrideAccess: true,
    });

    const drafts = await waitFor(
      () =>
        search({ collection: postsSlug, vector: [0, 0, -1], draft: true, overrideAccess: true }),
      (result) => result.ids[0] === posts.second,
    );

    const published = await search({ collection: postsSlug, vector: [0, 1, 0] });

    expect(drafts.ids[0]).toBe(posts.second);
    expect(published.ids[0]).toBe(posts.second);
  });
});
