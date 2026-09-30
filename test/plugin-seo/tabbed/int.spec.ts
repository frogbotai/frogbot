import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  countMeta,
  credentials,
  generateTitlePath,
  generationRequests,
  pagesSlug,
  postsSlug,
  tabLabels,
  usersSlug,
} from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SEO plugin tabbed integration', () => {
  let booted: BootedFrogBot;
  let collections: BootedFrogBot['payload']['config']['collections'];
  let headers: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-seo-tabbed');

    collections = (await booted.frogbot.config._internal.payloadConfig).collections;
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    generationRequests.length = 0;

    await booted.restClient.post(`/api/${usersSlug}`, credentials);

    const login = await booted.restClient.post<{ token: string }>(
      `/api/${usersSlug}/login`,
      credentials,
    );

    headers = { Authorization: `JWT ${login.body.token}` };
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it.each([pagesSlug, postsSlug])('registers exactly one meta field on %s', (slug) => {
    const collection = collections.find((entry) => entry.slug === slug)!;

    expect(countMeta(collection.fields)).toBe(1);
  });

  it('preserves the hand-placed pages tabs without adding an SEO tab', () => {
    const pages = collections.find((entry) => entry.slug === pagesSlug)!;

    expect(tabLabels(pages.fields)).toEqual(['Content', 'Search']);
    expect(pages.fields.filter((field) => 'name' in field && field.name === 'meta')).toEqual([]);
  });

  it('adds an SEO tab only to posts', () => {
    const seoCollections = collections
      .filter((collection) => tabLabels(collection.fields).includes('SEO'))
      .map((collection) => collection.slug);

    const posts = collections.find((entry) => entry.slug === postsSlug)!;

    expect(seoCollections).toEqual([postsSlug]);
    expect(tabLabels(posts.fields)).toEqual(['Content', 'SEO']);
  });

  it('POST /api/plugin-seo/generate-title generates a title for hand-placed pages', async () => {
    const body = { collectionSlug: pagesSlug, doc: { title: 'Tabbed page' } };

    const response = await booted.restClient.post(generateTitlePath, body, { headers });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: `${pagesSlug}: Tabbed page` });
  });
});
