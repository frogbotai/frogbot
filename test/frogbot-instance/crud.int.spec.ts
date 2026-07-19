import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { postsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: CRUD expansion', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });

  describe('duplicate', () => {
    it('duplicates a document and returns a new ID with same data', async () => {
      const original = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Original', content: 'body', status: 'draft' },
        overrideAccess: true,
      });

      const dupe = await booted.frogbot.duplicate({
        collection: postsSlug,
        id: original.id,
        overrideAccess: true,
      });

      expect(dupe.id).not.toEqual(original.id);
      expect(dupe.title).toEqual(original.title);
      expect(dupe.content).toEqual(original.content);
      expect(dupe.status).toEqual(original.status);
    });

    it('returns the full doc shape with all fields', async () => {
      const original = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Full Shape', content: 'rich', status: 'published' },
        overrideAccess: true,
      });

      const dupe = await booted.frogbot.duplicate({
        collection: postsSlug,
        id: original.id,
        overrideAccess: true,
      });

      expect(dupe).toHaveProperty('id');
      expect(dupe).toHaveProperty('title');
      expect(dupe).toHaveProperty('content');
      expect(dupe).toHaveProperty('status');
      expect(dupe).toHaveProperty('createdAt');
      expect(dupe).toHaveProperty('updatedAt');
    });
  });

  describe('findDistinct', () => {
    it('returns distinct values for a field', async () => {
      await booted.frogbot.delete({ collection: postsSlug, where: {}, overrideAccess: true });

      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'A', status: 'draft' },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'B', status: 'published' },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'C', status: 'draft' },
        overrideAccess: true,
      });

      const result = await booted.frogbot.findDistinct({
        collection: postsSlug,
        field: 'status',
        overrideAccess: true,
      });

      expect(result.values).toContainEqual({ status: 'draft' });
      expect(result.values).toContainEqual({ status: 'published' });
      expect(result.values.length).toBeGreaterThanOrEqual(2);
    });

    it('respects where filter', async () => {
      await booted.frogbot.delete({ collection: postsSlug, where: {}, overrideAccess: true });

      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'FilterMe', status: 'draft' },
        overrideAccess: true,
      });
      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'IgnoreMe', status: 'published' },
        overrideAccess: true,
      });

      const result = await booted.frogbot.findDistinct({
        collection: postsSlug,
        field: 'title',
        where: { status: { equals: 'draft' } },
        overrideAccess: true,
      });

      expect(result.values).toContainEqual({ title: 'FilterMe' });
      expect(result.values).not.toContainEqual({ title: 'IgnoreMe' });
    });

    it('returns paginated shape (totalDocs, page, etc.)', async () => {
      await booted.frogbot.delete({ collection: postsSlug, where: {}, overrideAccess: true });

      await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'PagTest', status: 'draft' },
        overrideAccess: true,
      });

      const result = await booted.frogbot.findDistinct({
        collection: postsSlug,
        field: 'status',
        overrideAccess: true,
      });

      expect(result).toHaveProperty('totalDocs');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('hasNextPage');
      expect(result).toHaveProperty('hasPrevPage');
      expect(typeof result.totalDocs).toBe('number');
      expect(typeof result.page).toBe('number');
    });
  });
});
