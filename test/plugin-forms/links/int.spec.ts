import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFormLink, type FormDocument, type FormLinkDocument } from '@frogbotai/plugin-forms';
import type { FrogBotRequest } from 'frogbot';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import {
  applicationsSlug,
  draftedSlug,
  failingName,
  hookMarkerPrefix,
  noteIdKey,
  notesSlug,
  otherApplicationKey,
  reachingName,
  reachPrefix,
  serverURL,
  updateCountPrefix,
} from './config.js';

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

      const deleted = await createApplication({ email: 'deleted@example.com' });

      await booted.frogbot.delete({
        collection: applicationsSlug,
        id: deleted,
        overrideAccess: true,
      });

      await expect(
        createFormLink(booted.frogbot, { form: form.slug, record: deleted, overrideAccess: true }),
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

      const listed = await booted.restClient.get<{ docs: { status?: string }[] }>(
        '/api/form-links?select[label]=true&select[status]=true',
        { headers },
      );

      expect(listed.body.docs).toEqual([expect.objectContaining({ status: 'revoked' })]);
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

  describe('using a link', () => {
    type Application = {
      id: Id;
      email: string;
      name?: string | null;
      phone?: string | null;
      status?: string | null;
      owner?: unknown;
      updatedBy?: { value?: unknown } | null;
    };

    let ipCounter = 0;
    const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

    async function link(options: { record?: Id; maxSubmissions?: number; form?: string } = {}) {
      const { url } = await createFormLink(booted.frogbot, {
        form: options.form ?? form.slug,
        record: options.record ?? mine,
        maxSubmissions: options.maxSubmissions,
        overrideAccess: true,
      });

      return new URL(url).searchParams.get('link')!;
    }

    function open(token: string, slug = form.slug, headers?: HeadersInit) {
      return booted.restClient.get<Record<string, unknown>>(
        `/api/forms/${slug}/definition?link=${encodeURIComponent(token)}`,
        { headers },
      );
    }

    function save(token: string, data: Record<string, unknown>, slug = form.slug) {
      return booted.restClient.post<Record<string, unknown>>(
        `/api/forms/${slug}/submit?link=${encodeURIComponent(token)}`,
        { data },
      );
    }

    async function application(id: Id): Promise<Application> {
      return (await booted.frogbot.findByID({
        collection: applicationsSlug,
        id,
        depth: 0,
        overrideAccess: true,
      })) as unknown as Application;
    }

    async function uses(token: string) {
      const [stored] = (await storedLinks()).filter(
        ({ tokenHash }) => tokenHash === createHash('sha256').update(token).digest('hex'),
      );

      return { submissions: stored?.submissions, lastSubmittedAt: stored?.lastSubmittedAt ?? null };
    }

    async function setLink(token: string, data: Record<string, unknown>) {
      await booted.frogbot.update({
        collection: 'form-links',
        where: { tokenHash: { equals: createHash('sha256').update(token).digest('hex') } },
        data,
        overrideAccess: true,
      });
    }

    it('signs no one in as a JWT or Bearer header', async () => {
      const token = await link();

      for (const header of [`JWT ${token}`, `Bearer ${token}`]) {
        const me = await booted.restClient.get<{ user: unknown }>('/api/users/me', {
          headers: { Authorization: header },
        });

        const read = await booted.restClient.get(`/api/${applicationsSlug}/${mine}`, {
          headers: { Authorization: header },
        });

        expect(me.body.user).toBeNull();
        expect(read.status).toBe(403);
      }
    });

    it('opens prefilled with only the questions, and saves only them', async () => {
      await booted.frogbot.update({
        collection: applicationsSlug,
        id: mine,
        data: { name: 'Ada', phone: '555-0100', status: 'review' },
        overrideAccess: true,
      });

      const token = await link();
      const opened = await open(token);

      expect(opened.status).toBe(200);
      expect(opened.body.values).toEqual({ name: 'Ada', phone: '555-0100' });
      expect(opened.body.hiddenParams).toEqual([]);

      const saved = await save(token, {
        name: 'Ada Lovelace',
        phone: '',
        email: 'attacker@example.com',
        status: 'approved',
        owner: viewer.id,
        id: theirs,
      });

      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({ confirmation: expect.any(Object) });

      expect(await application(mine)).toMatchObject({
        email: 'mine@example.com',
        name: 'Ada Lovelace',
        phone: null,
        status: 'review',
        owner: staff.id,
      });

      const untouched = await application(theirs);

      expect(untouched.email).toBe('theirs@example.com');
      expect(untouched.name ?? null).toBeNull();
    });

    it('reads the stored answers a rule needs when the edit leaves them out', async () => {
      const ruled = (operator: 'equals' | 'notEquals') =>
        createForm({
          slug: `phone-when-${operator.toLowerCase()}`,
          steps: [
            {
              questions: [
                { field: 'name' },
                { field: 'phone', rules: [{ question: 'name', operator, value: 'Ada' }] },
              ],
            },
          ],
        });

      const shown = await ruled('equals');
      const hidden = await ruled('notEquals');
      const record = await createApplication({
        email: 'ada@example.com',
        name: 'Ada',
        phone: 'old',
      });

      const kept = await save(
        await link({ form: hidden.slug, record }),
        { phone: 'hidden' },
        hidden.slug,
      );

      expect(kept.status).toBe(200);
      expect(await application(record)).toMatchObject({ name: 'Ada', phone: 'old' });

      const changed = await save(
        await link({ form: shown.slug, record }),
        { phone: 'new' },
        shown.slug,
      );

      expect(changed.status).toBe(200);
      expect(await application(record)).toMatchObject({ name: 'Ada', phone: 'new' });

      const cleared = await save(
        await link({ form: shown.slug, record }),
        { name: '', phone: 'dropped' },
        shown.slug,
      );

      expect(cleared.status).toBe(200);
      expect(await application(record)).toMatchObject({ name: null, phone: 'new' });
    });

    it("runs the collection's hooks with the link, and leaves updatedBy as it was", async () => {
      const record = (
        await booted.frogbot.create({
          collection: applicationsSlug,
          data: { email: 'hooks@example.com' },
          overrideAccess: false,
          req: await as(admin),
        })
      ).id;

      const token = await link({ record });

      expect((await save(token, { name: 'Grace' })).status).toBe(200);

      const [stored] = await storedLinks();

      expect(await booted.frogbot.kv.get(`${hookMarkerPrefix}${record}`)).toBe(String(stored?.id));
      expect((await application(record)).updatedBy?.value).toBe(admin.id);
      expect(stored).toMatchObject({ submissions: 1, lastSubmittedAt: expect.any(String) });
    });

    it('admits only its own record: a hook reaching another collection or record is refused', async () => {
      const note = await booted.frogbot.create({
        collection: notesSlug,
        data: { body: 'original' },
        overrideAccess: true,
      });

      await booted.frogbot.kv.set(noteIdKey, note.id);
      await booted.frogbot.kv.set(otherApplicationKey, theirs);

      const token = await link();

      expect((await save(token, { name: reachingName })).status).toBe(200);
      expect(await booted.frogbot.kv.get(`${reachPrefix}${mine}`)).toEqual({
        note: 'Forbidden',
        other: 'NotFound',
      });
      expect(
        await booted.frogbot.findByID({ collection: notesSlug, id: note.id, overrideAccess: true }),
      ).toMatchObject({ body: 'original' });
    });

    it('gives every bad link the same 410 on GET and submit', async () => {
      const other = await createForm({ slug: 'other-form' });
      const createOnly = await createForm({
        slug: 'apply',
        mode: 'create',
        steps: [{ questions: [{ field: 'email' }] }],
      });

      const expired = await link();
      const revoked = await link();
      const usedUp = await link({ maxSubmissions: 1 });
      const otherForm = await link({ form: other.slug });

      await setLink(expired, { expiresAt: new Date(Date.now() - 1000).toISOString() });
      await setLink(revoked, { revokedAt: new Date().toISOString() });
      await setLink(usedUp, { submissions: 1 });

      const cases: [string, string][] = [
        ['A'.repeat(43), form.slug],
        [expired, form.slug],
        [revoked, form.slug],
        [usedUp, form.slug],
        [otherForm, form.slug],
        [otherForm, createOnly.slug],
        [otherForm, 'no-such-form'],
        ['', form.slug],
      ];

      for (const [token, slug] of cases) {
        const opened = await open(token, slug);
        const saved = await save(token, { name: 'Nope' }, slug);

        expect(opened.status).toBe(410);
        expect(saved.status).toBe(410);
        expect(opened.body).toEqual({ error: 'This link is no longer valid.' });
        expect(saved.body).toEqual(opened.body);
      }

      expect((await application(mine)).name ?? null).toBeNull();
      expect((await open(otherForm, other.slug)).status).toBe(200);
    });

    it('counts saves, not views: one of two concurrent saves at maxSubmissions 1 updates', async () => {
      const token = await link({ maxSubmissions: 1 });
      const updates = async () =>
        Number(await booted.frogbot.kv.get(`${updateCountPrefix}${mine}`)) || 0;

      const before = await updates();

      for (let index = 0; index < 3; index++) expect((await open(token)).status).toBe(200);

      expect(await uses(token)).toEqual({ submissions: 0, lastSubmittedAt: null });

      const results = await Promise.all([
        save(token, { name: 'First' }),
        save(token, { name: 'Second' }),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([200, 410]);
      expect(await updates()).toBe(before + 1);
      expect((await uses(token)).submissions).toBe(1);
      expect((await open(token)).status).toBe(410);
    });

    it('spends no use when the save fails, and works again after', async () => {
      const token = await link({ maxSubmissions: 1 });
      const failed = await save(token, { name: failingName });

      expect(failed.status).toBe(400);
      expect(failed.body).toEqual({ error: 'The CRM refused this change.' });
      expect(await uses(token)).toEqual({ submissions: 0, lastSubmittedAt: null });

      expect((await save(token, { name: 'Fine' })).status).toBe(200);
      expect((await application(mine)).name).toBe('Fine');
    });

    it('is reusable by default until it expires', async () => {
      const token = await link();

      for (const name of ['One', 'Two', 'Three']) {
        expect((await save(token, { name })).status).toBe(200);
      }

      expect((await uses(token)).submissions).toBe(3);
    });

    it('a closed form refuses saves through links too', async () => {
      const token = await link();

      await booted.frogbot.update({
        collection: 'forms',
        id: form.id,
        data: { status: 'closed' },
        overrideAccess: true,
      });

      expect((await open(token)).body).toMatchObject({ closed: true });
      expect((await save(token, { name: 'Late' })).status).toBe(410);
      expect((await uses(token)).submissions).toBe(0);
    });

    it('counts wrong tokens toward the per-visitor limit, then refuses every link', async () => {
      const ip = nextIp();
      const good = await link();
      const headers = { 'x-forwarded-for': ip };

      for (let index = 0; index < 10; index++) {
        expect((await open(`wrong-${index}`, form.slug, headers)).status).toBe(410);
      }

      const limited = await open(good, form.slug, headers);

      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toMatch(/^\d+$/);
      expect((await open(good, form.slug, { 'x-forwarded-for': nextIp() })).status).toBe(200);
    });
  });
});
