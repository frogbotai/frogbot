import type { CollectionConfig } from 'frogbot';
import { FrogBot } from 'frogbot/test';
import { describe, expect, it } from 'vitest';

import { buildSearchConfig } from './shared.js';

function collection(search: CollectionConfig['search']): CollectionConfig {
  return {
    slug: 'search-setup',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'embedding', type: 'vector', dimensions: 2 },
    ],
    search,
  };
}

const init = (search: CollectionConfig['search']) =>
  new FrogBot().init({
    config: buildSearchConfig({ collections: [collection(search)], url: 'file::memory:' }),
  });

describe('SQLite search setup', () => {
  it('rejects the dot product metric as an engine gap', async () => {
    await expect(
      init({ inner: { vector: { field: 'embedding', metric: 'dotProduct' } } }),
    ).rejects.toMatchObject({
      code: 'search.engine-gap',
      message: expect.stringMatching(/inner.*search-setup.*vector.*inner product/),
    });
  });

  it('rejects lexical languages without an FTS5 tokenizer', async () => {
    await expect(
      init({ french: { lexical: { fields: ['title'], language: 'french' } } }),
    ).rejects.toMatchObject({
      code: 'search.engine-gap',
      message: expect.stringMatching(/french.*search-setup.*lexical.*tokenizer/),
    });
  });

  it('rejects indexes whose database objects collide', async () => {
    await expect(
      init({
        'first-index': { lexical: { fields: ['title'] } },
        first_index: { lexical: { fields: ['title'] } },
      }),
    ).rejects.toThrow(/conflicts with another search index/);
  });
});
