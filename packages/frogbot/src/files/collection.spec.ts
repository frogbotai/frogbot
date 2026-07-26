import { describe, expect, it } from 'vitest';

import { defaultFilesCollection } from './collection.js';

const collection = defaultFilesCollection({ slug: 'files' });

describe('defaultFilesCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug without defining fields', () => {
    expect(defaultFilesCollection({ slug: 'documents' }).slug).toBe('documents');
    expect(collection.fields).toEqual([]);
  });

  it('requires authentication for CRUD access', async () => {
    for (const operation of ['create', 'read', 'update', 'delete'] as const) {
      expect(await collection.access?.[operation]?.({ req: { user: { id: 'u1' } } as never })).toBe(true);
      expect(await collection.access?.[operation]?.({ req: { user: null } as never })).toBe(false);
    }
  });
});
