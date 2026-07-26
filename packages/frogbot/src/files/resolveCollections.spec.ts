import { describe, expect, it } from 'vitest';

import type { CollectionConfig } from '../types/collection.js';
import { DEFAULT_FILES_SLUG, resolveFilesCollection } from './resolveCollections.js';

describe('resolveFilesCollection', () => {
  it('injects the default collection', () => {
    const result = resolveFilesCollection({ collections: [] });
    expect(result.files.slug).toBe(DEFAULT_FILES_SLUG);
    expect(result.collections.map((collection) => collection.slug)).toEqual(['files']);
  });

  it('adopts a marked collection and preserves overrides', () => {
    const access = { read: () => true as const };
    const collections: CollectionConfig[] = [{
      slug: 'documents',
      file: true,
      upload: { mimeTypes: ['application/pdf'] },
      folders: false,
      access,
      fields: [{ name: 'category', type: 'text' }],
    }];
    const result = resolveFilesCollection({ collections });
    expect(result.files.slug).toBe('documents');
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]).toMatchObject({
      slug: 'documents',
      upload: { mimeTypes: ['application/pdf'] },
      folders: false,
      access,
    });
    expect(result.collections[0]?.fields).toEqual([{ name: 'category', type: 'text' }]);
  });

  it('rejects collisions and duplicate markers', () => {
    expect(() => resolveFilesCollection({ collections: [{ slug: 'files', fields: [] }] })).toThrow(
      'Add `file: true`',
    );
    expect(() => resolveFilesCollection({ collections: [
      { slug: 'one', file: true, fields: [] },
      { slug: 'two', file: true, fields: [] },
    ] })).toThrow('Multiple collections marked `file: true`');
  });

  it('rejects disabled uploads and multiple roles', () => {
    expect(() => resolveFilesCollection({
      collections: [{ slug: 'documents', file: true, upload: false, fields: [] }],
    })).toThrow('cannot set `upload: false`');
    expect(() => resolveFilesCollection({
      collections: [{ slug: 'documents', file: true, thread: true, fields: [] }],
    })).toThrow('marked as multiple roles');
  });
});
