import { describe, expect, it } from 'vitest';

import {
  defaultFilesCollection,
  defaultFoldersCollection,
} from '../../../../packages/frogbot/src/uploads/collection.js';

const collection = defaultFilesCollection({ slug: 'files', folders: 'folders' });

describe('defaultFilesCollection', () => {
  it('produces the base config shape', () => {
    expect(collection).toMatchSnapshot();
  });

  it('binds the provided slug and files records into the folders collection', () => {
    expect(defaultFilesCollection({ slug: 'documents', folders: 'folders' }).slug).toBe(
      'documents',
    );
    expect(collection.fields).toEqual([
      expect.objectContaining({ name: '_h_folders', type: 'relationship', relationTo: 'folders' }),
    ]);
  });

  it("is Payload's folders collection", () => {
    expect(defaultFoldersCollection()).toMatchObject({
      slug: 'folders',
      folders: true,
      admin: { useAsTitle: 'name' },
      fields: [{ name: 'name', type: 'text', required: true }],
    });
  });

  it('requires authentication for CRUD access', async () => {
    for (const operation of ['create', 'read', 'update', 'delete'] as const) {
      expect(
        await collection.access?.[operation]?.({
          slug: 'test',
          req: { user: { id: 'u1' } } as never,
        }),
      ).toBe(true);
      expect(
        await collection.access?.[operation]?.({ slug: 'test', req: { user: null } as never }),
      ).toBe(false);
    }
  });
});
