import { rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  countRequests,
  databaseDirectory,
  hookObservations,
  nestedFieldsSlug,
  postsSlug,
  usersSlug,
} from './shared.js';

describe('field runtime boundaries', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname(fileURLToPath(import.meta.url)));
  });

  afterAll(async () => {
    await booted?.shutdown();
    await rm(databaseDirectory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    countRequests.length = 0;
    hookObservations.length = 0;
  });

  async function createEnabledDraft() {
    const post = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Original' },
      draft: true,
    });

    return booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { generateSlug: true, title: 'First revision' },
      draft: true,
    });
  }

  it('regenerates a draft when an update omits the enabled checkbox', async () => {
    const post = await createEnabledDraft();

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: 'Second revision', slug: post.slug },
      draft: true,
    });

    const persisted = await booted.frogbot.findByID({
      collection: postsSlug,
      id: post.id,
      draft: true,
    });

    expect(persisted).toMatchObject({ title: 'Second revision', slug: 'second-revision' });
  });

  it('preserves a manual slug when the update omits the enabled checkbox', async () => {
    const post = await createEnabledDraft();

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: 'Second revision', slug: 'manual' },
      draft: true,
    });

    expect(updated).toMatchObject({ slug: 'manual', generateSlug: false });
  });

  it.each([{ note: 'changed' }, { note: 'changed', slug: 'first-revision' }])(
    'preserves the slug while the omitted source is normalized concurrently: %j',
    async (data) => {
      const post = await createEnabledDraft();

      await booted.frogbot.update({
        collection: postsSlug,
        id: post.id,
        data,
        draft: true,
      });

      const persisted = await booted.frogbot.findByID({
        collection: postsSlug,
        id: post.id,
        draft: true,
      });

      expect(persisted).toMatchObject({
        note: 'changed',
        title: 'First revision',
        slug: 'first-revision',
      });
    },
  );

  it('clears the draft slug when the source is explicitly cleared', async () => {
    const post = await createEnabledDraft();

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: '', slug: post.slug },
      draft: true,
    });

    expect(updated).toMatchObject({ title: '', slug: null });
  });

  it('preserves a manual slug when the source and checkbox are omitted', async () => {
    const post = await createEnabledDraft();

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { slug: 'manual' },
      draft: true,
    });

    expect(updated).toMatchObject({ title: 'First revision', slug: 'manual', generateSlug: false });
  });

  it('preserves an explicit disabled checkbox during a partial update', async () => {
    const post = await createEnabledDraft();

    const updated = await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: 'Second revision', generateSlug: false },
      draft: true,
    });

    expect(updated).toMatchObject({ slug: 'first-revision', generateSlug: false });
  });

  it('counts versions using the update request and active SQLite transaction', async () => {
    const post = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Original' },
      draft: true,
    });
    const req = await booted.frogbot.createRequest({
      user: { id: 123, collection: usersSlug },
    });

    req.context.reviewMarker = 'preserved';

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { generateSlug: true, title: 'Revision' },
      draft: true,
      req,
    });

    expect(countRequests).toHaveLength(1);
    expect(countRequests[0].req).toBe(req);
    expect(countRequests[0].context).toMatchObject({ reviewMarker: 'preserved' });
    expect(countRequests[0].userID).toBe(123);
    expect(countRequests[0].transactionID).toBeTruthy();
  });

  it('handles missing after-change siblings while other phases receive their sibling fields', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Hooks' },
    });

    await booted.frogbot.create({
      collection: nestedFieldsSlug,
      data: { group: { value: 'Nested' } },
    });

    expect(hookObservations).toEqual(
      expect.arrayContaining([
        { field: 'title', phase: 'afterChange', siblingNames: undefined },
        { field: 'value', phase: 'afterChange', siblingNames: undefined },
        { field: 'value', phase: 'beforeValidate', siblingNames: ['value'] },
        { field: 'value', phase: 'beforeChange', siblingNames: ['value'] },
        { field: 'value', phase: 'afterRead', siblingNames: ['value'] },
      ]),
    );
  });

  it('supplies sibling fields to nested before-duplicate hooks', async () => {
    const post = await booted.frogbot.create({
      collection: nestedFieldsSlug,
      data: { group: { value: 'Nested' } },
    });

    await booted.frogbot.duplicate({ collection: nestedFieldsSlug, id: post.id });

    expect(hookObservations).toContainEqual({
      field: 'value',
      phase: 'beforeDuplicate',
      siblingNames: ['value'],
    });
  });
});
