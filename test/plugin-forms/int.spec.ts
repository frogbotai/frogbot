import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type FormDefinition, type FormDocument, formsPlugin } from '@frogbotai/plugin-forms';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { hookMarkerPrefix, leadsSlug, staffFormSlug, ticketsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';
const MiB = 1024 * 1024;

type Lead = {
  id: number | string;
  email: string;
  firstName?: string | null;
  interest?: string | null;
  source?: string | null;
  priority: string;
  internalNote?: string | null;
  meta?: unknown;
};

type FormInput = Omit<FormDocument, 'id'>;

const contactForm: FormInput = {
  title: 'Contact us',
  slug: 'contact',
  collection: leadsSlug,
  steps: [
    { title: 'You', questions: [{ field: 'email', label: 'Work email' }, { field: 'firstName' }] },
    { questions: [{ field: 'interest', description: 'What can we help with?' }] },
  ],
  hiddenParams: [{ name: 'utm_source', field: 'source' }],
  confirmation: { type: 'message', message: 'Thanks!' },
};

describe(`forms plugin [${adapterLabel}]`, () => {
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

  async function createForm(overrides: Partial<FormInput> = {}): Promise<FormDocument> {
    return (await booted.frogbot.create({
      collection: 'forms',
      data: { ...contactForm, ...overrides },
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

  async function leads(): Promise<Lead[]> {
    const result = await booted.frogbot.find({
      collection: leadsSlug,
      overrideAccess: true,
      pagination: false,
    });

    return result.docs as unknown as Lead[];
  }

  function submit(slug: string, body: unknown) {
    return booted.restClient.post<Record<string, unknown>>(`/api/forms/${slug}/submit`, body);
  }

  it('fails boot for a collection that does not exist', async () => {
    await expect(
      buildTestConfig({
        collections: [{ slug: 'users', auth: true, fields: [] }],
        plugins: [formsPlugin({ collections: ['missing'] as never[] })],
      }),
    ).rejects.toThrow("[plugin-forms] Unknown collection 'missing'");
  });

  it('refuses to save forms that could not create a record, naming the field', async () => {
    const step = (...fields: string[]) => [{ questions: fields.map((field) => ({ field })) }];

    expect(await saveErrors({ steps: step('email', 'meta') })).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.field',
        message: expect.stringContaining('"meta" has type json'),
      }),
    ]);

    expect(await saveErrors({ steps: step('email', 'email') })).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.field',
        message: '"email" is already on this form.',
      }),
    ]);

    expect(await saveErrors({ steps: step('firstName') })).toEqual([
      expect.objectContaining({ path: 'steps', message: expect.stringContaining('"email"') }),
    ]);

    expect(await saveErrors({ steps: step('email', 'internalNote') })).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.field',
        message: expect.stringContaining('"internalNote" can\'t be filled from a form'),
      }),
    ]);

    expect(await saveErrors({ steps: step('email', 'nope') })).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.field',
        message: expect.stringContaining('"nope"'),
      }),
    ]);

    expect(await saveErrors({ hiddenParams: [{ name: 'tier', field: 'priority' }] })).toEqual([
      expect.objectContaining({ path: 'hiddenParams.0.field' }),
    ]);

    expect(
      await saveErrors({ confirmation: { type: 'redirect', redirect: 'javascript:alert(1)' } }),
    ).toEqual([expect.objectContaining({ path: 'confirmation.redirect' })]);
  });

  it("refuses a file question over the app's default upload limits, naming the key", async () => {
    const errors = await saveErrors({
      collection: ticketsSlug,
      steps: [
        { questions: [{ field: 'subject' }, { field: 'screenshot', maxFileSize: 50 * MiB }] },
      ],
      hiddenParams: [],
    });

    expect(errors).toEqual([
      expect.objectContaining({
        path: 'steps.0.questions.1.maxFileSize',
        message: expect.stringMatching(
          /^"screenshot" accepts files up to 50 MB, over the app's 20 MB/,
        ),
      }),
    ]);
  });

  it('serves the render definition without the target collection', async () => {
    await createForm();

    const { status, body } = await booted.restClient.get<FormDefinition>(
      '/api/forms/contact/definition',
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      slug: 'contact',
      title: 'Contact us',
      steps: [
        {
          title: 'You',
          questions: [
            { key: 'email', type: 'email', label: 'Work email', required: true },
            { key: 'firstName', type: 'text', label: 'First Name', required: false },
          ],
        },
        {
          questions: [
            {
              key: 'interest',
              type: 'select',
              label: 'Interest',
              description: 'What can we help with?',
              required: false,
              options: [
                { label: 'sales', value: 'sales' },
                { label: 'support', value: 'support' },
                { label: 'partnership', value: 'partnership' },
              ],
            },
          ],
        },
      ],
      hiddenParams: ['utm_source'],
      confirmation: { type: 'message', message: 'Thanks!' },
      closed: false,
      honeypot: expect.any(String),
    });
  });

  it('answers 404 alike for missing forms and forms the visitor cannot read', async () => {
    await createForm({ slug: staffFormSlug });

    for (const slug of ['missing', staffFormSlug]) {
      const definition = await booted.restClient.get(`/api/forms/${slug}/definition`);
      const submitted = await submit(slug, { data: { email: 'ada@example.com' } });

      expect(definition).toMatchObject({ status: 404, body: { error: 'Not found' } });
      expect(submitted).toMatchObject({ status: 404, body: { error: 'Not found' } });
    }

    expect(await leads()).toEqual([]);
  });

  it('creates a record from the answers, runs its hooks, and never returns it', async () => {
    await createForm();

    const { status, body } = await submit('contact', {
      data: {
        email: 'ada@example.com',
        firstName: 'Ada',
        interest: 'sales',
        priority: 'high',
        internalNote: 'vip',
        meta: { admin: true },
        id: 999,
      },
      params: { utm_source: 'newsletter', utm_campaign: 'fall', email: 'evil@example.com' },
    });

    expect(status).toBe(200);
    expect(body).toEqual({ confirmation: { type: 'message', message: 'Thanks!' } });

    const [lead] = await leads();

    expect(lead).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
      interest: 'sales',
      source: 'newsletter',
      priority: 'normal',
    });

    expect(lead.id).not.toBe(999);
    expect(lead.internalNote ?? null).toBeNull();
    expect(lead.meta ?? null).toBeNull();
    expect(await booted.frogbot.kv.get(`${hookMarkerPrefix}${lead.id}`)).toBe('contact');
  });

  it('returns field errors from the collection', async () => {
    await createForm();

    const { status, body } = await submit('contact', { data: { email: 'not-an-email' } });

    expect(status).toBe(400);
    expect(body).toEqual({ errors: [expect.objectContaining({ field: 'email' })] });
    expect(await leads()).toEqual([]);
  });

  it('keeps the collection closed to signed-out REST creates', async () => {
    const { status } = await booted.restClient.post(`/api/${leadsSlug}`, {
      email: 'ada@example.com',
    });

    expect(status).toBe(403);
    expect(await leads()).toEqual([]);
  });

  it('cuts a parameter to 500 characters', async () => {
    await createForm();

    await submit('contact', {
      data: { email: 'ada@example.com' },
      params: { utm_source: 'x'.repeat(501) },
    });

    const [lead] = await leads();

    expect(lead.source).toBe('x'.repeat(500));
  });

  it('answers 410 for closed forms and forms past closesAt', async () => {
    await createForm({ slug: 'closed', status: 'closed' });
    await createForm({ slug: 'expired', closesAt: new Date(Date.now() - 60_000).toISOString() });

    for (const slug of ['closed', 'expired']) {
      const { status } = await submit(slug, { data: { email: 'ada@example.com' } });
      const definition = await booted.restClient.get<FormDefinition>(
        `/api/forms/${slug}/definition`,
      );

      expect(status).toBe(410);
      expect(definition.body.closed).toBe(true);
    }

    expect(await leads()).toEqual([]);
  });

  it('makes exactly one record from two concurrent submits at maxResponses 1', async () => {
    await createForm({ maxResponses: 1 });

    const results = await Promise.all([
      submit('contact', { data: { email: 'ada@example.com' } }),
      submit('contact', { data: { email: 'grace@example.com' } }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual([200, 410]);
    expect(await leads()).toHaveLength(1);
  });

  it('queues concurrent submits under the limit instead of refusing them', async () => {
    await createForm({ maxResponses: 2 });

    const results = await Promise.all(
      ['ada', 'grace', 'linus'].map((name) =>
        submit('contact', { data: { email: `${name}@example.com` } }),
      ),
    );

    expect(results.map(({ status }) => status).sort()).toEqual([200, 200, 410]);
    expect(await leads()).toHaveLength(2);
  });

  it('answers a filled honeypot with the confirmation, creating and counting nothing', async () => {
    await createForm({ maxResponses: 1 });

    const { body: definition } = await booted.restClient.get<FormDefinition>(
      '/api/forms/contact/definition',
    );

    const trapped = await submit('contact', {
      data: { email: 'bot@example.com' },
      honeypot: 'https://spam.example',
    });

    expect(definition.honeypot).toMatch(/\S/);
    expect(definition.turnstile).toBeUndefined();
    expect(trapped).toMatchObject({ status: 200, body: { confirmation: { message: 'Thanks!' } } });
    expect(await leads()).toEqual([]);

    expect((await submit('contact', { data: { email: 'ada@example.com' } })).status).toBe(200);
    expect(await leads()).toHaveLength(1);
  });

  it('keeps no per-address count without trustProxy, whatever x-forwarded-for says', async () => {
    await createForm();

    const statuses = [];

    for (let index = 0; index < 12; index += 1) {
      const { status } = await booted.restClient.post(
        '/api/forms/contact/submit',
        { data: { email: `visitor${index}@example.com` } },
        { headers: { 'x-forwarded-for': index % 2 ? '203.0.113.9' : `198.51.100.${index}` } },
      );

      statuses.push(status);
    }

    expect(statuses).toEqual(Array(12).fill(200));
    expect(await leads()).toHaveLength(12);
  });
});
