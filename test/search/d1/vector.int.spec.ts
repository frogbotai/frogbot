import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  type BootedSearch,
  createSearchDatabase,
  describeD1,
  type SearchDatabase,
} from './fixture.js';
import { articlesSlug, embeddingsSlug, pagesSlug } from './shared.js';

const createVector = (dimensions: number, offset = 0) =>
  Array.from({ length: dimensions }, (_, index) => Math.sin(index + offset) / 3);

describeD1('D1 vector storage', () => {
  let database: SearchDatabase;
  let booted: BootedSearch;

  const findArticle = (id: number, options: Record<string, unknown> = {}) =>
    booted.frogbot.findByID({
      collection: articlesSlug,
      id,
      overrideAccess: true,
      ...options,
    } as never) as Promise<Record<string, unknown>>;

  beforeAll(async () => {
    database = await createSearchDatabase();
    booted = await database.boot();
  });

  afterAll(async () => {
    await database.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('round-trips top-level and group vectors through create, update and delete', async () => {
    const embedding = createVector(1536);
    const replacement = createVector(1536, 7);

    const created = (await booted.frogbot.create({
      collection: articlesSlug,
      data: {
        _status: 'published',
        title: 'Stored vector',
        embedding,
        details: { embedding: [0.5, -0.25, 1e-7] },
      },
      overrideAccess: true,
    } as never)) as { id: number };

    expect(await findArticle(created.id)).toMatchObject({
      embedding,
      details: { embedding: [0.5, -0.25, 1e-7] },
    });

    await booted.frogbot.update({
      collection: articlesSlug,
      id: created.id,
      data: { embedding: replacement, details: { embedding: null } },
      overrideAccess: true,
    } as never);

    expect(await findArticle(created.id)).toMatchObject({
      embedding: replacement,
      details: { embedding: null },
    });

    await booted.frogbot.delete({ collection: articlesSlug, id: created.id, overrideAccess: true });

    await expect(findArticle(created.id)).rejects.toMatchObject({ status: 404 });
  });

  it('stores 3072-dimension vectors within the D1 bound-parameter limit', async () => {
    const embeddings = [createVector(3072), createVector(3072, 1), createVector(3072, 2)];

    const created = await Promise.all(
      embeddings.map((embedding, index) =>
        booted.frogbot.create({
          collection: embeddingsSlug,
          data: { label: `Vector ${index}`, embedding },
          overrideAccess: true,
        } as never),
      ),
    );

    const { docs } = await booted.frogbot.find({
      collection: embeddingsSlug,
      overrideAccess: true,
      sort: 'label',
    } as never);

    expect(created).toHaveLength(3);
    expect(docs.map(({ embedding }) => embedding)).toEqual(embeddings);
  });

  it('keeps localized vectors per locale', async () => {
    const page = (await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Localized', embedding: [1, 0] },
      locale: 'en',
      overrideAccess: true,
    } as never)) as { id: number };

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { embedding: [0, 1] },
      locale: 'es',
      overrideAccess: true,
    } as never);

    const read = (locale: string) =>
      booted.frogbot.findByID({
        collection: pagesSlug,
        id: page.id,
        locale,
        overrideAccess: true,
      } as never);

    expect(await read('en')).toMatchObject({ embedding: [1, 0] });
    expect(await read('es')).toMatchObject({ embedding: [0, 1] });
  });

  it('stores draft vectors on the version without changing the published record', async () => {
    const published = createVector(1536);
    const draft = createVector(1536, 3);

    const created = (await booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', title: 'Versioned', embedding: published },
      overrideAccess: true,
    } as never)) as { id: number };

    await booted.frogbot.update({
      collection: articlesSlug,
      id: created.id,
      data: { embedding: draft },
      draft: true,
      overrideAccess: true,
    } as never);

    expect(await findArticle(created.id)).toMatchObject({ embedding: published });
    expect(await findArticle(created.id, { draft: true })).toMatchObject({ embedding: draft });
  });

  it('rejects vectors with the wrong dimensions or non-finite values', async () => {
    const create = (embedding: unknown) =>
      booted.frogbot.create({
        collection: embeddingsSlug,
        data: { label: 'Invalid', embedding },
        overrideAccess: true,
      } as never);

    await expect(create(createVector(3071))).rejects.toMatchObject({ status: 400 });
    await expect(create([...createVector(3071), Number.NaN])).rejects.toMatchObject({
      status: 400,
    });
    await expect(create(null)).rejects.toMatchObject({ status: 400 });
  });
});
