import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import {
  countMeta,
  credentials,
  draftsSlug,
  generateTitlePath,
  generationRequests,
  pagesSlug,
  postsSlug,
  tabLabels,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SEO plugin integration', () => {
  let booted: BootedFrogBot;
  let collections: BootedFrogBot['payload']['config']['collections'];
  let headers: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);

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

  it('preserves the hand-placed pages tabs without adding an SEO group', () => {
    const pages = collections.find((entry) => entry.slug === pagesSlug)!;

    expect(tabLabels(pages.fields)).toEqual(['Content', 'Search']);
    expect(pages.fields.filter((field) => 'name' in field && field.name === 'meta')).toEqual([]);
  });

  it('injects an SEO group on posts without changing its content layout', () => {
    const posts = collections.find((entry) => entry.slug === postsSlug)!;

    expect(posts.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'title', type: 'text' }),
        expect.objectContaining({ name: 'meta', type: 'group' }),
      ]),
    );
    expect(tabLabels(posts.fields)).toEqual([]);
  });

  it('POST /api/plugin-seo/generate-title generates a title for unsaved pages', async () => {
    const body = { collectionSlug: pagesSlug, doc: { title: 'Unsaved page' } };

    const response = await booted.restClient.post(generateTitlePath, body, { headers });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: `${pagesSlug}: Unsaved page` });
  });

  it('POST /api/plugin-seo/generate-title generates a title for an existing page', async () => {
    const page = await booted.restClient.post<{ doc: { id: number | string } }>(
      `/api/${pagesSlug}`,
      { title: 'Saved page' },
      { headers },
    );

    expect(page.status).toBe(201);

    const response = await booted.restClient.post(
      generateTitlePath,
      {
        collectionSlug: pagesSlug,
        id: page.body.doc.id,
        doc: { id: page.body.doc.id, title: 'Edited page' },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: `${pagesSlug}: Edited page` });
  });

  it('POST /api/plugin-seo/generate-title rejects an unlisted collection', async () => {
    const body = { collectionSlug: draftsSlug, doc: { title: 'Unlisted draft' } };

    const response = await booted.restClient.post(generateTitlePath, body, { headers });

    expect(response.status).toBe(403);
    expect(generationRequests).toEqual([]);
  });

  it('POST /api/plugin-seo/generate-title rejects mismatched document IDs', async () => {
    const body = {
      collectionSlug: pagesSlug,
      id: 1,
      doc: { id: 2, title: 'Mismatched page' },
    };

    const response = await booted.restClient.post(generateTitlePath, body, { headers });

    expect(response.status).toBe(403);
    expect(generationRequests).toEqual([]);
  });

  it('POST /api/plugin-seo/generate-title rejects a non-numeric ID without create access', async () => {
    const reader = { email: 'seo-reader@frogbot.local', password: credentials.password };

    await booted.restClient.post(`/api/${usersSlug}`, reader);

    const login = await booted.restClient.post<{ token: string }>(
      `/api/${usersSlug}/login`,
      reader,
    );

    const response = await booted.restClient.post(
      generateTitlePath,
      { collectionSlug: postsSlug, id: 'not-a-number', doc: { title: 'Invalid ID' } },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(response.status).toBe(403);
    expect(generationRequests).toEqual([]);
  });

  it('POST /api/plugin-seo/generate-title rejects a user without create access', async () => {
    const reader = { email: 'seo-reader@frogbot.local', password: credentials.password };

    await booted.restClient.post(`/api/${usersSlug}`, reader);

    const login = await booted.restClient.post<{ token: string }>(
      `/api/${usersSlug}/login`,
      reader,
    );

    const response = await booted.restClient.post(
      generateTitlePath,
      { collectionSlug: postsSlug, doc: { title: 'Unauthorized post' } },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(response.status).toBe(403);
    expect(generationRequests).toEqual([]);
  });

  it('POST /api/plugin-seo/generate-title rejects an unauthenticated request', async () => {
    const body = { collectionSlug: pagesSlug, doc: { title: 'Anonymous page' } };

    const response = await booted.restClient.post(generateTitlePath, body);

    expect(response.status).toBe(401);
    expect(generationRequests).toEqual([]);
  });

  it('passes req.frogbot and the signed-in user to the generation callback', async () => {
    const body = { collectionSlug: pagesSlug, doc: { title: 'Callback request' } };

    const response = await booted.restClient.post(generateTitlePath, body, { headers });

    expect(response.status).toBe(200);
    expect(generationRequests).toEqual([{ hasFrogBot: true, userEmail: credentials.email }]);
  });
});
