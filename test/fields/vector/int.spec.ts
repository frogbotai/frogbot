import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../../__helpers/shared/bootFrogbot.js';
import { bootFrogbot } from '../../__helpers/shared/bootFrogbot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const collection = 'vector-documents';

describe('vector field CRUD', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => {
    booted = await bootFrogbot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('creates, reads, replaces and deletes supplied vectors alongside ordinary fields', async () => {
    const created = await booted.frogbot.create({
      collection,
      data: { title: 'First', embedding: [0.5, -1, 0] },
      overrideAccess: true,
    });

    const read = await booted.frogbot.findByID({
      collection,
      id: created.id,
      overrideAccess: true,
    });

    expect(read.embedding).toEqual([0.5, -1, 0]);
    expect(read.title).toBe('First');

    const updated = await booted.frogbot.update({
      collection,
      id: created.id,
      data: { title: 'Second', embedding: [1, 2, 3] },
      overrideAccess: true,
    });

    expect(updated.embedding).toEqual([1, 2, 3]);
    expect(updated.title).toBe('Second');

    await booted.frogbot.delete({ collection, id: created.id, overrideAccess: true });

    const remaining = await booted.frogbot.count({ collection, overrideAccess: true });

    expect(remaining.totalDocs).toBe(0);
  });

  it('round-trips missing and null optional vectors', async () => {
    const created = await booted.frogbot.create({
      collection,
      data: { title: 'Optional', embedding: [1, 2, 3] },
      overrideAccess: true,
    });

    const cleared = await booted.frogbot.update({
      collection,
      id: created.id,
      data: { optionalEmbedding: null },
      overrideAccess: true,
    });

    const read = await booted.frogbot.findByID({
      collection,
      id: created.id,
      overrideAccess: true,
    });

    expect(created.optionalEmbedding).toBeNull();
    expect(cleared.optionalEmbedding).toBeNull();
    expect(read.optionalEmbedding).toBeNull();
  });

  it('persists vectors in group, tab, row, collapsible, array and block fields', async () => {
    const created = await booted.frogbot.create({
      collection,
      data: {
        title: 'Nested',
        embedding: [1, 2, 3],
        group: { embedding: [2, 3, 4] },
        details: { embedding: [5, 6, 7] },
        extraEmbedding: [6, 7, 8],
        items: [{ embedding: [3, 4, 5] }],
        content: [{ blockType: 'note', embedding: [4, 5, 6] }],
      },
      overrideAccess: true,
    });

    const read = await booted.frogbot.findByID({
      collection,
      id: created.id,
      overrideAccess: true,
    });

    expect(read.group?.embedding).toEqual([2, 3, 4]);
    expect(read.details?.embedding).toEqual([5, 6, 7]);
    expect(read.extraEmbedding).toEqual([6, 7, 8]);
    expect(read.items?.[0]?.embedding).toEqual([3, 4, 5]);
    expect(read.content?.[0]?.embedding).toEqual([4, 5, 6]);
  });

  it.each([
    { embedding: [1, 2] },
    { embedding: [1, '2', 3] },
    { embedding: 'not a vector' },
    { embedding: [] },
    { embedding: null },
  ])('rejects a malformed vector write: $embedding', async ({ embedding }) => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Invalid', embedding },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/embedding/i);

    const remaining = await booted.frogbot.count({ collection, overrideAccess: true });

    expect(remaining.totalDocs).toBe(0);
  });

  it('rejects invalid vectors produced by beforeValidate and beforeChange hooks', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'First', embedding: [1, 2, 3], mutated: [9, 9, 9] },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/mutated/i);

    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Second', embedding: [1, 2, 3], mutated: [7, 7, 7] },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/mutated/i);
  });

  it('rejects a malformed nested vector', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Nested', embedding: [1, 2, 3], items: [{ embedding: [1, 2] }] },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/embedding/i);
  });

  it('rejects an invalid replacement without changing the stored vector', async () => {
    const created = await booted.frogbot.create({
      collection,
      data: { title: 'Original', embedding: [1, 2, 3] },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.update({
        collection,
        id: created.id,
        data: { title: 'Rejected', embedding: [1, 2] },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/embedding/i);

    const read = await booted.frogbot.findByID({
      collection,
      id: created.id,
      overrideAccess: true,
    });

    expect(read.embedding).toEqual([1, 2, 3]);
    expect(read.title).toBe('Original');
  });

  it('rejects malformed vectors when draft validation is disabled', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Invalid draft', embedding: [1, 2] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/embedding/i);

    const remaining = await booted.frogbot.count({ collection, overrideAccess: true });

    expect(remaining.totalDocs).toBe(0);
  });

  it('rejects draft vectors changed by a field beforeValidate hook', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Field beforeValidate mutation', embedding: [1, 2, 3], mutated: [9, 9, 9] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow(/mutated/i);
  });

  it('rejects draft vectors changed by a field beforeChange hook', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Field mutation', embedding: [1, 2, 3], mutated: [7, 7, 7] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow('mutated');
  });

  it('rejects draft vectors mutated through sibling data by a field hook', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Sibling mutation', embedding: [1, 2, 3], mutated: [8, 8, 8] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow('mutated');
  });

  it('rejects draft vectors changed by a collection beforeChange hook', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'collection-mutated', embedding: [1, 2, 3] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow('embedding');
  });

  it('rejects draft vectors changed by a collection beforeValidate hook', async () => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'collection-before-validate', embedding: [1, 2, 3] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow('embedding');
  });

  it.each([
    { name: 'group', data: { group: { embedding: [1, 2] } }, path: 'group.embedding' },
    { name: 'tab and row', data: { details: { embedding: [1, 2] } }, path: 'details.embedding' },
    { name: 'collapsible', data: { extraEmbedding: [1, 2] }, path: 'extraEmbedding' },
    { name: 'array', data: { items: [{ embedding: [1, 2] }] }, path: 'items.0.embedding' },
    {
      name: 'block',
      data: { content: [{ blockType: 'note', embedding: [1, 2] }] },
      path: 'content.0.embedding',
    },
  ])('rejects malformed draft vectors under $name', async ({ data, path }) => {
    await expect(
      booted.frogbot.create({
        collection,
        data: { title: 'Nested draft', embedding: [1, 2, 3], ...data },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toMatchObject({ data: { errors: [{ path }] } });
  });

  it('allows incomplete drafts and optional null vectors without relaxing published validation', async () => {
    const draft = await booted.frogbot.create({
      collection,
      data: { title: 'Incomplete', optionalEmbedding: null },
      draft: true,
      overrideAccess: true,
    });

    const readDraft = await booted.frogbot.findByID({
      collection,
      id: draft.id,
      draft: true,
      overrideAccess: true,
    });

    expect(readDraft.embedding).toBeNull();
    expect(readDraft.optionalEmbedding).toBeNull();

    await expect(
      booted.frogbot.update({
        collection,
        id: draft.id,
        data: { _status: 'published' },
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow('Embedding');

    const published = await booted.frogbot.update({
      collection,
      id: draft.id,
      data: { _status: 'published', embedding: [1, 2, 3] },
      draft: false,
      overrideAccess: true,
    });

    expect(published.embedding).toEqual([1, 2, 3]);
    expect(published.optionalEmbedding).toBeNull();
  });

  it('validates replacements on draft updates after all hooks run', async () => {
    const draft = await booted.frogbot.create({
      collection,
      data: { title: 'Original draft', embedding: [1, 2, 3] },
      draft: true,
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.update({
        collection,
        id: draft.id,
        data: { embedding: [1, 2] },
        draft: true,
        overrideAccess: true,
      }),
    ).rejects.toThrow('embedding');

    const read = await booted.frogbot.findByID({
      collection,
      id: draft.id,
      draft: true,
      overrideAccess: true,
    });

    expect(read.embedding).toEqual([1, 2, 3]);
  });

  it('rejects invalid publish updates and accepts valid replacements', async () => {
    const draft = await booted.frogbot.create({
      collection,
      data: { title: 'Before publish', embedding: [1, 2, 3] },
      draft: true,
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.update({
        collection,
        id: draft.id,
        data: { _status: 'published', title: 'collection-mutated' },
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow('embedding');

    const published = await booted.frogbot.update({
      collection,
      id: draft.id,
      data: { _status: 'published', embedding: [3, 2, 1] },
      draft: false,
      overrideAccess: true,
    });

    expect(published.embedding).toEqual([3, 2, 1]);
  });

  it('returns HTTP 400 for malformed draft vectors submitted via REST', async () => {
    const rejected = await booted.restClient.post(`/api/${collection}?draft=true`, {
      title: 'Invalid REST draft',
      embedding: [1, null, 3],
    });

    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      errors: [{ data: { errors: [{ path: 'embedding' }] } }],
    });
  });

  it('retains collection beforeChange transformations on valid draft vectors', async () => {
    const draft = await booted.frogbot.create({
      collection,
      data: { title: 'collection-valid', embedding: [0, 0, 0] },
      draft: true,
      overrideAccess: true,
    });

    const read = await booted.frogbot.findByID({
      collection,
      id: draft.id,
      draft: true,
      overrideAccess: true,
    });

    expect(read.embedding).toEqual([1, 2, 3]);
  });

  it('round-trips supplied vectors through REST and rejects invalid JSON bodies', async () => {
    const created = await booted.restClient.post<{ doc: { id: number } }>(`/api/${collection}`, {
      title: 'REST',
      embedding: [1, 2, 3],
    });

    expect(created.status).toBe(201);

    const read = await booted.restClient.get<{ embedding: number[] }>(
      `/api/${collection}/${created.body.doc.id}`,
    );

    expect(read.status).toBe(200);
    expect(read.body.embedding).toEqual([1, 2, 3]);

    const rejected = await booted.restClient.post(`/api/${collection}`, {
      title: 'Invalid REST',
      embedding: [1, null, 3],
    });

    expect(rejected.status).toBe(400);
  });
});
