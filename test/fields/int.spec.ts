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

  it('keeps the slug when the source changes, and normalizes an explicit one', async () => {
    const created = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'Original title' },
      overrideAccess: true,
    });

    const renamed = await booted.frogbot.update({
      collection: postsSlug,
      id: created.id,
      data: { title: 'Renamed title' },
      overrideAccess: true,
    });

    const explicit = await booted.frogbot.update({
      collection: postsSlug,
      id: created.id,
      data: { slug: 'Hand Written' },
      overrideAccess: true,
    });

    expect(created.slug).toBe('original-title');
    expect(renamed.slug).toBe('original-title');
    expect(explicit.slug).toBe('hand-written');
  });

  it('rejects a failed slugify callback without creating a document', async () => {
    await expect(
      booted.frogbot.create({
        collection: postsSlug,
        data: { title: rejectedTitle },
        overrideAccess: true,
      }),
    ).rejects.toThrow('slug generation rejected');

    const { totalDocs } = await booted.frogbot.count({
      collection: postsSlug,
      overrideAccess: true,
    });

    expect(totalDocs).toBe(0);
  });

  it('rejects an explicit duplicate slug when uniqueness is on', async () => {
    await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'First', slug: 'duplicate-slug' },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.create({
        collection: postsSlug,
        data: { title: 'Second', slug: 'duplicate-slug' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });

  it('rejects a duplicate explicit slug even when uniqueness is off, and dedupes generated ones', async () => {
    await booted.frogbot.create({
      collection: nonUniquePostsSlug,
      data: { title: 'First', slug: 'duplicate-slug' },
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.create({
        collection: nonUniquePostsSlug,
        data: { title: 'Second', slug: 'duplicate-slug' },
        overrideAccess: true,
      }),
    ).rejects.toThrow();

    const generated = await booted.frogbot.create({
      collection: nonUniquePostsSlug,
      data: { title: 'Duplicate slug' },
      overrideAccess: true,
    });

    expect(generated.slug).not.toBe('duplicate-slug');
  });

  it('falls back to a numbered slug when slugify returns nothing', async () => {
    const created = await booted.frogbot.create({
      collection: undefinedSlugPostsSlug,
      data: { title: 'No slug' },
      overrideAccess: true,
    });

    expect(created.slug).toMatch(/-\d+$/);
  });

  it('gives an autosaved draft a slug before it has a title', async () => {
    const draft = await booted.frogbot.create({
      collection: draftPostsSlug,
      data: {},
      draft: true,
      overrideAccess: true,
    });

    expect(draft.slug).toEqual(expect.any(String));
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
