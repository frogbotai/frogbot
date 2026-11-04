import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFormLink, type FormDocument, type FormLinkDocument } from '@frogbotai/plugin-forms';
import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { applicationsSlug, draftedSlug, serverURL } from './config.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const DAY = 86_400_000;
const password = 'links-test-password';

type FormInput = Omit<FormDocument, 'id'>;

type Id = number | string;

type User = { id: Id; email: string; role: string };

const updateForm: FormInput = {
  title: 'Update your application',
  slug: 'update-application',
  collection: applicationsSlug,
  mode: 'update',
  steps: [{ questions: [{ field: 'name' }, { field: 'phone' }] }],
};

describe(`form edit links [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let admin: User;
  let staff: User;
  let viewer: User;
  let form: FormDocument;
  let mine: Id;
  let theirs: Id;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname);
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  async function createUser(role: string): Promise<User> {
    return (await booted.frogbot.create({
      collection: 'users',
      data: { email: `${role}@example.com`, password, role },
      overrideAccess: true,
    })) as unknown as User;
  }

  async function createApplication(data: Record<string, unknown>): Promise<Id> {
    const doc = await booted.frogbot.create({
      collection: applicationsSlug,
      data,
      overrideAccess: true,
    });

    return doc.id;
  }

  async function createForm(overrides: Partial<FormInput> = {}): Promise<FormDocument> {
    return (await booted.frogbot.create({
      collection: 'forms',
      data: { ...updateForm, ...overrides },
      overrideAccess: true,
    })) as unknown as FormDocument;
  }

  async function saveErrors(overrides: Partial<FormInput>) {
    try {
      await createForm(overrides);
    } catch (error) {
      return (error as { data?: { errors?: { path: string; message: string }[] } }).data?.errors;
    }

    throw new Error('Expected the form to be refused');
  }

  function as(user: User | null): Promise<FrogBotRequest> {
    return booted.frogbot.createRequest(user ? { user: { ...user, collection: 'users' } } : {});
  }

  async function auth(user: User): Promise<HeadersInit> {
    const login = await booted.restClient.post<{ token: string }>('/api/users/login', {
      email: user.email,
      password,
    });

    return { Authorization: `JWT ${login.body.token}` };
  }

  async function storedLinks(): Promise<(FormLinkDocument & { tokenHash?: string })[]> {
    const { docs } = await booted.frogbot.find({
      collection: 'form-links',
      overrideAccess: true,
      pagination: false,
      showHiddenFields: true,
    });

    return docs as never;
  }

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    admin = await createUser('admin');
    staff = await createUser('staff');
    viewer = await createUser('viewer');
    mine = await createApplication({ email: 'mine@example.com', owner: staff.id });
    theirs = await createApplication({ email: 'theirs@example.com' });
    form = await createForm();
  });

  describe('modes on save', () => {
    it('saves an update form without the required fields, and refuses fields links cannot change', async () => {
      expect(form.mode).toBe('update');

      expect(
        await saveErrors({ slug: 'locked', steps: [{ questions: [{ field: 'status' }] }] }),
      ).toEqual([
        expect.objectContaining({
          path: 'steps.0.questions.0.field',
          message: expect.stringContaining('"status" can\'t be changed through an edit link'),
        }),
      ]);

      expect(await saveErrors({ slug: 'both', mode: 'both' })).toEqual([
        expect.objectContaining({ path: 'steps', message: expect.stringContaining('"email"') }),
      ]);

      expect(
        await saveErrors({
          slug: 'drafts',
          collection: draftedSlug,
          steps: [{ questions: [{ field: 'title' }] }],
        }),
      ).toEqual([expect.objectContaining({ path: 'mode' })]);

      const fallback = (await booted.frogbot.create({
        collection: 'forms',
        data: { ...updateForm, slug: 'default-mode', mode: undefined, status: 'closed' },
        overrideAccess: true,
      })) as unknown as FormDocument;

      expect(fallback.mode).toBe('create');
    });

    it('keeps update forms off the public create path', async () => {
      const definition = await booted.restClient.get(`/api/forms/${form.slug}/definition`);
      const submit = await booted.restClient.post(`/api/forms/${form.slug}/submit`, {
        data: { name: 'Nope' },
      });

      expect(definition.status).toBe(404);
      expect(submit.status).toBe(404);
    });
  });

  describe('createFormLink', () => {
    it('returns the URL once and stores only its hash', async () => {
      const before = Date.now();
      const link = await createFormLink(booted.frogbot, {
        form: form.slug,
        record: mine,
        req: await as(admin),
      });

      const url = new URL(link.url);
      const token = url.searchParams.get('link')!;

      expect(`${url.origin}${url.pathname}`).toBe(`${serverURL}/forms/${form.slug}`);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 7 * DAY);
      expect(new Date(link.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 7 * DAY);

      const [stored] = await storedLinks();

      expect(stored).toMatchObject({
        id: link.id,
        collection: applicationsSlug,
        recordId: String(mine),
        submissions: 0,
        maxSubmissions: null,
        status: 'active',
        label: `${form.title} · ${String(mine)}`,
      });
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(stored)).not.toContain(token);
      expect((stored as { createdBy?: { value?: unknown } }).createdBy?.value).toEqual(
        expect.objectContaining({ id: admin.id }),
      );
    });

    it('takes a form ID, its own length and a use limit, within the maximum', async () => {
      const link = await createFormLink(booted.frogbot, {
        form: form.id,
        record: mine,
        expiresIn: '2d',
        maxSubmissions: 1,
        overrideAccess: true,
      });

      expect(new Date(link.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 2 * DAY);
      expect((await storedLinks())[0]).toMatchObject({ maxSubmissions: 1 });

      await expect(
        createFormLink(booted.frogbot, {
          form: form.slug,
          record: mine,
          expiresIn: '31d',
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'ValidationError', status: 400 });

      await expect(
        createFormLink(booted.frogbot, {
          form: form.slug,
          record: mine,
          maxSubmissions: 0,
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses create-only forms and missing records', async () => {
      const createOnly = await createForm({
        slug: 'apply',
        mode: 'create',
        steps: [{ questions: [{ field: 'email' }] }],
      });

      await expect(
        createFormLink(booted.frogbot, {
          form: createOnly.slug,
          record: mine,
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'ValidationError' });

      await expect(
        createFormLink(booted.frogbot, { form: form.slug, record: 999_999, overrideAccess: true }),
      ).rejects.toMatchObject({ name: 'NotFound' });

      await expect(
        createFormLink(booted.frogbot, { form: 'missing', record: mine, overrideAccess: true }),
      ).rejects.toMatchObject({ name: 'NotFound' });
    });

    it("throws Forbidden without update access on the record, by the collection's own rule", async () => {
      await expect(
        createFormLink(booted.frogbot, { form: form.slug, record: mine, req: await as(staff) }),
      ).resolves.toMatchObject({ url: expect.any(String) });

      for (const [user, record] of [
        [staff, theirs],
        [viewer, mine],
        [null, mine],
      ] as const) {
        await expect(
          createFormLink(booted.frogbot, { form: form.slug, record, req: await as(user) }),
        ).rejects.toMatchObject({ name: 'Forbidden', status: 403 });
      }

      await expect(
        createFormLink(booted.frogbot, { form: form.slug, record: mine }),
      ).rejects.toMatchObject({ name: 'Forbidden' });

      expect(await storedLinks()).toHaveLength(1);
    });
  });

  describe('REST', () => {
    it("POST /api/form-links makes a link as the caller, by the caller's access", async () => {
      const created = await booted.restClient.post<{ url: string; id: Id; expiresAt: string }>(
        '/api/form-links',
        { form: form.slug, record: mine, expiresIn: '1d', tokenHash: 'a'.repeat(64) },
        { headers: await auth(staff) },
      );

      expect(created.status).toBe(201);
      expect(created.body.url).toContain(`/forms/${form.slug}?link=`);
      expect((await storedLinks())[0].tokenHash).not.toBe('a'.repeat(64));

      const refused = await booted.restClient.post(
        '/api/form-links',
        { form: form.slug, record: theirs },
        { headers: await auth(staff) },
      );

      const signedOut = await booted.restClient.post('/api/form-links', {
        form: form.slug,
        record: mine,
      });

      const tooLong = await booted.restClient.post<{ errors?: { path: string }[] }>(
        '/api/form-links',
        { form: form.slug, record: mine, expiresIn: '90d' },
        { headers: await auth(admin) },
      );

      expect(refused.status).toBe(403);
      expect(signedOut.status).toBe(403);
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.errors).toEqual([expect.objectContaining({ path: 'expiresIn' })]);
      expect(await storedLinks()).toHaveLength(1);
    });

    it('never makes a row outside createFormLink, and never returns the hash', async () => {
      await expect(
        booted.frogbot.create({
          collection: 'form-links',
          data: {
            form: form.id,
            collection: applicationsSlug,
            recordId: String(mine),
            tokenHash: 'b'.repeat(64),
            expiresAt: new Date(Date.now() + DAY).toISOString(),
          },
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({ name: 'Forbidden' });

      const link = await createFormLink(booted.frogbot, {
        form: form.slug,
        record: mine,
        overrideAccess: true,
      });

      const headers = await auth(admin);
      const list = await booted.restClient.get<{ docs: Record<string, unknown>[] }>(
        '/api/form-links',
        { headers },
      );

      const one = await booted.restClient.get<Record<string, unknown>>(
        `/api/form-links/${link.id}`,
        { headers },
      );

      expect(list.body.docs).toHaveLength(1);
      expect(list.body.docs[0]).not.toHaveProperty('tokenHash');
      expect(one.status).toBe(200);
      expect(one.body).not.toHaveProperty('tokenHash');
      expect(one.body.status).toBe('active');
    });

    it('PATCH changes only revokedAt, and a revoked link stays revoked', async () => {
      const link = await createFormLink(booted.frogbot, {
        form: form.slug,
        record: mine,
        overrideAccess: true,
      });

      const [before] = await storedLinks();
      const headers = await auth(staff);
      const revokedAt = new Date().toISOString();

      const patched = await booted.restClient.patch<{ doc: Record<string, unknown> }>(
        `/api/form-links/${link.id}`,
        {
          revokedAt,
          recordId: String(theirs),
          expiresAt: new Date(Date.now() + 365 * DAY).toISOString(),
          submissions: -5,
          maxSubmissions: 100,
          tokenHash: 'c'.repeat(64),
        },
        { headers },
      );

      expect(patched.status).toBe(200);

      const [after] = await storedLinks();

      expect(after).toMatchObject({
        recordId: before.recordId,
        expiresAt: before.expiresAt,
        submissions: 0,
        maxSubmissions: null,
        tokenHash: before.tokenHash,
        status: 'revoked',
      });
      expect(new Date(after.revokedAt!).toISOString()).toBe(revokedAt);

      await booted.restClient.patch(`/api/form-links/${link.id}`, { revokedAt: null }, { headers });

      expect((await storedLinks())[0].status).toBe('revoked');
    });

    it('lists, revokes and deletes only the links of records the user can update', async () => {
      const own = await createFormLink(booted.frogbot, {
        form: form.slug,
        record: mine,
        overrideAccess: true,
      });

      const other = await createFormLink(booted.frogbot, {
        form: form.slug,
        record: theirs,
        overrideAccess: true,
      });

      const list = async (user: User) =>
        (
          await booted.restClient.get<{ docs: { id: Id }[] }>('/api/form-links', {
            headers: await auth(user),
          })
        ).body.docs.map(({ id }) => id);

      expect((await list(admin)).sort()).toEqual([own.id, other.id].sort());
      expect(await list(staff)).toEqual([own.id]);
      expect(await list(viewer)).toEqual([]);

      const headers = await auth(staff);
      const revoke = await booted.restClient.patch(
        `/api/form-links/${other.id}`,
        { revokedAt: new Date().toISOString() },
        { headers },
      );

      const remove = await booted.restClient.delete(`/api/form-links/${other.id}`, { headers });

      expect(revoke.status).toBe(403);
      expect(remove.status).toBe(403);

      expect(
        (await booted.restClient.delete(`/api/form-links/${own.id}`, { headers })).status,
      ).toBe(200);
      expect((await storedLinks()).map(({ id }) => id)).toEqual([other.id]);
    });

    it('deleting a form deletes its links', async () => {
      await createFormLink(booted.frogbot, { form: form.slug, record: mine, overrideAccess: true });

      await booted.frogbot.delete({ collection: 'forms', id: form.id, overrideAccess: true });

      expect(await storedLinks()).toEqual([]);
    });
  });
});
