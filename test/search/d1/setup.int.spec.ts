import type { CollectionConfig } from 'frogbot';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createSearchDatabase, describeD1, type SearchDatabase } from './fixture.js';

const setupSlug = 'search-setup';

function collection(search: CollectionConfig['search'], slug = setupSlug): CollectionConfig {
  return {
    slug,
    fields: [
      { name: 'title', type: 'text' },
      { name: 'embedding', type: 'vector', dimensions: 3 },
    ],
    search,
  };
}

describeD1('D1 search setup', () => {
  let database: SearchDatabase;

  const hasTable = async (name: string) => {
    const table = await database.binding
      .prepare(`SELECT "name" FROM sqlite_master WHERE "name" = ?`)
      .bind(name)
      .first();

    return table !== null;
  };

  const boot = (search: CollectionConfig['search'], disableDBConnect?: boolean) =>
    database.boot({ collections: [collection(search)], disableDBConnect });

  beforeAll(async () => {
    database = await createSearchDatabase();
  });

  afterAll(async () => {
    await database.shutdown();
  });

  it('rejects a vector index as an engine gap before creating any table', async () => {
    const rejected = database.boot({
      collections: [
        collection({ semantic: { vector: { field: 'embedding' } } }, 'search-rejected'),
      ],
    });

    await expect(rejected).rejects.toMatchObject({
      name: 'SearchCapabilityError',
      reason: 'engine-gap',
      status: 501,
      message: expect.stringMatching(
        /^\[frogbot\] Search index 'semantic' in collection 'search-rejected' \(vector\): engine-gap: Cloudflare D1 has no native vector search/,
      ),
    });

    expect(await hasTable('search_rejected')).toBe(false);
  });

  it('rejects an index that combines lexical and vector search', async () => {
    await expect(
      boot({ content: { lexical: { fields: ['title'] }, vector: { field: 'embedding' } } }),
    ).rejects.toMatchObject({
      name: 'SearchCapabilityError',
      reason: 'engine-gap',
      message: expect.stringContaining("'content' in collection 'search-setup' (vector)"),
    });
  });

  it('rejects a vector index without a database connection', async () => {
    await expect(
      boot({ semantic: { vector: { field: 'embedding' } } }, true),
    ).rejects.toMatchObject({ name: 'SearchCapabilityError', reason: 'engine-gap' });
  });

  it('rejects lexical languages without an FTS5 tokenizer', async () => {
    await expect(
      boot({ french: { lexical: { fields: ['title'], language: 'french' } } }),
    ).rejects.toThrow(/french.*search-setup.*lexical.*engine-gap.*tokenizer/);
  });

  it('builds a lexical index and stores vectors without a vector index', async () => {
    const { frogbot } = await boot({ titles: { lexical: { fields: ['title'] } } });

    const created = await frogbot.create({
      collection: setupSlug,
      data: { title: 'Storage only', embedding: [0.25, -0.5, 1] },
      overrideAccess: true,
    } as never);

    const found = await frogbot.findByID({
      collection: setupSlug,
      id: created.id,
      overrideAccess: true,
    } as never);

    const result = await frogbot.search({
      collection: setupSlug,
      index: 'titles',
      query: { text: 'storage' },
      overrideAccess: true,
    } as never);

    expect(found).toMatchObject({ embedding: [0.25, -0.5, 1] });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual([created.id]);
  });
});
