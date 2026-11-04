import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import type { StubEmbeddingModel } from '../../__helpers/shared/StubEmbeddingModel.js';
import { startStubEmbeddingModel } from '../../__helpers/shared/StubEmbeddingModel.js';
import type { Article, Chunk, Guide, Post } from './frogbot-types.js';
import {
  articlesSlug,
  chunksSlug,
  dimensions,
  embedderModel,
  guidesSlug,
  modelPort,
  notesSlug,
  pagesSlug,
  postsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const password = 'frogbot-test-password';

describe('embed on save', () => {
  let booted: BootedFrogBot;
  let model: StubEmbeddingModel;

  beforeAll(async () => {
    model = await startStubEmbeddingModel({ dimensions, port: modelPort });
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted?.shutdown();
    await model?.close();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    model.reset();
  });

  const inputs = () => model.requests.map(({ input }) => input.join(''));

  function createPost(data: Partial<Post>): Promise<Post> {
    return booted.frogbot.create({ collection: postsSlug, data, overrideAccess: true });
  }

  function updatePost(id: Post['id'], data: Partial<Post>): Promise<Post> {
    return booted.frogbot.update({ collection: postsSlug, id, data, overrideAccess: true });
  }

  function findPost(id: Post['id']): Promise<Post> {
    return booted.frogbot.findByID({ collection: postsSlug, id, overrideAccess: true });
  }

  function createArticle(data: Partial<Article>, draft?: boolean): Promise<Article> {
    return booted.frogbot.create({ collection: articlesSlug, data, draft, overrideAccess: true });
  }

  function updateArticle(id: Article['id'], data: Partial<Article>, draft?: boolean) {
    return booted.frogbot.update({
      collection: articlesSlug,
      id,
      data,
      draft,
      overrideAccess: true,
    });
  }

  it('embeds once on create, with the configured model', async () => {
    const post = await createPost({ title: 'Frogs', body: 'They jump.' });

    expect(model.requests).toEqual([{ model: embedderModel, input: ['Frogs\n\nThey jump.'] }]);
    expect((await findPost(post.id)).embedding).toEqual(model.vectorFor('Frogs\n\nThey jump.'));
  });

  it('makes no call when a partial update leaves the text alone', async () => {
    const post = await createPost({ title: 'Frogs', body: 'They jump.' });

    model.reset();

    const updated = await updatePost(post.id, { views: 3 });

    expect(model.requests).toEqual([]);
    expect(updated.embedding).toEqual(model.vectorFor('Frogs\n\nThey jump.'));
  });

  it('re-embeds the merged text when the title changes', async () => {
    const post = await createPost({ title: 'Frogs', body: 'They jump.' });

    model.reset();

    const updated = await updatePost(post.id, { title: 'Toads' });

    expect(inputs()).toEqual(['Toads\n\nThey jump.']);
    expect(updated.embedding).toEqual(model.vectorFor('Toads\n\nThey jump.'));
  });

  it('stores null when the text is cleared', async () => {
    const post = await createPost({ title: 'Frogs' });

    model.reset();

    const updated = await updatePost(post.id, { title: '' });

    expect(model.requests).toEqual([]);
    expect(updated.embedding).toBeNull();
  });

  it('fills a vector set to null on the next save', async () => {
    const post = await createPost({ title: 'Frogs' });

    model.reset();

    const cleared = await updatePost(post.id, { embedding: null });

    expect(cleared.embedding).toBeNull();
    expect(model.requests).toEqual([]);

    const filled = await updatePost(post.id, { views: 1 });

    expect(inputs()).toEqual(['Frogs']);
    expect(filled.embedding).toEqual(model.vectorFor('Frogs'));
  });

  it('keeps a vector the caller sends', async () => {
    const post = await createPost({ title: 'Frogs', embedding: [1, 2, 3] });

    expect(model.requests).toEqual([]);
    expect(post.embedding).toEqual([1, 2, 3]);
  });

  it('fails the save when the model returns the wrong size', async () => {
    model.respond({ dimensions: dimensions + 1 });

    await expect(createPost({ title: 'Frogs' })).rejects.toThrow('The following field is invalid');

    expect(model.requests).toHaveLength(1);
    expect((await booted.frogbot.count({ collection: postsSlug })).totalDocs).toBe(0);
  });

  it('fails the save when the embedding call fails', async () => {
    const post = await createPost({ title: 'Frogs' });

    model.respond({ error: { status: 400, body: { error: { message: 'provider down' } } } });

    await expect(updatePost(post.id, { title: 'Toads' })).rejects.toThrow('provider down');

    const stored = await findPost(post.id);

    expect(stored.title).toBe('Frogs');
    expect(stored.embedding).toEqual(model.vectorFor('Frogs'));
  });

  it('stores one vector per locale from that locale text', async () => {
    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Hello' },
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { title: 'Hola' },
      locale: 'es',
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['Hello', 'Hola']);

    const all = (await booted.frogbot.findByID({
      collection: pagesSlug,
      id: page.id,
      locale: 'all',
      overrideAccess: true,
    })) as unknown as { embedding: Record<string, number[]> };

    expect(all.embedding).toEqual({ en: model.vectorFor('Hello'), es: model.vectorFor('Hola') });
  });

  it("refuses a locale 'all' write", async () => {
    const page = await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Hello' },
      locale: 'en',
      overrideAccess: true,
    });

    await expect(
      booted.frogbot.update({
        collection: pagesSlug,
        id: page.id,
        data: { title: { en: 'Hi', es: 'Hola' } } as never,
        locale: 'all',
        overrideAccess: true,
      }),
    ).rejects.toThrow('The following field is invalid: embedding');
  });

  it('skips drafts and embeds the published text on publish', async () => {
    const article = await booted.frogbot.create({
      collection: articlesSlug,
      data: { title: 'First', _status: 'published' },
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: articlesSlug,
      id: article.id,
      data: { title: 'Second' },
      draft: true,
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['First']);

    const published = await booted.frogbot.update({
      collection: articlesSlug,
      id: article.id,
      data: { _status: 'published' },
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['First', 'Second']);
    expect(published.embedding).toEqual(model.vectorFor('Second'));
  });

  it('refuses an anonymous REST save with embed access denied, and embeds a signed-in one', async () => {
    const anonymous = await booted.restClient.post(`/api/${postsSlug}`, { title: 'Frogs' });

    expect(anonymous.status).toBe(403);
    expect(JSON.stringify(anonymous.body)).toContain('Access denied for AI embed');
    expect(model.requests).toEqual([]);

    await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'editor@frogbot.local', password },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>(`/api/${usersSlug}/login`, {
      email: 'editor@frogbot.local',
      password,
    });

    const signedIn = await booted.restClient.post<{ doc: Post }>(
      `/api/${postsSlug}`,
      { title: 'Frogs' },
      { headers: { Authorization: `JWT ${login.body.token}` } },
    );

    expect(signedIn.status).toBe(201);
    expect(signedIn.body.doc.embedding).toEqual(model.vectorFor('Frogs'));
  });

  it('finds a record saved through the hook with a query vector from the same model', async () => {
    const frogs = await createPost({ title: 'Frogs', body: 'They jump.' });

    const stars = await createPost({ title: 'Stars', body: 'They shine.' });

    const result = await booted.frogbot.search({
      collection: postsSlug,
      index: 'content',
      query: { vector: model.vectorFor('Frogs\n\nThey jump.') },
      overrideAccess: true,
    });

    expect(result.hits.map(({ doc }) => doc.id)).toEqual([frogs.id, stars.id]);
    expect(result.hits[0]?.score).toBeCloseTo(1, 5);
  });

  it('embeds a draft edit on publish even when the publish resends the draft vector', async () => {
    const article = await createArticle({ title: 'First', _status: 'published' });

    const { title, embedding } = await updateArticle(article.id, { title: 'Second' }, true);

    expect(embedding).toEqual(model.vectorFor('First'));

    const published = await updateArticle(article.id, { title, embedding, _status: 'published' });

    expect(inputs()).toEqual(['First', 'Second']);
    expect(published.embedding).toEqual(model.vectorFor('Second'));
  });

  it('makes no call when a publish leaves the published text alone', async () => {
    const article = await createArticle({ title: 'First', _status: 'published' });

    await updateArticle(article.id, { title: 'Second' }, true);
    await updateArticle(article.id, { title: 'First' }, true);
    await updateArticle(article.id, { _status: 'published' });
    await updateArticle(article.id, { _status: 'published' });

    expect(inputs()).toEqual(['First']);
  });

  it('embeds the first publish of a record created as a draft', async () => {
    const article = await createArticle({ title: 'First' }, true);

    await updateArticle(article.id, { title: 'Second' }, true);

    expect(model.requests).toEqual([]);

    const published = await updateArticle(article.id, { _status: 'published' });

    expect(inputs()).toEqual(['Second']);
    expect(published.embedding).toEqual(model.vectorFor('Second'));
  });

  it('makes no call on autosave', async () => {
    const guide = await booted.frogbot.create({
      collection: guidesSlug,
      data: { title: 'First', _status: 'published' },
      overrideAccess: true,
    });

    for (const title of ['Second', 'Third']) {
      await booted.frogbot.update({
        collection: guidesSlug,
        id: guide.id,
        data: { title },
        draft: true,
        autosave: true,
        overrideAccess: true,
      });
    }

    expect(inputs()).toEqual(['First']);
  });

  it('embeds text changed while unpublished when the record is published again', async () => {
    const article = await createArticle({ title: 'First', _status: 'published' });

    await updateArticle(article.id, { title: 'Second', _status: 'draft' });

    expect(inputs()).toEqual(['First']);

    const republished = await updateArticle(article.id, { _status: 'published' });

    expect(republished.embedding).toEqual(model.vectorFor('Second'));
  });

  it('leaves the published record alone when the publish embed fails', async () => {
    const article = await createArticle({ title: 'First', _status: 'published' });

    await updateArticle(article.id, { title: 'Second' }, true);

    model.respond({ error: { status: 400, body: { error: { message: 'provider down' } } } });

    await expect(updateArticle(article.id, { _status: 'published' })).rejects.toThrow(
      'provider down',
    );

    const stored = await booted.frogbot.findByID({
      collection: articlesSlug,
      id: article.id,
      draft: false,
      overrideAccess: true,
    });

    expect(stored).toMatchObject({ title: 'First', _status: 'published' });
    expect(stored.embedding).toEqual(model.vectorFor('First'));
  });

  it('embeds a locale published from a draft without the fallback locale text', async () => {
    const guide = await booted.frogbot.create({
      collection: guidesSlug,
      data: { title: 'Hello', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    });

    await booted.frogbot.update({
      collection: guidesSlug,
      id: guide.id,
      data: { title: 'Hello' },
      draft: true,
      locale: 'es',
      overrideAccess: true,
    });

    const published = (await booted.frogbot.update({
      collection: guidesSlug,
      id: guide.id,
      data: { _status: 'published' },
      locale: 'es',
      fallbackLocale: 'none',
      depth: 2,
      context: { reportRequest: true },
      overrideAccess: true,
    })) as Guide & { request: unknown };

    expect(inputs()).toEqual(['Hello', 'Hello']);
    expect(published.request).toEqual({ depth: 2, fallbackLocale: false });

    const all = (await booted.frogbot.findByID({
      collection: guidesSlug,
      id: guide.id,
      locale: 'all',
      overrideAccess: true,
    })) as unknown as { embedding: Record<string, number[]> };

    expect(all.embedding).toEqual({ en: model.vectorFor('Hello'), es: model.vectorFor('Hello') });
  });

  it('applies the change rule on a collection with versions but no drafts', async () => {
    const note = await booted.frogbot.create({
      collection: notesSlug,
      data: { title: 'First' },
      overrideAccess: true,
    });

    for (const title of ['First', 'Second']) {
      await booted.frogbot.update({
        collection: notesSlug,
        id: note.id,
        data: { title },
        overrideAccess: true,
      });
    }

    expect(inputs()).toEqual(['First', 'Second']);
  });

  it('merges the stored text on a select-limited update', async () => {
    const post = await createPost({ title: 'Frogs', body: 'They jump.' });

    model.reset();

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { views: 2 },
      select: { views: true },
      overrideAccess: true,
    });

    expect(model.requests).toEqual([]);

    await booted.frogbot.update({
      collection: postsSlug,
      id: post.id,
      data: { title: 'Toads' },
      select: { title: true },
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['Toads\n\nThey jump.']);
  });

  it('embeds only the records whose text a bulk update changes', async () => {
    await createPost({ title: 'A', body: 'x' });
    await createPost({ title: 'B', body: 'y' });

    model.reset();

    await booted.frogbot.update({
      collection: postsSlug,
      where: { title: { exists: true } },
      data: { views: 9 },
      overrideAccess: true,
    });

    expect(model.requests).toEqual([]);

    await booted.frogbot.update({
      collection: postsSlug,
      where: { title: { equals: 'A' } },
      data: { body: 'z' },
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['A\n\nz']);
  });

  it('follows a Local API save that checks access', async () => {
    await expect(
      booted.frogbot.create({ collection: postsSlug, data: { title: 'A' }, overrideAccess: false }),
    ).rejects.toThrow('Access denied for AI embed');

    expect((await booted.frogbot.count({ collection: postsSlug })).totalDocs).toBe(0);

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'local@frogbot.local', password },
      overrideAccess: true,
    });

    const post = await booted.frogbot.create({
      collection: postsSlug,
      data: { title: 'A' },
      overrideAccess: false,
      user,
    });

    expect(post.embedding).toEqual(model.vectorFor('A'));
  });

  it('embeds each array row from its own text, and only rows that changed', async () => {
    const chunk = await booted.frogbot.create({
      collection: chunksSlug,
      data: { parts: [{ text: 'A' }, { text: 'B' }] },
      overrideAccess: true,
    });

    const [first, second] = chunk.parts ?? [];

    model.reset();

    const updated: Chunk = await booted.frogbot.update({
      collection: chunksSlug,
      id: chunk.id,
      data: { parts: [{ id: first?.id, text: 'A' }, { ...second, text: 'C' }, { text: 'D' }] },
      overrideAccess: true,
    });

    expect(inputs()).toEqual(['C', 'D']);
    expect(updated.parts?.map(({ embedding }) => embedding)).toEqual(
      ['A', 'C', 'D'].map((text) => model.vectorFor(text)),
    );
  });
});
