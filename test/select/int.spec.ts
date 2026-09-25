import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotRequest } from 'frogbot';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import { databasePath, postsSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Local API select', () => {
  let booted: BootedFrogBot;
  let sqlite: SQLiteAdapter;
  let owner: { id: number | string };
  let other: { id: number | string };
  let testIndex = 0;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);

    sqlite = booted.payload.db as SQLiteAdapter;
  });

  afterAll(async () => {
    await booted.shutdown();

    await rm(databasePath, { force: true });
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    testIndex += 1;

    owner = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: `owner-${testIndex}@example.com`, password: 'password', name: 'Owner' },
    });

    other = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: `other-${testIndex}@example.com`, password: 'password', name: 'Other' },
    });
  });

  async function createPost(title: string, ownerID = owner.id) {
    return booted.frogbot.create({
      collection: postsSlug,
      data: {
        title,
        body: `${title} body`,
        details: { summary: `${title} summary`, budget: 50 },
        owner: ownerID,
        secret: `${title} secret`,
      },
    });
  }

  async function createRestoreFixture() {
    const post = await createPost('Original');

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: {
        title: 'Updated',
        body: 'Updated body',
        details: { summary: 'Updated summary', budget: 75 },
        owner: other.id,
        secret: 'Updated secret',
      },
    });

    const versions = await booted.frogbot.findVersions({
      collection: postsSlug,
      where: { parent: { equals: post.id } },
      depth: 0,
      pagination: false,
    });

    expect(versions.docs).toHaveLength(2);

    const original = versions.docs.find((version) => version.version.title === 'Original');

    expect(original).toBeDefined();
    expect(original!.version).toMatchObject({
      title: 'Original',
      body: 'Original body',
      details: { summary: 'Original summary', budget: 50 },
      owner: owner.id,
      secret: 'Original secret',
    });

    return { post, original: original!, versions };
  }

  it('applies include, exclude, and nested projections while retaining identifiers', async () => {
    const post = await createPost('Projection');

    const included = await booted.frogbot.findByID({
      collection: postsSlug,
      id: post.id,
      select: { title: true, details: { summary: true } },
    });

    const excluded = await booted.frogbot.findByID({
      collection: postsSlug,
      id: post.id,
      select: { body: false, details: { budget: false } },
    });

    expect(included).toMatchObject({
      id: post.id,
      title: 'Projection',
      details: { summary: 'Projection summary' },
    });
    expect(included.body).toBeUndefined();
    expect(included.details?.budget).toBeUndefined();
    expect(excluded.body).toBeUndefined();
    expect(excluded.details?.summary).toBe('Projection summary');
    expect(excluded.details?.budget).toBeUndefined();
  });

  it('enforces row and field access for a framework-issued request', async () => {
    const visible = await createPost('Visible');
    await createPost('Hidden', other.id);

    const req: FrogBotRequest = await booted.frogbot.createRequest({
      user: { ...owner, collection: usersSlug },
    });

    const result = await booted.frogbot.find({
      collection: postsSlug,
      overrideAccess: false,
      req,
      select: { title: true, secret: true },
    });

    expect(result.docs).toHaveLength(1);
    expect(result.docs[0]).toMatchObject({ id: visible.id, title: 'Visible' });
    expect(result.docs[0].secret).toBeUndefined();
  });

  it('bypasses access by default', async () => {
    await createPost('Owner post');
    await createPost('Other post', other.id);

    const result = await booted.frogbot.find({ collection: postsSlug, select: { title: true } });

    expect(result.docs.map((post) => post.title).sort()).toEqual(['Other post', 'Owner post']);
  });

  it('projects populated relationships at depth without losing relation data', async () => {
    const post = await createPost('Related');

    const result = await booted.frogbot.findByID({
      collection: postsSlug,
      id: post.id,
      depth: 1,
      populate: { [usersSlug]: { name: true } },
      select: { title: true, owner: true },
    });

    expect(result.owner).toMatchObject({ id: owner.id, name: 'Owner' });
    expect((result.owner as { email?: string }).email).toBeUndefined();
  });

  it('does not remove persisted fields when a mutation response is projected', async () => {
    const created = await booted.frogbot.create({
      collection: postsSlug,
      data: {
        title: 'Created',
        body: 'Persisted body',
        details: { summary: 'Persisted summary', budget: 25 },
        owner: owner.id,
      },
      select: { title: true },
    });

    expect(created.body).toBeUndefined();

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      id: created.id,
      data: { title: 'Updated' },
      select: { title: true },
    });

    expect(updated.body).toBeUndefined();

    const persisted = await booted.frogbot.findByID({ collection: postsSlug, id: created.id });

    expect(persisted).toMatchObject({
      title: 'Updated',
      body: 'Persisted body',
      details: { summary: 'Persisted summary', budget: 25 },
    });

    const stored = await sqlite.client.execute({
      sql: 'select body, details_summary, details_budget from select_posts where id = ?',
      args: [created.id],
    });

    expect(stored.rows[0]).toMatchObject({
      body: 'Persisted body',
      details_summary: 'Persisted summary',
      details_budget: 25,
    });
  });

  it('projects duplicate responses while persisting the complete duplicate', async () => {
    const source = await createPost('Duplicate');

    const duplicated = await booted.frogbot.duplicate({
      collection: postsSlug,
      id: source.id,
      select: { title: true, details: { summary: true } },
    });

    expect(duplicated.id).not.toBe(source.id);
    expect(duplicated).toEqual({
      id: expect.any(Number),
      title: 'Duplicate',
      details: { summary: 'Duplicate summary' },
    });

    const persisted = await booted.frogbot.findByID({
      collection: postsSlug,
      id: duplicated.id,
      depth: 0,
    });

    expect(persisted).toMatchObject({
      id: duplicated.id,
      title: 'Duplicate',
      body: 'Duplicate body',
      details: { summary: 'Duplicate summary', budget: 50 },
      owner: owner.id,
      secret: 'Duplicate secret',
    });

    const sourceAfter = await booted.frogbot.findByID({
      collection: postsSlug,
      id: source.id,
    });

    expect(sourceAfter).toEqual(source);
  });

  it('projects every bulk-update response while retaining unselected persisted fields', async () => {
    const first = await createPost('First');
    const second = await createPost('Second');
    const untouched = await createPost('Untouched', other.id);

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      where: { id: { in: [first.id, second.id] } },
      data: { title: 'Updated' },
      select: { title: true, details: { summary: true } },
    });

    expect(updated.errors).toEqual([]);
    expect(updated.docs).toHaveLength(2);
    expect(updated.docs).toEqual(
      expect.arrayContaining([
        { id: first.id, title: 'Updated', details: { summary: 'First summary' } },
        { id: second.id, title: 'Updated', details: { summary: 'Second summary' } },
      ]),
    );

    const persisted = await booted.frogbot.find({
      collection: postsSlug,
      where: { id: { in: [first.id, second.id] } },
      depth: 0,
    });

    expect(persisted.docs).toHaveLength(2);
    expect(persisted.docs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          title: 'Updated',
          body: 'First body',
          details: { summary: 'First summary', budget: 50 },
          owner: owner.id,
          secret: 'First secret',
        }),
        expect.objectContaining({
          id: second.id,
          title: 'Updated',
          body: 'Second body',
          details: { summary: 'Second summary', budget: 50 },
          owner: owner.id,
          secret: 'Second secret',
        }),
      ]),
    );

    const untouchedAfter = await booted.frogbot.findByID({
      collection: postsSlug,
      id: untouched.id,
    });

    expect(untouchedAfter).toEqual(untouched);
  });

  it('projects every bulk-delete response and deletes only matching documents', async () => {
    const first = await createPost('First');
    const second = await createPost('Second');
    const untouched = await createPost('Untouched', other.id);

    const deleted = await booted.frogbot.delete({
      collection: postsSlug,
      where: { id: { in: [first.id, second.id] } },
      select: { title: true, details: { summary: true } },
    });

    expect(deleted.errors).toEqual([]);
    expect(deleted.docs).toHaveLength(2);
    expect(deleted.docs).toEqual(
      expect.arrayContaining([
        { id: first.id, title: 'First', details: { summary: 'First summary' } },
        { id: second.id, title: 'Second', details: { summary: 'Second summary' } },
      ]),
    );

    const remaining = await booted.frogbot.find({ collection: postsSlug });

    expect(remaining.totalDocs).toBe(1);
    expect(remaining.docs).toEqual([untouched]);
  });

  it('projects single-delete responses and removes the document', async () => {
    const post = await createPost('Deleted');

    const deleted = await booted.frogbot.delete({
      collection: postsSlug,
      id: post.id,
      select: { title: true, details: { summary: true } },
    });

    expect(deleted).toEqual({
      id: post.id,
      title: 'Deleted',
      details: { summary: 'Deleted summary' },
    });

    const remaining = await booted.frogbot.count({
      collection: postsSlug,
      where: { id: { equals: post.id } },
    });

    expect(remaining.totalDocs).toBe(0);
  });

  it('projects version list and single-version reads without changing stored snapshots', async () => {
    const post = await createPost('Original');

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: 'Updated', body: 'Updated body' },
    });

    const versions = await booted.frogbot.findVersions({
      collection: postsSlug,
      where: { parent: { equals: post.id } },
      select: { version: { title: true } },
    });

    const original = versions.docs.find((version) => version.version.title === 'Original');

    expect(original).toBeDefined();
    expect(original!.version.body).toBeUndefined();

    const selectedVersion = await booted.frogbot.findVersionByID({
      collection: postsSlug,
      id: original!.id,
      select: { version: { title: true } },
    });

    expect(selectedVersion.version.title).toBe('Original');
    expect(selectedVersion.version.body).toBeUndefined();

    const persisted = await booted.frogbot.findVersionByID({
      collection: postsSlug,
      id: original!.id,
      depth: 0,
    });

    expect(persisted.version).toMatchObject({
      title: 'Original',
      body: 'Original body',
      details: { summary: 'Original summary', budget: 50 },
      owner: owner.id,
      secret: 'Original secret',
    });
  });

  it('restores the full document and stores a complete new version snapshot without select', async () => {
    const { post, original, versions } = await createRestoreFixture();

    const restored = await booted.frogbot.restoreVersion({
      collection: postsSlug,
      id: original.id,
      depth: 0,
    });

    expect(restored).toEqual({
      id: post.id,
      title: 'Original',
      body: 'Original body',
      details: { summary: 'Original summary', budget: 50 },
      owner: owner.id,
      secret: 'Original secret',
      createdAt: original.version.createdAt,
      updatedAt: expect.any(String),
    });

    const persisted = await booted.frogbot.findByID({
      collection: postsSlug,
      id: post.id,
      depth: 0,
    });

    expect(persisted).toEqual(restored);

    const versionsAfter = await booted.frogbot.findVersions({
      collection: postsSlug,
      where: { parent: { equals: post.id } },
      depth: 0,
      pagination: false,
    });

    expect(versionsAfter.docs).toHaveLength(3);

    const previousIDs = new Set(versions.docs.map((version) => version.id));
    const newVersions = versionsAfter.docs.filter((version) => !previousIDs.has(version.id));

    expect(newVersions).toHaveLength(1);

    const snapshot = await booted.frogbot.findVersionByID({
      collection: postsSlug,
      id: newVersions[0].id,
      depth: 0,
    });

    const stored = await sqlite.client.execute({
      sql: 'select * from _select_posts_v where id = ? and parent_id = ?',
      args: [snapshot.id, post.id],
    });

    expect(stored.rows).toHaveLength(1);

    expect(snapshot.version).toEqual({
      ...original.version,
      updatedAt: persisted.updatedAt,
    });

    expect(stored.rows[0]).toMatchObject({
      version_title: 'Original',
      version_body: 'Original body',
      version_details_summary: 'Original summary',
      version_details_budget: 50,
      version_owner_id: owner.id,
      version_secret: 'Original secret',
      version_created_at: persisted.createdAt,
      version_updated_at: persisted.updatedAt,
    });

    const sourceAfter = await booted.frogbot.findVersionByID({
      collection: postsSlug,
      id: original.id,
      depth: 0,
    });

    expect(sourceAfter).toEqual(original);
  });

  describe('unsupported upstream restore projection reproduction', () => {
    it('rolls back the parent and version history when an owner-omitting restore fails to save its snapshot', async () => {
      const { post, original, versions } = await createRestoreFixture();

      const parentBefore = await booted.frogbot.findByID({
        collection: postsSlug,
        id: post.id,
        depth: 0,
      });

      const storedParentBefore = await sqlite.client.execute({
        sql: 'select * from select_posts where id = ?',
        args: [post.id],
      });

      const storedVersionsBefore = await sqlite.client.execute({
        sql: 'select * from _select_posts_v where parent_id = ? order by id',
        args: [post.id],
      });

      await expect(
        booted.payload.restoreVersion({
          collection: postsSlug,
          id: original.id,
          select: { title: true },
        }),
      ).rejects.toMatchObject({
        cause: {
          code: 'SQLITE_CONSTRAINT_NOTNULL',
          message: 'NOT NULL constraint failed: _select_posts_v.version_owner_id',
        },
      });

      const parentAfter = await booted.frogbot.findByID({
        collection: postsSlug,
        id: post.id,
        depth: 0,
      });

      const versionsAfter = await booted.frogbot.findVersions({
        collection: postsSlug,
        where: { parent: { equals: post.id } },
        depth: 0,
        pagination: false,
      });

      const storedParentAfter = await sqlite.client.execute({
        sql: 'select * from select_posts where id = ?',
        args: [post.id],
      });

      const storedVersionsAfter = await sqlite.client.execute({
        sql: 'select * from _select_posts_v where parent_id = ? order by id',
        args: [post.id],
      });

      expect(parentAfter).toEqual(parentBefore);
      expect(versionsAfter.totalDocs).toBe(2);
      expect(versionsAfter.docs).toEqual(versions.docs);
      expect(storedParentAfter.rows).toEqual(storedParentBefore.rows);
      expect(storedVersionsAfter.rows).toHaveLength(2);
      expect(storedVersionsAfter.rows).toEqual(storedVersionsBefore.rows);
    });
  });
});
