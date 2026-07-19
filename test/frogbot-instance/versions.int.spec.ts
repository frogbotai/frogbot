import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogbot } from '../__helpers/shared/bootFrogbot';
import { bootFrogbot } from '../__helpers/shared/bootFrogbot';
import { postsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('frogbot-instance: Version operations', () => {
  let booted: BootedFrogbot;

  beforeAll(async () => { booted = await bootFrogbot(dirname); });
  afterAll(async () => { await booted.shutdown(); });

  describe('findVersions', () => {
    it('returns version history after updates', async () => {
      const post = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'v1' },
        draft: true,
        overrideAccess: true,
      });

      await booted.frogbot.update({
        collection: postsSlug,
        id: post.id,
        data: { title: 'v2' },
        draft: true,
        overrideAccess: true,
      });

      await booted.frogbot.update({
        collection: postsSlug,
        id: post.id,
        data: { title: 'v3' },
        draft: true,
        overrideAccess: true,
      });

      const versions = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        overrideAccess: true,
      });

      expect(versions.docs.length).toBeGreaterThanOrEqual(2);
      expect(versions.docs[0].version.title).toBeDefined();
    });

    it('supports where filtering', async () => {
      const postA = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'FilterA' },
        draft: true,
        overrideAccess: true,
      });

      const postB = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'FilterB' },
        draft: true,
        overrideAccess: true,
      });

      const versionsA = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: postA.id } },
        overrideAccess: true,
      });

      const versionsB = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: postB.id } },
        overrideAccess: true,
      });

      const allParentIdsA = versionsA.docs.map((v) => v.parent);
      const allParentIdsB = versionsB.docs.map((v) => v.parent);

      expect(allParentIdsA.every((id) => id === postA.id)).toBe(true);
      expect(allParentIdsB.every((id) => id === postB.id)).toBe(true);
    });

    it('returns paginated shape', async () => {
      const post = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'PagVersion' },
        draft: true,
        overrideAccess: true,
      });

      const versions = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        overrideAccess: true,
      });

      expect(versions).toHaveProperty('docs');
      expect(versions).toHaveProperty('totalDocs');
      expect(versions).toHaveProperty('page');
      expect(versions).toHaveProperty('totalPages');
      expect(versions).toHaveProperty('hasNextPage');
      expect(versions).toHaveProperty('hasPrevPage');
    });
  });

  describe('findVersionByID', () => {
    it('returns a specific version with TypeWithVersion shape', async () => {
      const post = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'VersionByID' },
        draft: true,
        overrideAccess: true,
      });

      const versions = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        overrideAccess: true,
      });

      const versionID = versions.docs[0].id;

      const version = await booted.frogbot.findVersionByID({
        collection: postsSlug,
        id: versionID,
        overrideAccess: true,
      });

      expect(version).toHaveProperty('id', versionID);
      expect(version).toHaveProperty('version');
      expect(version.version).toHaveProperty('title', 'VersionByID');
      expect(version).toHaveProperty('createdAt');
      expect(version).toHaveProperty('updatedAt');
    });
  });

  describe('countVersions', () => {
    it('returns a number for totalDocs', async () => {
      const post = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'CountTest' },
        draft: true,
        overrideAccess: true,
      });

      const { totalDocs } = await booted.frogbot.countVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        overrideAccess: true,
      });

      expect(typeof totalDocs).toBe('number');
      expect(totalDocs).toBeGreaterThanOrEqual(0);
    });

    it('respects where filter — scoped to a single parent', async () => {
      const postA = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'CountFilterA' },
        draft: true,
        overrideAccess: true,
      });

      const postB = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'CountFilterB' },
        draft: true,
        overrideAccess: true,
      });

      const { totalDocs: countAll } = await booted.frogbot.countVersions({
        collection: postsSlug,
        overrideAccess: true,
      });

      const { totalDocs: countA } = await booted.frogbot.countVersions({
        collection: postsSlug,
        where: { parent: { equals: postA.id } },
        overrideAccess: true,
      });

      const { totalDocs: countB } = await booted.frogbot.countVersions({
        collection: postsSlug,
        where: { parent: { equals: postB.id } },
        overrideAccess: true,
      });

      // Total count should be >= sum of individual filtered counts
      expect(countAll).toBeGreaterThanOrEqual(countA + countB);
      // Each filtered count should be less than or equal to total
      expect(countA).toBeLessThanOrEqual(countAll);
      expect(countB).toBeLessThanOrEqual(countAll);
    });
  });

  describe('restoreVersion', () => {
    it('reverts doc to a prior version data', async () => {
      // Create initial doc as published
      const post = await booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Restore Original', content: 'original content', _status: 'published' },
        overrideAccess: true,
      });

      // Update creates a new version snapshot of the previous state
      await booted.frogbot.update({
        collection: postsSlug,
        id: post.id,
        data: { title: 'Restore Updated', content: 'updated content', _status: 'published' },
        draft: true,
        overrideAccess: true,
      });

      const versions = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        overrideAccess: true,
      });

      expect(versions.docs.length).toBeGreaterThanOrEqual(2);

      // Restore the oldest version (last in default sort) — mirrors Payload's pattern
      const versionToRestore = versions.docs[versions.docs.length - 1];

      const restored = await booted.frogbot.restoreVersion({
        collection: postsSlug,
        id: versionToRestore.id,
        overrideAccess: true,
      });

      expect(restored.title).toEqual('Restore Original');
      expect(restored.content).toEqual('original content');

      const current = await booted.frogbot.findByID({
        collection: postsSlug,
        id: post.id,
        draft: true,
        overrideAccess: true,
      });
      expect(current.title).toEqual('Restore Original');
    });
  });
});
