import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MongooseAdapter } from '@frogbotai/db-mongodb';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ensureSearchIndexes } from '../../../packages/db-mongodb/src/search/index.js';
import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { articlesSlug, postsSlug, skipSearch, useSearchDatabase, waitFor } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type ListedIndex = {
  latestDefinition: {
    fields?: { path: string; type: string }[];
    mappings?: { fields: Record<string, unknown> };
  } & Record<string, unknown>;
  name: string;
  queryable: boolean;
  type: string;
};

describe.skipIf(skipSearch)('MongoDB search indexes', () => {
  let booted: BootedFrogBot;
  let restoreDatabase: (() => void) | undefined;
  let db: MongooseAdapter;

  const list = async (model: MongooseAdapter['collections'][string], name: string) => {
    const [index] = await model.collection.listSearchIndexes(name).toArray();

    return index as unknown as ListedIndex;
  };

  const getPaths = (index: ListedIndex, type: string) =>
    index.latestDefinition.fields!.filter((field) => field.type === type).map(({ path }) => path);

  beforeAll(async () => {
    restoreDatabase = useSearchDatabase();
    booted = await bootFrogBot(dirname, 'search-indexes');
    db = booted.payload.db as MongooseAdapter;

    await waitFor(
      () =>
        Promise.all(
          [db.collections[articlesSlug], db.collections[postsSlug], db.versions[postsSlug]].map(
            (model) => model.collection.listSearchIndexes().toArray(),
          ),
        ),
      (lists) => lists.flat().every((index) => index.queryable),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await booted?.shutdown();

    restoreDatabase?.();
  });

  it('maps the vector path and every eligible filter', async () => {
    const index = await list(db.collections[articlesSlug], 'content_vector');

    expect(index.type).toBe('vectorSearch');

    expect(index.latestDefinition.fields).toContainEqual({
      type: 'vector',
      path: 'embedding',
      numDimensions: 3,
      similarity: 'cosine',
    });

    expect(getPaths(index, 'filter')).toEqual([
      '_id',
      'author',
      'body',
      'createdAt',
      'deletedAt',
      'featured',
      'meta.summary',
      'publishedAt',
      'rank',
      'title',
      'updatedAt',
      'visibility',
    ]);
  });

  it('narrows filters and maps nested paths', async () => {
    const vector = await list(db.collections[articlesSlug], 'nested_vector');
    const lexical = await list(db.collections[articlesSlug], 'nested_lexical');

    expect(getPaths(vector, 'vector')).toEqual(['meta.embedding']);
    expect(getPaths(vector, 'filter')).toEqual(['_id', 'deletedAt', 'rank', 'visibility']);

    expect(lexical.latestDefinition.mappings!.fields.meta).toMatchObject({
      type: 'document',
      dynamic: false,
      fields: { summary: { type: 'string', analyzer: 'lucene.standard' } },
    });

    expect(Object.keys(lexical.latestDefinition.mappings!.fields).sort()).toEqual([
      '_id',
      'deletedAt',
      'meta',
      'rank',
      'visibility',
    ]);
  });

  it('maps text that is also filterable as both text and token', async () => {
    const lexical = await list(db.collections[articlesSlug], 'content_lexical');

    expect(lexical.latestDefinition.mappings!.fields.title).toEqual([
      expect.objectContaining({ type: 'string', analyzer: 'lucene.english' }),
      { type: 'token' },
    ]);

    expect(lexical.latestDefinition.mappings!.fields.author).toEqual({ type: 'objectId' });
    expect(lexical.latestDefinition.mappings!.fields.tags).toBeUndefined();
  });

  it('maps localized paths for every locale and the draft versions collection', async () => {
    const posts = await list(db.collections[postsSlug], 'content_vector');
    const versions = await list(db.versions[postsSlug], 'content_vector');

    expect(getPaths(posts, 'vector')).toEqual(['embedding.en', 'embedding.fr']);
    expect(getPaths(versions, 'vector')).toEqual(['version.embedding.en', 'version.embedding.fr']);
    expect(getPaths(versions, 'filter')).toEqual(expect.arrayContaining(['latest', 'parent']));
    expect(getPaths(versions, 'filter')).toContain('version.title.fr');
  });

  it('does not touch current definitions', async () => {
    const models = [
      db.collections[articlesSlug],
      db.collections[postsSlug],
      db.versions[postsSlug],
    ];
    const creates = models.map((model) => vi.spyOn(model, 'createSearchIndex'));
    const updates = models.map((model) => vi.spyOn(model, 'updateSearchIndex'));

    await ensureSearchIndexes({ adapter: db });

    for (const spy of [...creates, ...updates]) expect(spy).not.toHaveBeenCalled();
  });

  it('updates a drifted definition in place', async () => {
    const model = db.collections[articlesSlug];

    await model.collection.updateSearchIndex('content_lexical', {
      mappings: { dynamic: false, fields: { title: { type: 'token' } } },
    });

    await waitFor(
      () => list(model, 'content_lexical'),
      (index) => Object.keys(index.latestDefinition.mappings!.fields).length === 1,
    );

    const update = vi.spyOn(model, 'updateSearchIndex');
    const create = vi.spyOn(model, 'createSearchIndex');

    await ensureSearchIndexes({ adapter: db });

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toBe('content_lexical');

    const repaired = await list(model, 'content_lexical');

    expect(Object.keys(repaired.latestDefinition.mappings!.fields)).toContain('body');
  });
});
