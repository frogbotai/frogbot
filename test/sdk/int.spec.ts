import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createFrogBotSDK,
  type FrogBotSDK,
  FrogBotSDKError,
} from '../../packages/sdk/src/index.js';
import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import type { Config } from './frogbot-types.js';
import { mediaSlug, pagesSlug, testUserEmail, testUserPassword, usersSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const credentials = { email: testUserEmail, password: testUserPassword };

describe('FrogBot SDK against a running app', () => {
  let booted: BootedFrogBot;
  let sdk: FrogBotSDK<Config>;
  let userID: number;

  const createPage = (data: {
    title: string;
    slug?: string;
    group?: { field?: string };
    summary?: string;
  }) =>
    booted.frogbot.create({
      collection: pagesSlug,
      data: { ...data, _status: 'published' },
      overrideAccess: true,
    } as never) as Promise<{ id: number }>;

  const loginHeaders = async () => {
    const { token } = await sdk.login({ collection: usersSlug, data: credentials });

    return { Authorization: `JWT ${token}` };
  };

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
    sdk = createFrogBotSDK<Config>({ baseURL: `${booted.baseUrl}/api` });
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    const user = (await booted.frogbot.create({
      collection: usersSlug,
      data: credentials,
      overrideAccess: true,
    } as never)) as { id: number };

    userID = user.id;
  });

  describe('collections', () => {
    it('find filters with where, narrows with select, and honors depth', async () => {
      await createPage({ title: 'Alpha', slug: 'alpha', group: { field: 'pond' } });
      await createPage({ title: 'Beta', slug: 'beta' });

      const result = await sdk.find({
        collection: pagesSlug,
        depth: 0,
        select: { title: true },
        where: { 'group.field': { equals: 'pond' } },
      });

      expect(result.totalDocs).toBe(1);
      expect(result.docs[0]).toEqual({ id: expect.any(Number), title: 'Alpha' });
    });

    it('find sorts and paginates', async () => {
      await createPage({ title: 'B' });
      await createPage({ title: 'A' });
      await createPage({ title: 'C' });

      const result = await sdk.find({ collection: pagesSlug, limit: 2, page: 1, sort: 'title' });

      expect(result.docs.map((doc) => doc.title)).toEqual(['A', 'B']);
      expect(result).toMatchObject({ hasNextPage: true, totalDocs: 3, totalPages: 2 });
    });

    it('findByID returns the latest draft to an authenticated user', async () => {
      const page = await createPage({ title: 'Published' });

      await booted.frogbot.update({
        collection: pagesSlug,
        data: { title: 'Draft' },
        draft: true,
        id: page.id,
        overrideAccess: true,
      } as never);

      const draft = await sdk.findByID(
        { collection: pagesSlug, draft: true, id: page.id },
        { headers: await loginHeaders() },
      );

      expect(draft.title).toBe('Draft');
    });

    it('findByID never returns draft content without authentication', async () => {
      const page = await createPage({ title: 'Published' });

      await booted.frogbot.update({
        collection: pagesSlug,
        data: { title: 'Draft' },
        draft: true,
        id: page.id,
        overrideAccess: true,
      } as never);

      const anonymous = await sdk.findByID({
        collection: pagesSlug,
        disableErrors: true,
        draft: true,
        id: page.id,
      });

      expect(anonymous?.title).not.toBe('Draft');
    });

    it('findByID with disableErrors returns null for a missing ID', async () => {
      const missing = await sdk.findByID({
        collection: pagesSlug,
        disableErrors: true,
        id: 999_999,
      });

      expect(missing).toBeNull();
    });

    it('findByID surfaces a 404 as FrogBotSDKError with the server errors', async () => {
      const error = await sdk.findByID({ collection: pagesSlug, id: 999_999 }).catch((e) => e);

      expect(error).toBeInstanceOf(FrogBotSDKError);
      expect(error.status).toBe(404);
      expect(error.errors[0].message).toEqual(expect.any(String));
    });

    it('count returns the number of matching documents', async () => {
      await createPage({ title: 'Alpha' });
      await createPage({ title: 'Alpha' });
      await createPage({ title: 'Beta' });

      const result = await sdk.count({
        collection: pagesSlug,
        where: { title: { equals: 'Alpha' } },
      });

      expect(result).toEqual({ totalDocs: 2 });
    });

    it('create saves a document that reads back', async () => {
      const created = await sdk.create({
        collection: pagesSlug,
        data: { _status: 'published', title: 'Created', slug: 'created' },
      });

      const stored = await booted.frogbot.findByID({
        collection: pagesSlug,
        id: created.id,
        overrideAccess: true,
      } as never);

      expect(created).toMatchObject({ slug: 'created', title: 'Created' });
      expect(stored).toMatchObject({ slug: 'created', title: 'Created' });
    });

    it('create uploads a file with data to an upload collection', async () => {
      const file = new File(['ribbit'], 'frog.txt', { type: 'text/plain' });

      const media = await sdk.create({ collection: mediaSlug, data: { alt: 'A frog' }, file });

      expect(media).toMatchObject({ alt: 'A frog', filename: 'frog.txt', mimeType: 'text/plain' });
    });

    it('update by ID changes one document', async () => {
      const page = await createPage({ title: 'Before' });

      const updated = await sdk.update({
        collection: pagesSlug,
        data: { title: 'After' },
        id: page.id,
      });

      expect(updated).toMatchObject({ id: page.id, title: 'After' });
    });

    it('update by where changes every matching document', async () => {
      await createPage({ title: 'Old', slug: 'one' });
      await createPage({ title: 'Old', slug: 'two' });
      await createPage({ title: 'Keep', slug: 'three' });

      const result = await sdk.update({
        collection: pagesSlug,
        data: { title: 'New' },
        where: { title: { equals: 'Old' } },
      });

      const remaining = await sdk.count({
        collection: pagesSlug,
        where: { title: { equals: 'New' } },
      });

      expect(result.errors).toEqual([]);
      expect(result.docs.map((doc) => doc.slug).sort()).toEqual(['one', 'two']);
      expect(remaining.totalDocs).toBe(2);
    });

    it('delete by ID removes one document', async () => {
      const page = await createPage({ title: 'Doomed' });

      const deleted = await sdk.delete({ collection: pagesSlug, id: page.id });
      const missing = await sdk.findByID({
        collection: pagesSlug,
        disableErrors: true,
        id: page.id,
      });

      expect(deleted).toMatchObject({ id: page.id, title: 'Doomed' });
      expect(missing).toBeNull();
    });

    it('delete by where removes every matching document', async () => {
      await createPage({ title: 'Doomed' });
      await createPage({ title: 'Doomed' });
      await createPage({ title: 'Safe' });

      const result = await sdk.delete({
        collection: pagesSlug,
        where: { title: { equals: 'Doomed' } },
      });
      const remaining = await sdk.find({ collection: pagesSlug });

      expect(result.docs).toHaveLength(2);
      expect(remaining.docs.map((doc) => doc.title)).toEqual(['Safe']);
    });
  });

  describe('locales, joins, and autosave', () => {
    const createLocalizedPage = async (summaries: { en: string; fr: string }) => {
      const page = await createPage({ title: 'Localized', summary: summaries.en });

      await booted.frogbot.update({
        collection: pagesSlug,
        data: { summary: summaries.fr },
        id: page.id,
        locale: 'fr',
        overrideAccess: true,
      } as never);

      return page;
    };

    it('findByID with fallbackLocale false leaves an untranslated field empty', async () => {
      const page = await createPage({ title: 'English only', summary: 'Hello' });

      const fallback = await sdk.findByID({ collection: pagesSlug, id: page.id, locale: 'fr' });
      const noFallback = await sdk.findByID({
        collection: pagesSlug,
        fallbackLocale: false,
        id: page.id,
        locale: 'fr',
      });

      expect(fallback.summary).toBe('Hello');
      expect(noFallback.summary).toBeUndefined();
    });

    it('find with fallbackLocale false leaves an untranslated field empty', async () => {
      await createPage({ title: 'English only', summary: 'Hello' });

      const result = await sdk.find({ collection: pagesSlug, fallbackLocale: false, locale: 'fr' });

      expect(result.docs[0]?.summary).toBeUndefined();
    });

    it('find leaves out a join field set to false', async () => {
      const parent = await createPage({ title: 'Parent' });

      await booted.frogbot.create({
        collection: pagesSlug,
        data: { _status: 'published', parent: parent.id, title: 'Child' },
        overrideAccess: true,
      } as never);

      const joined = await sdk.findByID({ collection: pagesSlug, id: parent.id });
      const withoutJoin = await sdk.findByID({
        collection: pagesSlug,
        id: parent.id,
        joins: { children: false },
      });

      expect(joined.children?.docs).toHaveLength(1);
      expect(withoutJoin.children).toBeUndefined();
    });

    it('update by ID with autosave saves an autosave version', async () => {
      const page = await createPage({ title: 'Published' });
      const init = { headers: await loginHeaders() };

      await sdk.update(
        {
          autosave: true,
          collection: pagesSlug,
          data: { title: 'Typing' },
          draft: true,
          id: page.id,
        },
        init,
      );

      const versions = await sdk.findVersions(
        { collection: pagesSlug, sort: '-updatedAt', where: { parent: { equals: page.id } } },
        init,
      );

      expect(versions.docs[0]).toMatchObject({ autosave: true, version: { title: 'Typing' } });
    });

    it('update by ID with publishSpecificLocale publishes only that locale', async () => {
      const page = await createLocalizedPage({ en: 'Hello', fr: 'Bonjour' });

      await booted.frogbot.update({
        collection: pagesSlug,
        data: { summary: 'Hello draft' },
        draft: true,
        id: page.id,
        locale: 'en',
        overrideAccess: true,
      } as never);

      await sdk.update(
        {
          collection: pagesSlug,
          data: { _status: 'published', summary: 'Salut' },
          id: page.id,
          locale: 'fr',
          publishSpecificLocale: 'fr',
        },
        { headers: await loginHeaders() },
      );

      const english = await sdk.findByID({ collection: pagesSlug, id: page.id, locale: 'en' });
      const french = await sdk.findByID({ collection: pagesSlug, id: page.id, locale: 'fr' });

      expect(english.summary).toBe('Hello');
      expect(french.summary).toBe('Salut');
    });
  });

  describe('versions', () => {
    it('findVersions, findVersionByID, and restoreVersion walk a document history', async () => {
      const page = await createPage({ title: 'First' });
      const init = { headers: await loginHeaders() };

      await sdk.update({ collection: pagesSlug, data: { title: 'Second' }, id: page.id });

      const versions = await sdk.findVersions(
        { collection: pagesSlug, sort: 'createdAt', where: { parent: { equals: page.id } } },
        init,
      );

      const first = versions.docs[0];
      const version = await sdk.findVersionByID({ collection: pagesSlug, id: first.id }, init);
      const restored = await sdk.restoreVersion({ collection: pagesSlug, id: first.id }, init);
      const current = await sdk.findByID({ collection: pagesSlug, id: page.id });

      expect(versions.totalDocs).toBeGreaterThanOrEqual(2);
      expect(version.version.title).toBe('First');
      expect(restored.title).toBe('First');
      expect(current.title).toBe('First');
    });

    it('findVersions rejects anonymous requests with FrogBotSDKError', async () => {
      const error = await sdk.findVersions({ collection: pagesSlug }).catch((e) => e);

      expect(error).toBeInstanceOf(FrogBotSDKError);
      expect(error.status).toBe(403);
      expect(error.errors[0].message).toBe('You are not allowed to perform this action.');
    });

    it('findVersionByID with disableErrors returns null for a missing version', async () => {
      const missing = await sdk.findVersionByID(
        { collection: pagesSlug, disableErrors: true, id: '999999' },
        { headers: await loginHeaders() },
      );

      expect(missing).toBeNull();
    });
  });

  describe('auth', () => {
    it('login returns a token and me returns the user with a JWT header', async () => {
      const login = await sdk.login({ collection: usersSlug, data: credentials });

      const me = await sdk.me(
        { collection: usersSlug },
        { headers: { Authorization: `JWT ${login.token}` } },
      );

      expect(login.token).toEqual(expect.any(String));
      expect(login.user).toMatchObject({ email: testUserEmail, id: userID });
      expect(me.user).toMatchObject({ email: testUserEmail, id: userID });
    });

    it('me returns no user without credentials', async () => {
      const me = await sdk.me({ collection: usersSlug });

      expect(me.user).toBeNull();
    });

    it('refreshToken issues a new token for the logged-in user', async () => {
      const refreshed = await sdk.refreshToken(
        { collection: usersSlug },
        { headers: await loginHeaders() },
      );

      expect(refreshed.refreshedToken).toEqual(expect.any(String));
      expect(refreshed.user).toMatchObject({ email: testUserEmail });
    });

    it('authenticates with the session cookie from login', async () => {
      const cookies: string[] = [];

      const cookieSDK = createFrogBotSDK<Config>({
        baseURL: `${booted.baseUrl}/api`,
        fetch: async (input, init) => {
          const response = await fetch(input, init);

          cookies.push(...response.headers.getSetCookie());

          return response;
        },
      });

      await cookieSDK.login({ collection: usersSlug, data: credentials });

      const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
      const me = await cookieSDK.me({ collection: usersSlug }, { headers: { Cookie: cookie } });

      expect(cookie).toMatch(/^frogbot/);
      expect(me.user).toMatchObject({ email: testUserEmail });
    });

    it('forgotPassword returns the confirmation message', async () => {
      const result = await sdk.forgotPassword({
        collection: usersSlug,
        data: { email: testUserEmail },
      });

      expect(result.message).toEqual(expect.any(String));
    });

    it('login with a wrong password surfaces FrogBotSDKError', async () => {
      const error = await sdk
        .login({ collection: usersSlug, data: { email: testUserEmail, password: 'wrong' } })
        .catch((e) => e);

      expect(error).toBeInstanceOf(FrogBotSDKError);
      expect(error.status).toBe(401);
      expect(error.errors[0].message).toEqual(expect.any(String));
    });
  });
});
