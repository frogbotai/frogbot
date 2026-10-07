import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../../../../packages/frogbot/src/collections/config/types.js';
import { resolveFilesCollection } from '../../../../packages/frogbot/src/uploads/resolveCollections.js';

describe('resolveFilesCollection', () => {
  it('returns collections unchanged and no files config when nothing is marked', () => {
    const collections: CollectionConfig[] = [{ slug: 'posts', fields: [] }];
    const result = resolveFilesCollection({ collections });

    expect(result.files).toBeUndefined();
    expect(result.collections).toEqual(collections);
  });

  it('adopts a marked collection and preserves overrides', () => {
    const access = { read: () => true as const };
    const collections: CollectionConfig[] = [
      {
        slug: 'documents',
        file: true,
        upload: { mimeTypes: ['application/pdf'] },
        folders: false,
        access,
        fields: [{ name: 'category', type: 'text' }],
      },
    ];

    const result = resolveFilesCollection({ collections });

    expect(result.files).toEqual({ slug: 'documents' });
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]).toMatchObject({
      slug: 'documents',
      upload: { mimeTypes: ['application/pdf'] },
      folders: false,
      access,
    });
    expect(result.collections[0]?.fields).toEqual([{ name: 'category', type: 'text' }]);
  });

  it('rejects duplicate markers', () => {
    expect(() =>
      resolveFilesCollection({
        collections: [
          { slug: 'one', file: true, fields: [] },
          { slug: 'two', file: true, fields: [] },
        ],
      }),
    ).toThrow('Multiple collections marked `file: true`');
  });

  it('accepts an ordinary collection named files without file: true', () => {
    const result = resolveFilesCollection({
      collections: [{ slug: 'files', upload: true, fields: [] }],
    });

    expect(result.files).toBeUndefined();
    expect(result.collections[0]).toEqual({ slug: 'files', upload: true, fields: [] });
    expect(result.collections[0]?.folders).toBeUndefined();
    expect(result.collections[0]?.access).toBeUndefined();
  });

  it('rejects disabled uploads and multiple roles', () => {
    expect(() =>
      resolveFilesCollection({
        collections: [{ slug: 'documents', file: true, upload: false, fields: [] }],
      }),
    ).toThrow('cannot set `upload: false`');
    expect(() =>
      resolveFilesCollection({
        collections: [{ slug: 'documents', file: true, chat: true, fields: [] }],
      }),
    ).toThrow('marked as multiple roles');
  });

  it('rejects usage-log and file roles on one collection', () => {
    expect(() =>
      resolveFilesCollection({
        collections: [{ slug: 'documents', file: true, usageLog: true, fields: [] }],
      }),
    ).toThrow('marked as multiple roles');
  });
});
