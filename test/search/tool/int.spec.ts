import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ToolCtx } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import type { StubEmbeddingModel } from '../../__helpers/shared/StubEmbeddingModel.js';
import { startStubEmbeddingModel } from '../../__helpers/shared/StubEmbeddingModel.js';
import { articlesSlug, noNotesTenant, notesSlug, usersSlug } from '../sqlite/shared.js';
import { articleBodies, articleMeaning, articleWords, noteWords, ratedArticles } from './config.js';
import type { SearchArticle, SearchUser } from './frogbot-types.js';
import { agentSlug, databasePath, dimensions, embedderModel, modelPort } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('searchTool', () => {
  let booted: BootedFrogBot;
  let model: StubEmbeddingModel;
  let tenantA: SearchUser;

  beforeAll(async () => {
    model = await startStubEmbeddingModel({ dimensions, port: modelPort });
    booted = await bootFrogBot(dirname, 'search-tool');
  });

  afterAll(async () => {
    await booted?.shutdown();
    await model?.close();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    model.reset();
    tenantA = await createUser('a@frogbot.test', 'a');
  });

  function createUser(email: string, tenant: string): Promise<SearchUser> {
    return booted.frogbot.create({
      collection: usersSlug,
      data: { email, password: 'frogbot-test-password', tenant },
      overrideAccess: true,
    });
  }

  function createArticle(data: Partial<SearchArticle>): Promise<SearchArticle> {
    return booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', tenant: 'a', ...data },
      overrideAccess: true,
    });
  }

  async function ctx(user: SearchUser | null, overrideAccess = false): Promise<ToolCtx> {
    const req = await booted.frogbot.createRequest(
      user ? { user: { ...user, collection: usersSlug } } : {},
    );

    return {
      req,
      frogbot: booted.frogbot,
      agent: { slug: agentSlug, runId: 'run-1' },
      overrideAccess,
    };
  }

  it('boots an agent with search tools on different indexes', () => {
    expect(booted.frogbot.agents[agentSlug].config.tools?.map(({ slug }) => slug)).toEqual([
      'search_search-articles_content',
      'search_articles_meaning',
      'search_search-notes_content',
    ]);
  });

  it('searches by words and returns ranked hits with the selected fields', async () => {
    await createArticle({ title: 'Frog care', body: 'Ponds' });
    await createArticle({ title: 'Frog frog pond', body: 'Frogs and frogs' });
    await createArticle({ title: 'Cats', body: 'Whiskers' });

    const { hits } = await articleWords.execute({ query: 'frog' }, await ctx(tenantA));
    const expected = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'frog' },
      overrideAccess: true,
    });

    expect(hits.map(({ id }) => id)).toEqual(expected.hits.map(({ doc }) => doc.id));
    expect(hits).toHaveLength(2);

    for (const hit of hits) {
      expect(Object.keys(hit).sort()).toEqual(['id', 'score', 'title']);
      expect(hit.score).toBeTypeOf('number');
    }
  });

  it('returns no hits when nothing matches', async () => {
    await createArticle({ title: 'Frog care' });

    expect(await articleWords.execute({ query: 'zebra' }, await ctx(tenantA))).toEqual({
      hits: [],
    });
  });

  it('embeds the query once and searches hybrid with a model', async () => {
    const match = await createArticle({ title: 'Lily pads', embedding: model.vectorFor('frogs') });

    await createArticle({ title: 'Cats', embedding: [-1, 0, 0] });

    const { hits } = await articleMeaning.execute({ query: 'frogs' }, await ctx(tenantA));

    expect(model.requests).toEqual([{ model: embedderModel, input: ['frogs'] }]);
    expect(hits[0]).toMatchObject({ id: match.id, title: 'Lily pads' });
  });

  it('fails clearly when the model returns the wrong vector size', async () => {
    await createArticle({ title: 'Lily pads', embedding: [1, 0, 0] });
    model.respond({ dimensions: 2 });

    await expect(articleMeaning.execute({ query: 'frogs' }, await ctx(tenantA))).rejects.toThrow(
      "Search index 'content' in collection 'search-articles' requires a vector of 3 finite numbers.",
    );
  });

  it('refuses a user who may not read the collection instead of returning no hits', async () => {
    const reader = await createUser('nope@frogbot.test', noNotesTenant);

    await booted.frogbot.create({
      collection: notesSlug,
      data: { id: 'note-1', title: 'Frog note', tenant: noNotesTenant },
      overrideAccess: true,
    });

    await expect(noteWords.execute({ query: 'frog' }, await ctx(reader))).rejects.toMatchObject({
      name: 'Forbidden',
      status: 403,
    });
  });

  it("leaves out hits from records the user can't read", async () => {
    const own = await createArticle({ title: 'Frog care', tenant: 'a' });

    await createArticle({ title: 'Frog care', tenant: 'b' });

    const { hits } = await articleWords.execute({ query: 'frog' }, await ctx(tenantA));

    expect(hits.map(({ id }) => id)).toEqual([own.id]);
  });

  it('titles each source by useAsTitle when select leaves it out', async () => {
    const article = await createArticle({ title: 'Frog care', body: 'Frogs need ponds' });
    const runCtx = await ctx(tenantA);
    const result = await articleBodies.execute({ query: 'frogs' }, runCtx);

    expect(Object.keys(result.hits[0]).sort()).toEqual(['body', 'id', 'score']);
    expect(await articleBodies.sources!(result, runCtx)).toEqual([
      { collection: articlesSlug, id: article.id, title: 'Frog care' },
    ]);
  });

  it("gives no source for a record the run's user can't read", async () => {
    const other = await createArticle({ title: 'Frog care', body: 'Ponds', tenant: 'b' });
    const hits = [{ id: other.id, score: 1, body: 'Ponds' }];

    expect(await articleBodies.sources!({ hits }, await ctx(tenantA))).toEqual([]);
    expect(await articleBodies.sources!({ hits }, await ctx(tenantA, true))).toEqual([
      { collection: articlesSlug, id: other.id, title: 'Frog care' },
    ]);
  });

  it("follows the run's overrideAccess when there is no user", async () => {
    await createArticle({ title: 'Lily pads', embedding: model.vectorFor('frogs') });

    await expect(articleMeaning.execute({ query: 'frogs' }, await ctx(null))).rejects.toThrow(
      'Access denied for AI embed',
    );

    const { hits } = await articleMeaning.execute({ query: 'frogs' }, await ctx(null, true));

    expect(hits).toHaveLength(1);
  });

  it("narrows hits with the developer's where and shows no field outside select", async () => {
    const rated = await createArticle({ title: 'Frog care', body: 'Secret notes', rating: 5 });

    await createArticle({ title: 'Frog tips', rating: 1 });

    const { hits } = await ratedArticles.execute({ query: 'frog' }, await ctx(tenantA));

    expect(hits).toEqual([{ id: rated.id, score: expect.any(Number), title: 'Frog care' }]);
  });

  it('gives the model no way to send a filter', () => {
    expect(
      ratedArticles.inputSchema.safeParse({ query: 'frog', where: { rating: { less_than: 2 } } })
        .success,
    ).toBe(false);
  });
});
