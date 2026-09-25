import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed';
import {
  draftPostsSlug,
  nestedFieldsSlug,
  nonUniquePostsSlug,
  postsSlug,
  rejectedTitle,
  undefinedSlugPostsSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('fields', () => {
  let booted: BootedFrogBot;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('persists the resolved result of an async slugify callback', async () => {
    const created = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Async SQLite Slug' },
      overrideAccess: true,
    });

    const persisted = await booted.frogbot.findByID({
      collection: postsSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(persisted.slug).toBe('async-sqlite-slug');
    expect(persisted.slug).not.toBeInstanceOf(Promise);
  });

  it('preserves manual and locked slugs until generation is explicitly enabled', async () => {
    const created = await booted.frogbot.create({
      collection: postsSlug,
      data: { generateSlug: false, slug: 'manual-slug', title: 'Original title' },
      overrideAccess: true,
    });

    const locked = await booted.frogbot.update({
      collection: postsSlug,
      id: created.id,
      data: { generateSlug: false, title: 'Locked title' },
      overrideAccess: true,
    });

    expect(locked.slug).toBe('manual-slug');

    await booted.frogbot.update({
      collection: postsSlug,
      id: created.id,
      data: { generateSlug: true, title: 'Generated title' },
      overrideAccess: true,
    });

    const persisted = await booted.frogbot.findByID({
      collection: postsSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(persisted.slug).toBe('generated-title');
  });

  it('rejects a failed slugify callback without creating a document', async () => {
    await expect(
      booted.frogbot.create({
        collection: postsSlug,
        data: { title: rejectedTitle },
        overrideAccess: true,
      }),
    ).rejects.toThrow('slug generation rejected');

    const persisted = await booted.frogbot.find({
      collection: postsSlug,
      overrideAccess: true,
      where: { title: { equals: rejectedTitle } },
    });

    expect(persisted.totalDocs).toBe(0);
  });

  it('rejects duplicate slugs when uniqueness is enabled', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Duplicate Slug' },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Duplicate Slug' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();

    const persisted = await booted.frogbot.find({
      collection: postsSlug,
      overrideAccess: true,
      where: { slug: { equals: 'duplicate-slug' } },
    });

    expect(persisted.totalDocs).toBe(1);
  });

  it('persists duplicate slugs when uniqueness is disabled', async () => {
    await booted.frogbot.create({
      collection: nonUniquePostsSlug,
      data: { title: 'Duplicate Slug' },
      overrideAccess: true,
    });

    await booted.frogbot.create({
      collection: nonUniquePostsSlug,
      data: { title: 'Duplicate Slug' },
      overrideAccess: true,
    });

    const persisted = await booted.frogbot.find({
      collection: nonUniquePostsSlug,
      overrideAccess: true,
      where: { slug: { equals: 'duplicate-slug' } },
    });

    expect(persisted.totalDocs).toBe(2);
  });

  it('rejects a required slug when slugify resolves undefined', async () => {
    await expect(
      booted.frogbot.create({
        collection: undefinedSlugPostsSlug,
        data: { title: 'Missing Slug' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();

    const persisted = await booted.frogbot.count({
      collection: undefinedSlugPostsSlug,
      overrideAccess: true,
    });

    expect(persisted.totalDocs).toBe(0);
  });

  it('regenerates draft slugs and locks the slug when published', async () => {
    const created = await booted.frogbot.create({
      collection: draftPostsSlug,
      data: { title: 'First Draft' },
      draft: true,
      overrideAccess: true,
    });

    const draft = await booted.frogbot.update({
      collection: draftPostsSlug,
      id: created.id,
      data: { generateSlug: true, title: 'Second Draft' },
      draft: true,
      overrideAccess: true,
    });

    expect(draft.slug).toBe('second-draft');
    expect(draft.generateSlug).toBe(true);

    const published = await booted.frogbot.update({
      collection: draftPostsSlug,
      id: created.id,
      data: { _status: 'published', generateSlug: true, title: 'Published Title' },
      draft: false,
      overrideAccess: true,
    });

    expect(published.slug).toBe('published-title');
    expect(published.generateSlug).toBe(false);

    const locked = await booted.frogbot.update({
      collection: draftPostsSlug,
      id: created.id,
      data: { generateSlug: false, title: 'Later Draft' },
      draft: true,
      overrideAccess: true,
    });

    const persisted = await booted.frogbot.findByID({
      collection: draftPostsSlug,
      id: created.id,
      draft: true,
      overrideAccess: true,
    });

    expect(locked.slug).toBe('published-title');
    expect(persisted.slug).toBe('published-title');
  });

  it('preserves a manual slug and locks generation during an autosave update', async () => {
    const created = await booted.frogbot.create({
      collection: draftPostsSlug,
      data: { title: 'Initial Draft' },
      draft: true,
      overrideAccess: true,
    });

    const updated = await booted.frogbot.update({
      collection: draftPostsSlug,
      id: created.id,
      data: { generateSlug: true, slug: 'manual-draft-slug', title: 'Changed Draft' },
      draft: true,
      overrideAccess: true,
    });

    const persisted = await booted.frogbot.findByID({
      collection: draftPostsSlug,
      id: created.id,
      draft: true,
      overrideAccess: true,
    });

    expect(updated.slug).toBe('manual-draft-slug');
    expect(updated.generateSlug).toBe(false);
    expect(persisted.slug).toBe('manual-draft-slug');
  });

  it('passes FrogBot requests to hooks inside nested containers', async () => {
    const created = await booted.frogbot.create({
      collection: nestedFieldsSlug,
      data: {
        content: [{ blockType: 'note', value: 'block' }],
        details: { value: 'tab' },
        group: { accessValue: 'accessible', validatedValue: 'valid', value: 'group' },
        items: [{ value: 'array' }],
      },
      overrideAccess: false,
    });

    const persisted = await booted.frogbot.findByID({
      collection: nestedFieldsSlug,
      id: created.id,
      overrideAccess: true,
    });

    expect(persisted.group?.value).toBe('group:0');
    expect(persisted.group?.accessValue).toBe('accessible');
    expect(persisted.group?.validatedValue).toBe('valid');
    expect(persisted.items?.[0]?.value).toBe('array:0');
    expect(persisted.details?.value).toBe('tab:0');
    expect(persisted.content?.[0]?.value).toBe('block:0');
  });

  it('rejects nested validation through a request with req.frogbot', async () => {
    await expect(
      booted.frogbot.create({
        collection: nestedFieldsSlug,
        data: { group: { validatedValue: 'invalid' } },
        overrideAccess: false,
      }),
    ).rejects.toThrow('Group > Validated Value');

    const persisted = await booted.frogbot.count({
      collection: nestedFieldsSlug,
      overrideAccess: true,
    });

    expect(persisted.totalDocs).toBe(0);
  });
});
