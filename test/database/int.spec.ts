import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { postsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'mongodb';

describe(`database contract [${adapterLabel}]`, () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });
  beforeEach(async () => { await clearAndSeed(booted.frogbot, 'empty'); });

  // ─── Create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('returns the created document with an id', async () => {
      const doc = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Hello World', priority: 10, published: true },
        overrideAccess: true,
      });
      expect(doc.id).toBeDefined();
      expect(doc.title).toBe('Hello World');
      expect(doc.priority).toBe(10);
      expect(doc.published).toBe(true);
    });

    it('applies default values', async () => {
      const doc = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Defaults' },
        overrideAccess: true,
      });
      expect(doc.published).toBe(false);
      expect(doc.status).toBe('draft');
    });

    it('enforces required fields', async () => {
      await expect(
        booted.frogbot.create({
          collection: postsSlug,
          data: {} as any,
          overrideAccess: true,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── FindByID ──────────────────────────────────────────────────────────────

  describe('findByID', () => {
    it('retrieves a document by its ID', async () => {
      const created = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Find Me', content: 'body text' },
        overrideAccess: true,
      });
      const found = await booted.frogbot.findByID({
        collection: postsSlug,
        id: created.id,
        overrideAccess: true,
      });
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('Find Me');
      expect(found.content).toBe('body text');
    });

    it('throws for a non-existent ID', async () => {
      await expect(
        booted.frogbot.findByID({
          collection: postsSlug,
          id: '000000000000000000000000',
          overrideAccess: true,
        }),
      ).rejects.toThrow();
    });
  });

  // ─── Find ──────────────────────────────────────────────────────────────────

  describe('find', () => {
    it('returns all documents when no where is specified', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B' }, overrideAccess: true });

      const result = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });
      expect(result.docs).toHaveLength(2);
    });

    it('filters with where equals', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Draft', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Published', status: 'published' }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: { status: { equals: 'published' } },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].title).toBe('Published');
    });

    it('filters with where not_equals', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', priority: 1 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', priority: 2 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', priority: 3 }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: { priority: { not_equals: 2 } },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(2);
      expect(result.docs.map((d: any) => d.title).sort()).toEqual(['A', 'C']);
    });

    it('filters with where contains (text)', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Hello World' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Goodbye' }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: { title: { contains: 'Hello' } },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].title).toBe('Hello World');
    });

    it('filters with where greater_than / less_than', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Low', priority: 1 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'Mid', priority: 5 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'High', priority: 10 }, overrideAccess: true });

      const gt = await booted.frogbot.find({
        collection: postsSlug,
        where: { priority: { greater_than: 4 } },
        overrideAccess: true,
      });
      expect(gt.docs).toHaveLength(2);

      const lt = await booted.frogbot.find({
        collection: postsSlug,
        where: { priority: { less_than: 5 } },
        overrideAccess: true,
      });
      expect(lt.docs).toHaveLength(1);
      expect(lt.docs[0].title).toBe('Low');
    });

    it('filters with where in', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', priority: 1 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', priority: 2 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', priority: 3 }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: { priority: { in: [1, 3] } },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(2);
      expect(result.docs.map((d: any) => d.title).sort()).toEqual(['A', 'C']);
    });

    it('filters with compound AND (implicit)', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', priority: 1, status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', priority: 2, status: 'published' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', priority: 3, status: 'published' }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: {
          status: { equals: 'published' },
          priority: { greater_than: 2 },
        },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(1);
      expect(result.docs[0].title).toBe('C');
    });

    it('filters with OR', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', priority: 1 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', priority: 5 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', priority: 10 }, overrideAccess: true });

      const result = await booted.frogbot.find({
        collection: postsSlug,
        where: {
          or: [
            { priority: { equals: 1 } },
            { priority: { equals: 10 } },
          ],
        },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(2);
      expect(result.docs.map((d: any) => d.title).sort()).toEqual(['A', 'C']);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a single field by ID', async () => {
      const created = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Original', priority: 1 },
        overrideAccess: true,
      });
      const updated = await booted.frogbot.update({
        collection: postsSlug,
        id: created.id,
        data: { title: 'Modified' },
        overrideAccess: true,
      });
      expect(updated.title).toBe('Modified');
      expect(updated.priority).toBe(1); // unchanged field preserved
    });

    it('persists the update (verified via findByID)', async () => {
      const created = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Before' },
        overrideAccess: true,
      });
      await booted.frogbot.update({
        collection: postsSlug,
        id: created.id,
        data: { title: 'After' },
        overrideAccess: true,
      });
      const found = await booted.frogbot.findByID({
        collection: postsSlug,
        id: created.id,
        overrideAccess: true,
      });
      expect(found.title).toBe('After');
    });

    it('can set a field to null', async () => {
      const created = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Has Content', content: 'something' },
        overrideAccess: true,
      });
      const updated = await booted.frogbot.update({
        collection: postsSlug,
        id: created.id,
        data: { content: null as any },
        overrideAccess: true,
      });
      expect(updated.content).toBeFalsy();
    });

    it('bulk update with where clause', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', status: 'published' }, overrideAccess: true });

      const result = await booted.frogbot.update({
        collection: postsSlug,
        where: { status: { equals: 'draft' } },
        data: { status: 'published' },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(2);

      const all = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });
      const drafts = all.docs.filter((d: any) => d.status === 'draft');
      expect(drafts).toHaveLength(0);
    });
  });

  // ─── Delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('removes a document by ID', async () => {
      const created = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Delete Me' },
        overrideAccess: true,
      });
      await booted.frogbot.delete({
        collection: postsSlug,
        id: created.id,
        overrideAccess: true,
      });

      await expect(
        booted.frogbot.findByID({
          collection: postsSlug,
          id: created.id,
          overrideAccess: true,
        }),
      ).rejects.toThrow();
    });

    it('bulk delete with where clause', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', status: 'published' }, overrideAccess: true });

      const result = await booted.frogbot.delete({
        collection: postsSlug,
        where: { status: { equals: 'draft' } },
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(2);

      const remaining = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });
      expect(remaining.docs).toHaveLength(1);
      expect(remaining.docs[0].title).toBe('C');
    });

    it('delete all with empty where', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B' }, overrideAccess: true });

      await booted.frogbot.delete({
        collection: postsSlug,
        where: {},
        overrideAccess: true,
      });

      const remaining = await booted.frogbot.find({ collection: postsSlug, overrideAccess: true });
      expect(remaining.docs).toHaveLength(0);
    });
  });

  // ─── Count ─────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('returns total document count', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C' }, overrideAccess: true });

      const result = await booted.frogbot.count({ collection: postsSlug, overrideAccess: true });
      expect(result.totalDocs).toBe(3);
    });

    it('respects where filter', async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', status: 'draft' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', status: 'published' }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', status: 'published' }, overrideAccess: true });

      const result = await booted.frogbot.count({
        collection: postsSlug,
        where: { status: { equals: 'published' } },
        overrideAccess: true,
      });
      expect(result.totalDocs).toBe(2);
    });

    it('returns 0 for empty collection', async () => {
      const result = await booted.frogbot.count({ collection: postsSlug, overrideAccess: true });
      expect(result.totalDocs).toBe(0);
    });
  });

  // ─── Pagination ────────────────────────────────────────────────────────────

  describe('pagination', () => {
    beforeEach(async () => {
      for (let i = 0; i < 12; i++) {
        await booted.frogbot.create({
          collection: postsSlug,
          data: { title: `Post ${String(i).padStart(2, '0')}`, priority: i },
          overrideAccess: true,
        });
      }
    });

    it('returns correct page metadata', async () => {
      const page1 = await booted.frogbot.find({
        collection: postsSlug,
        limit: 5,
        page: 1,
        overrideAccess: true,
      });
      expect(page1.docs).toHaveLength(5);
      expect(page1.totalDocs).toBe(12);
      expect(page1.totalPages).toBe(3);
      expect(page1.hasNextPage).toBe(true);
      expect(page1.hasPrevPage).toBe(false);
    });

    it('page 2 returns the next slice', async () => {
      const page2 = await booted.frogbot.find({
        collection: postsSlug,
        limit: 5,
        page: 2,
        overrideAccess: true,
      });
      expect(page2.docs).toHaveLength(5);
      expect(page2.hasNextPage).toBe(true);
      expect(page2.hasPrevPage).toBe(true);
    });

    it('last page has correct doc count', async () => {
      const page3 = await booted.frogbot.find({
        collection: postsSlug,
        limit: 5,
        page: 3,
        overrideAccess: true,
      });
      expect(page3.docs).toHaveLength(2);
      expect(page3.hasNextPage).toBe(false);
      expect(page3.hasPrevPage).toBe(true);
    });

    it('pagination: false returns all docs', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        pagination: false,
        overrideAccess: true,
      });
      expect(result.docs).toHaveLength(12);
    });
  });

  // ─── Sort ──────────────────────────────────────────────────────────────────

  describe('sort', () => {
    beforeEach(async () => {
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'C', priority: 3 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'A', priority: 1 }, overrideAccess: true });
      await booted.frogbot.create({ collection: postsSlug, data: { title: 'B', priority: 2 }, overrideAccess: true });
    });

    it('sorts ascending by text field', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: 'title',
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.title)).toEqual(['A', 'B', 'C']);
    });

    it('sorts descending by text field', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: '-title',
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.title)).toEqual(['C', 'B', 'A']);
    });

    it('sorts ascending by number field', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: 'priority',
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.priority)).toEqual([1, 2, 3]);
    });

    it('sorts descending by number field', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: '-priority',
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.priority)).toEqual([3, 2, 1]);
    });

    it('sort + pagination returns correct slice in order', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: 'priority',
        limit: 2,
        page: 1,
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.priority)).toEqual([1, 2]);
    });

    it('sort + where filters then orders', async () => {
      const result = await booted.frogbot.find({
        collection: postsSlug,
        sort: '-priority',
        where: { priority: { greater_than: 1 } },
        overrideAccess: true,
      });
      expect(result.docs.map((d: any) => d.priority)).toEqual([3, 2]);
    });
  });

  // ─── Connection ────────────────────────────────────────────────────────────

  describe('connection', () => {
    it('frogbot.collections registry is populated after boot', () => {
      expect(Object.keys(booted.frogbot.collections)).toContain(postsSlug);
      expect(Object.keys(booted.frogbot.collections)).toContain(usersSlug);
    });
  });
});
