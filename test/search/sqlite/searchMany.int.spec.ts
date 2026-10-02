import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import type { FrogBotRequest, SearchManyOptions, SearchQuery } from 'frogbot';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createFrogBotSDK } from '../../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  articlesSlug,
  databasePath,
  noNotesTenant,
  notesSlug,
  pagesSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const password = 'search-many-password';

type SearchManyBody = { results: unknown[] };

type ErrorBody = { errors: { message: string }[] };

describe('SQLite searchMany', () => {
  let booted: BootedFrogBot;
  let transactionID: number | string | undefined;

  const entries = (...collections: string[]) =>
    collections.map((collection) => ({ collection, index: 'content' }));

  const searchEach = async (
    collections: string[],
    options: Omit<SearchManyOptions, 'collections'>,
  ) => {
    const results = [];

    for (const collection of collections) {
      const result = await booted.frogbot.search({ ...options, collection, index: 'content' });

      results.push({ collection, ...result });
    }

    return results;
  };

  const seed = async () => {
    const articles = [
      { title: 'Garden tools', body: 'Rakes for the garden', tenant: 'a', embedding: [1, 0, 0] },
      { title: 'Garden gloves', body: 'Thorn proof', tenant: 'b', embedding: [0.8, 0.6, 0] },
      { title: 'Garden hoses', body: 'Water the garden', tenant: 'a', embedding: [0, 1, 0] },
      { title: 'Kitchen knives', body: 'Sharp', tenant: 'a', embedding: [0, 0, 1] },
    ];

    const pages = [
      { title: 'Garden plan', summary: 'Beds and paths', tenant: 'a', embedding: [1, 0] },
      { title: 'Garden party', summary: 'A garden party', tenant: 'a', embedding: [0.6, 0.8] },
      { title: 'Garden tours', summary: 'Visit', tenant: 'a', embedding: [0, 1] },
      { title: 'Office hours', summary: 'Open', tenant: 'a', embedding: [-1, 0] },
    ];

    const notes = [
      { id: 'note-plan', title: 'Garden planning', tenant: 'a', embedding: [0.9, 0.1] },
      { id: 'note-seeds', title: 'Garden seeds garden', tenant: 'a', embedding: [0.2, 0.9] },
      { id: 'note-soil', title: 'Garden soil', tenant: 'a', embedding: [-0.5, 0.5] },
      { id: 'note-recipes', title: 'Recipes', tenant: 'a', embedding: [1, 1] },
    ];

    for (const data of articles) {
      await booted.frogbot.create({
        collection: articlesSlug,
        data: { ...data, _status: 'published' },
        overrideAccess: true,
      });
    }

    for (const data of pages) {
      await booted.frogbot.create({ collection: pagesSlug, data, overrideAccess: true });
    }

    for (const data of notes) {
      await booted.frogbot.create({ collection: notesSlug, data, overrideAccess: true });
    }
  };

  const createUser = async (tenant: string) => {
    const email = `${tenant}@search-many.test`;

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email, password, tenant },
      overrideAccess: true,
    });

    const req: FrogBotRequest = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug } as never,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email,
      password,
    });

    return { req, headers: { authorization: `JWT ${login.body.token}` } };
  };

  const openTransaction = async () => {
    const db = booted.payload.db as unknown as SQLiteAdapter;
    const req = await booted.frogbot.createRequest();

    transactionID = (await db.beginTransaction()) ?? undefined;
    req.transactionID = transactionID;

    return { db, req };
  };

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-search-many');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterEach(async () => {
    await booted.payload.db.rollbackTransaction(transactionID ?? '');

    transactionID = undefined;
  });

  it.each<{ mode: string; query: SearchQuery; collections: string[] }>([
    {
      mode: 'lexical',
      query: { text: 'garden' },
      collections: [notesSlug, articlesSlug, pagesSlug],
    },
    { mode: 'vector', query: { vector: [1, 0] }, collections: [notesSlug, pagesSlug] },
    {
      mode: 'hybrid',
      query: { text: 'garden', vector: [1, 0] },
      collections: [pagesSlug, notesSlug],
    },
  ])(
    'searchMany returns $mode lists in request order that equal search() on each collection',
    async ({ collections, mode, query }) => {
      await seed();

      const result = await booted.frogbot.searchMany({
        collections: entries(...collections),
        query,
        limit: 2,
        overrideAccess: true,
      });

      const expected = await searchEach(collections, { query, limit: 2, overrideAccess: true });

      expect(
        result.results.map((list) => ({
          collection: list.collection,
          mode: list.mode,
          hits: list.hits.length,
        })),
      ).toEqual(collections.map((collection) => ({ collection, mode, hits: 2 })));
      expect(result.results).toEqual(expected);
    },
  );

  it('searchMany keeps other lists unchanged when one collection has no matches', async () => {
    await seed();

    const result = await booted.frogbot.searchMany({
      collections: entries(articlesSlug, pagesSlug),
      query: { text: 'tools' },
      overrideAccess: true,
    });

    const expected = await searchEach([articlesSlug, pagesSlug], {
      query: { text: 'tools' },
      overrideAccess: true,
    });

    expect(result.results).toEqual(expected);
    expect(result.results.map(({ hits }) => hits.length)).toEqual([1, 0]);
  });

  it('searchMany applies per-entry where and select only to their own collection', async () => {
    await seed();

    const result = await booted.frogbot.searchMany({
      collections: [
        {
          collection: articlesSlug,
          index: 'content',
          where: { tenant: { equals: 'b' } },
          select: { title: true },
        },
        { collection: pagesSlug, index: 'content' },
      ],
      query: { text: 'garden' },
      overrideAccess: true,
    });

    const [articles, pages] = result.results;

    expect(articles.hits.map(({ doc }) => doc)).toEqual([
      { id: expect.any(Number), title: 'Garden gloves' },
    ]);
    expect(pages.hits).toHaveLength(3);
    expect(pages.hits[0].doc).toMatchObject({ summary: expect.any(String), tenant: 'a' });
  });

  it('searchMany applies the shared draft and locale to every collection', async () => {
    await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'Orchard draft', _status: 'draft' },
      draft: true,
      overrideAccess: true,
    });

    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Apple trees' },
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { title: 'Huerto orchard' },
      locale: 'es',
      overrideAccess: true,
    });

    const options = { query: { text: 'orchard' }, draft: true, locale: 'es', overrideAccess: true };

    const result = await booted.frogbot.searchMany({
      ...options,
      collections: entries(articlesSlug, pagesSlug),
    });

    const expected = await searchEach([articlesSlug, pagesSlug], options);

    expect(result.results).toEqual(expected);
    expect(result.results.map(({ hits }) => hits.map(({ doc }) => doc.title))).toEqual([
      ['Orchard draft'],
      ['Huerto orchard'],
    ]);
  });

  it('searchMany ranks only the documents the user can read in each collection', async () => {
    await seed();

    const { req } = await createUser('a');

    const result = await booted.frogbot.searchMany({
      collections: entries(articlesSlug, pagesSlug),
      query: { text: 'garden' },
      req,
    });

    const single = await searchEach([articlesSlug, pagesSlug], { query: { text: 'garden' }, req });

    const unrestricted = await searchEach([articlesSlug, pagesSlug], {
      query: { text: 'garden' },
      overrideAccess: true,
    });

    const [articles, pages] = result.results;

    expect(result.results).toEqual(single);
    expect(articles.hits.map(({ doc }) => doc.tenant)).toEqual(['a', 'a']);
    expect(unrestricted[0].hits.map(({ doc }) => doc.tenant)).toContain('b');
    expect(pages).toEqual(unrestricted[1]);
  });

  it('searchMany fails with Forbidden when the user cannot read a later collection', async () => {
    await seed();

    const { req } = await createUser(noNotesTenant);

    const options = { query: { text: 'garden' }, req };

    await expect(
      booted.frogbot.searchMany({ ...options, collections: entries(articlesSlug, notesSlug) }),
    ).rejects.toMatchObject({ name: 'Forbidden', status: 403 });
    await expect(
      booted.frogbot.search({ ...options, collection: notesSlug, index: 'content' }),
    ).rejects.toMatchObject({ name: 'Forbidden', status: 403 });
  });

  it('searchMany with overrideAccess skips access for every collection', async () => {
    await seed();

    const { req } = await createUser(noNotesTenant);

    const result = await booted.frogbot.searchMany({
      collections: entries(articlesSlug, notesSlug),
      query: { text: 'garden' },
      overrideAccess: true,
      req,
    });

    const expected = await searchEach([articlesSlug, notesSlug], {
      query: { text: 'garden' },
      overrideAccess: true,
    });

    expect(result.results).toEqual(expected);
    expect(result.results.map(({ hits }) => hits.length)).toEqual([3, 3]);
  });

  it.each<{ name: string; options: SearchManyOptions; message: string }>([
    {
      name: 'an empty collections list',
      options: { collections: [], query: { text: 'garden' }, overrideAccess: true },
      message: 'Search requires a non-empty collections list.',
    },
    {
      name: 'a repeated collection',
      options: {
        collections: entries(pagesSlug, notesSlug, pagesSlug),
        query: { text: 'garden' },
        overrideAccess: true,
      },
      message: `Search lists collection '${pagesSlug}' more than once.`,
    },
    {
      name: 'an entry with its own query',
      options: {
        collections: [
          { collection: pagesSlug, index: 'content' },
          { collection: notesSlug, index: 'content', query: { text: 'soil' } } as never,
        ],
        query: { text: 'garden' },
        overrideAccess: true,
      },
      message: `Search index 'content' in collection '${notesSlug}' does not accept a per-collection 'query' option.`,
    },
    {
      name: 'a vector that only fits the first collection',
      options: {
        collections: entries(articlesSlug, pagesSlug),
        query: { vector: [1, 0, 0] },
        overrideAccess: true,
      },
      message: `Search index 'content' in collection '${pagesSlug}' requires a vector of 2 finite numbers.`,
    },
    {
      name: 'an index without the requested mode',
      options: {
        collections: [
          { collection: pagesSlug, index: 'content' },
          { collection: articlesSlug, index: 'distance' },
        ],
        query: { text: 'garden' },
        overrideAccess: true,
      },
      message: `Search index 'distance' in collection '${articlesSlug}' does not configure lexical search.`,
    },
    {
      name: 'an invalid limit',
      options: {
        collections: entries(pagesSlug, notesSlug),
        query: { text: 'garden' },
        limit: 0,
        overrideAccess: true,
      },
      message: `Search index 'content' in collection '${pagesSlug}' requires a positive integer limit.`,
    },
  ])('searchMany rejects $name with SearchValidationError', async ({ message, options }) => {
    await expect(booted.frogbot.searchMany(options)).rejects.toMatchObject({
      name: 'SearchValidationError',
      status: 400,
      message,
    });
  });

  it('POST /api/frogbot/search returns the Local API result for the same user', async () => {
    await seed();

    const { headers, req } = await createUser('a');

    const options = {
      collections: entries(articlesSlug, pagesSlug, notesSlug),
      query: { text: 'garden' },
      limit: 2,
    };

    const response = await booted.restClient.post<SearchManyBody>('/api/frogbot/search', options, {
      headers,
    });

    const local = await booted.frogbot.searchMany({ ...options, req });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(local);
  });

  it.each<{ name: string; body: Record<string, unknown>; message: string }>([
    {
      name: 'an unknown top-level key',
      body: { collection: pagesSlug, collections: entries(pagesSlug), query: { text: 'garden' } },
      message: "Search does not support the 'collection' option.",
    },
    {
      name: 'a top-level index',
      body: { index: 'content', collections: entries(pagesSlug), query: { text: 'garden' } },
      message: "Search does not support the 'index' option.",
    },
    {
      name: 'a body without collections',
      body: { query: { text: 'garden' } },
      message: 'Search requires a non-empty collections list.',
    },
    {
      name: 'a non-array collections',
      body: { collections: { collection: pagesSlug, index: 'content' }, query: { text: 'garden' } },
      message: 'Search requires a non-empty collections list.',
    },
    {
      name: 'an entry with its own query',
      body: {
        collections: [{ collection: pagesSlug, index: 'content', query: { text: 'garden' } }],
        query: { text: 'garden' },
      },
      message: `Search index 'content' in collection '${pagesSlug}' does not accept a per-collection 'query' option.`,
    },
    {
      name: 'a repeated collection',
      body: { collections: entries(notesSlug, notesSlug), query: { text: 'garden' } },
      message: `Search lists collection '${notesSlug}' more than once.`,
    },
    {
      name: 'a collection name inherited from Object',
      body: { collections: entries(pagesSlug, 'constructor'), query: { text: 'garden' } },
      message: "Search index 'content' in collection 'constructor' is not configured.",
    },
    {
      name: 'an invalid limit',
      body: { collections: entries(pagesSlug, notesSlug), query: { text: 'garden' }, limit: 0 },
      message: `Search index 'content' in collection '${pagesSlug}' requires a positive integer limit.`,
    },
    {
      name: 'every locale',
      body: { collections: entries(pagesSlug), query: { text: 'garden' }, locale: 'all' },
      message: `Search index 'content' in collection '${pagesSlug}' requires one locale per ranked result.`,
    },
  ])('POST /api/frogbot/search rejects $name with 400', async ({ body, message }) => {
    const response = await booted.restClient.post<ErrorBody>('/api/frogbot/search', body);

    expect(response.status).toBe(400);
    expect(response.body.errors[0].message).toBe(message);
  });

  it.each<{ name: string; body: string; message: string }>([
    {
      name: 'malformed JSON',
      body: '{"collections":',
      message: 'Search requires a JSON request body.',
    },
    {
      name: 'an array body',
      body: JSON.stringify([{ collections: entries(pagesSlug), query: { text: 'garden' } }]),
      message: 'Search requires a JSON object request body.',
    },
  ])('POST /api/frogbot/search rejects $name with 400', async ({ body, message }) => {
    const response = await fetch(`${booted.baseUrl}/api/frogbot/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    const { errors } = (await response.json()) as ErrorBody;

    expect(response.status).toBe(400);
    expect(errors[0].message).toBe(message);
  });

  it('sdk.searchMany returns the Local API result for the same user', async () => {
    await seed();

    const { headers, req } = await createUser('a');

    const sdk = createFrogBotSDK({ baseURL: `${booted.baseUrl}/api`, headers });

    const options = {
      collections: entries(articlesSlug, pagesSlug),
      query: { text: 'garden' },
      limit: 2,
    };

    const result = await sdk.searchMany(options);

    const local = await booted.frogbot.searchMany({ ...options, req });

    expect(result).toEqual(local);
    expect(result.results[0].hits.map(({ doc }) => doc.tenant)).toEqual(['a', 'a']);
  });

  it('sdk.searchMany rejects with a 403 FrogBotSDKError when the user cannot read one collection', async () => {
    await seed();

    const { headers } = await createUser(noNotesTenant);

    const sdk = createFrogBotSDK({ baseURL: `${booted.baseUrl}/api`, headers });

    await expect(
      sdk.searchMany({ collections: entries(articlesSlug, notesSlug), query: { text: 'garden' } }),
    ).rejects.toMatchObject({ name: 'FrogBotSDKError', status: 403 });
  });

  it('POST /api/frogbot/search returns 403 when the user cannot read one collection', async () => {
    await seed();

    const { headers } = await createUser(noNotesTenant);

    const response = await booted.restClient.post(
      '/api/frogbot/search',
      { collections: entries(articlesSlug, notesSlug), query: { text: 'garden' } },
      { headers },
    );

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty('results');
  });

  it('searchMany inside a transaction returns the same lists as outside it', async () => {
    await seed();

    const options = {
      collections: entries(pagesSlug, notesSlug),
      query: { text: 'garden', vector: [1, 0] },
      overrideAccess: true,
    };

    const outside = await booted.frogbot.searchMany(options);

    const { req } = await openTransaction();

    const inside = await booted.frogbot.searchMany({ ...options, req });

    expect(inside).toEqual(outside);
  });

  it('searchMany reads uncommitted rows in every collection through the transaction', async () => {
    await seed();

    const { db, req } = await openTransaction();

    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Uncommitted orchard', embedding: [1, 0] },
      overrideAccess: true,
      req,
    });

    const note = await booted.frogbot.create({
      collection: notesSlug,
      data: { id: 'note-orchard', title: 'Uncommitted orchard', embedding: [1, 0] },
      overrideAccess: true,
      req,
    });

    const options = {
      collections: entries(pagesSlug, notesSlug),
      query: { text: 'orchard' },
      overrideAccess: true,
    };

    const inside = await booted.frogbot.searchMany({ ...options, req });

    await db.rollbackTransaction(transactionID!);

    const after = await booted.frogbot.searchMany(options);

    expect(inside.results.map(({ hits }) => hits.map(({ doc }) => doc.id))).toEqual([
      [page.id],
      [note.id],
    ]);
    expect(after.results.map(({ hits }) => hits)).toEqual([[], []]);
  });
});
