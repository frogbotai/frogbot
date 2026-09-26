import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { SQLiteAdapter } from '@frogbotai/db-sqlite';
import { sql } from '@frogbotai/db-sqlite';
import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { articlesSlug, databasePath, notesSlug, pagesSlug, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SQLite lexical search', () => {
  let booted: BootedFrogBot;

  const create = (data: Record<string, unknown>, options: Record<string, unknown> = {}) =>
    booted.frogbot.create({
      collection: articlesSlug,
      data: { _status: 'published', ...data },
      overrideAccess: true,
      ...options,
    } as never) as Promise<{ id: number }>;

  const searchIDs = async (text: string, options: Record<string, unknown> = {}) => {
    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text },
      overrideAccess: true,
      ...options,
    } as never);

    return result.hits.map(({ doc }) => doc.id);
  };

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'search-sqlite-lexical');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(databasePath, { force: true });
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  it('ranks matching records with FTS5 bm25 and reports the ranking method', async () => {
    const strong = await create({
      title: 'Account recovery',
      body: 'Recover your account with account recovery codes.',
    });

    const weak = await create({
      title: 'Billing',
      body: 'Account billing and account recovery for invoices, receipts, refunds and payment methods.',
    });

    await create({ title: 'Unrelated', body: 'Nothing to see.' });

    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'account recovery' },
      overrideAccess: true,
    });

    expect(result.mode).toBe('lexical');
    expect(result.ranking).toEqual({ method: 'sqlite-fts5', higherIsBetter: true, approximate: false });
    expect(result.hits.map(({ doc }) => doc.id)).toEqual([strong.id, weak.id]);
    expect(result.hits[0].score).toBeGreaterThan(result.hits[1].score);
  });

  it('matches every term by default and supports quoted phrases, or and negation', async () => {
    const both = await create({ title: 'Password reset', body: 'Reset a forgotten password.' });
    const password = await create({ title: 'Password rules', body: 'Choose a long passphrase.' });
    const reset = await create({ title: 'Factory reset', body: 'Wipe the device.' });

    expect(await searchIDs('password reset')).toEqual([both.id]);
    expect((await searchIDs('password or factory')).sort()).toEqual(
      [both.id, password.id, reset.id].sort(),
    );
    expect(await searchIDs('"factory reset"')).toEqual([reset.id]);
    expect(await searchIDs('reset -password')).toEqual([reset.id]);
    expect(await searchIDs('-password')).toEqual([]);
  });

  it('treats query syntax as plain terms', async () => {
    const created = await create({ title: 'NEAR and AND', body: 'Operators in text.' });

    expect(await searchIDs('NEAR(AND "unterminated')).toEqual([]);
    expect(await searchIDs('near and')).toEqual([created.id]);
    expect(await searchIDs('near:and')).toEqual([created.id]);
    expect(await searchIDs('***')).toEqual([]);
  });

  it('applies the english tokenizer when the index declares a language', async () => {
    const created = await create({ title: 'Running shoes', body: '' });

    const english = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'english',
      query: { text: 'run' },
      overrideAccess: true,
    });

    expect(english.hits.map(({ doc }) => doc.id)).toEqual([created.id]);
    expect(await searchIDs('run')).toEqual([]);
  });

  it('keeps the full text index in sync with updates, deletes and rollbacks', async () => {
    const created = await create({ title: 'Original heading', body: 'First body' });

    expect(await searchIDs('original')).toEqual([created.id]);

    await booted.frogbot.update({
      collection: articlesSlug,
      id: created.id,
      data: { title: 'Replacement heading', _status: 'published' },
      overrideAccess: true,
    } as never);

    expect(await searchIDs('original')).toEqual([]);
    expect(await searchIDs('replacement')).toEqual([created.id]);

    const db = booted.payload.db as unknown as SQLiteAdapter;
    const req = await booted.frogbot.createRequest();
    req.transactionID = (await db.beginTransaction()) as number;

    const pending = await create({ title: 'Uncommitted heading' }, { req });

    expect(await searchIDs('uncommitted', { req })).toEqual([pending.id]);

    await db.rollbackTransaction(req.transactionID);

    expect(await searchIDs('uncommitted')).toEqual([]);

    await booted.frogbot.delete({ collection: articlesSlug, id: created.id, overrideAccess: true });

    expect(await searchIDs('replacement')).toEqual([]);

    const indexed = await db.drizzle.all<{ total: number }>(
      sql`SELECT count(*) AS "total" FROM "frogbot_search_search_articles_content_fts"`,
    );

    expect(indexed[0].total).toBe(0);
  });

  it('ranks only records the caller can read and that match where', async () => {
    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: { email: 'tenant-a@example.com', password: 'password', tenant: 'a' },
      overrideAccess: true,
    });

    const req: FrogBotRequest = await booted.frogbot.createRequest({
      user: { ...user, collection: usersSlug } as never,
    });

    const visible = await create({ title: 'Shared keyword', tenant: 'a', rating: 5 });
    const low = await create({ title: 'Shared keyword', tenant: 'a', rating: 1 });

    await create({ title: 'Shared keyword keyword', tenant: 'b', rating: 5 });

    const result = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'keyword' },
      req,
    });

    expect(result.hits.map(({ doc }) => doc.id).sort()).toEqual([visible.id, low.id].sort());

    const filtered = await booted.frogbot.search({
      collection: articlesSlug,
      index: 'content',
      query: { text: 'keyword' },
      where: { rating: { greater_than: 3 } },
      req,
    });

    expect(filtered.hits.map(({ doc }) => doc.id)).toEqual([visible.id]);
  });

  it('follows draft and trash visibility', async () => {
    const published = await create({ title: 'Published wording' });

    await booted.frogbot.update({
      collection: articlesSlug,
      id: published.id,
      data: { title: 'Draft wording' },
      draft: true,
      overrideAccess: true,
    } as never);

    const draftOnly = await create(
      { title: 'Draft wording only', _status: 'draft' },
      { draft: true },
    );

    expect(await searchIDs('published')).toEqual([published.id]);
    expect(await searchIDs('draft')).toEqual([]);
    expect((await searchIDs('draft', { draft: true })).sort()).toEqual(
      [published.id, draftOnly.id].sort(),
    );
    expect(await searchIDs('published', { draft: true })).toEqual([]);

    const trashed = await create({ title: 'Trashed wording' });

    await booted.frogbot.update({
      collection: articlesSlug,
      id: trashed.id,
      data: { deletedAt: new Date().toISOString() },
      overrideAccess: true,
    } as never);

    expect(await searchIDs('trashed')).toEqual([]);
  });

  it('matches localized text in the requested locale and shared text in every locale', async () => {
    const page = (await booted.frogbot.create({
      collection: pagesSlug,
      data: { title: 'Hello world', summary: 'Common summary' },
      locale: 'en',
      overrideAccess: true,
    } as never)) as { id: number };

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { title: 'Hola mundo' },
      locale: 'es',
      overrideAccess: true,
    } as never);

    const pages = async (text: string, locale: string) =>
      (
        await booted.frogbot.search({
          collection: pagesSlug,
          index: 'content',
          query: { text },
          locale,
          overrideAccess: true,
        } as never)
      ).hits.map(({ doc }) => doc.id);

    expect(await pages('hola', 'es')).toEqual([page.id]);
    expect(await pages('hola', 'en')).toEqual([]);
    expect(await pages('hello', 'en')).toEqual([page.id]);
    expect(await pages('common', 'es')).toEqual([page.id]);

    await booted.frogbot.update({
      collection: pagesSlug,
      id: page.id,
      data: { summary: 'Changed summary' },
      locale: 'en',
      overrideAccess: true,
    } as never);

    expect(await pages('common', 'es')).toEqual([]);
    expect(await pages('changed', 'es')).toEqual([page.id]);

    await booted.frogbot.delete({ collection: pagesSlug, id: page.id, overrideAccess: true });

    expect(await pages('changed', 'en')).toEqual([]);
  });

  it('indexes collections with text IDs', async () => {
    await booted.frogbot.create({
      collection: notesSlug,
      data: { id: 'note-a', title: 'Garden notes' },
      overrideAccess: true,
    } as never);

    const notes = async (text: string) =>
      (
        await booted.frogbot.search({
          collection: notesSlug,
          index: 'content',
          query: { text },
          overrideAccess: true,
        })
      ).hits.map(({ doc }) => doc.id);

    expect(await notes('garden')).toEqual(['note-a']);

    await booted.frogbot.update({
      collection: notesSlug,
      id: 'note-a',
      data: { title: 'Kitchen notes' },
      overrideAccess: true,
    } as never);

    expect(await notes('garden')).toEqual([]);
    expect(await notes('kitchen')).toEqual(['note-a']);

    await booted.frogbot.delete({ collection: notesSlug, id: 'note-a', overrideAccess: true });

    expect(await notes('kitchen')).toEqual([]);
  });
});
