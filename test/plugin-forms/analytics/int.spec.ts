import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { type FormDefinition, type FormDocument } from '@frogbotai/plugin-forms';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import { leadsSlug } from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const adapterLabel = process.env.FROGBOT_DATABASE || 'sqlite';

type Stats = {
  form: number | string;
  day: string;
  views: number;
  starts: number;
  completions: number;
};

describe(`forms plugin analytics [${adapterLabel}]`, () => {
  let booted: BootedFrogBot;
  let form: FormDocument;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-forms-analytics');
  });

  afterAll(async () => {
    await booted.shutdown();
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    form = (await booted.frogbot.create({
      collection: 'forms',
      data: {
        title: 'Contact us',
        slug: 'contact',
        collection: leadsSlug,
        steps: [{ questions: [{ field: 'email' }] }],
      } satisfies Omit<FormDocument, 'id'>,
      overrideAccess: true,
    })) as unknown as FormDocument;
  });

  const ping = (type: unknown, slug = 'contact') =>
    booted.restClient.post(`/api/forms/${slug}/events`, { type });

  const submit = (email: string) =>
    booted.restClient.post(`/api/forms/contact/submit`, { data: { email } });

  async function stats(): Promise<Stats[]> {
    const { docs } = await booted.frogbot.find({
      collection: 'form-stats',
      overrideAccess: true,
      pagination: false,
      depth: 0,
    });

    return docs as unknown as Stats[];
  }

  it('says in the definition that the page should send views and starts', async () => {
    const { body } = await booted.restClient.get<FormDefinition>('/api/forms/contact/definition');

    expect(body.analytics).toBe(true);
  });

  it('counts three completions, two of them concurrent, on one row for the day', async () => {
    expect((await submit('ada@example.com')).status).toBe(200);

    const both = await Promise.all([submit('grace@example.com'), submit('alan@example.com')]);

    expect(both.map(({ status }) => status)).toEqual([200, 200]);

    const rows = await stats();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      form: form.id,
      day: new Date().toISOString().slice(0, 10),
      views: 0,
      starts: 0,
      completions: 3,
    });
  });

  it('counts view and start pings, and refuses other kinds', async () => {
    await Promise.all([ping('view'), ping('view'), ping('start')]);

    expect((await ping('completion')).status).toBe(400);
    expect((await ping(undefined)).status).toBe(400);

    expect(await stats()).toMatchObject([{ views: 2, starts: 1, completions: 0 }]);
  });

  it('answers 404 for an unknown form and counts nothing for a closed one', async () => {
    expect((await ping('view', 'missing')).status).toBe(404);

    await booted.frogbot.update({
      collection: 'forms',
      id: form.id,
      data: { status: 'closed' },
      overrideAccess: true,
    });

    expect((await ping('view')).status).toBe(204);
    expect(await stats()).toEqual([]);
  });

  it('counts nothing for a honeypot submit', async () => {
    await booted.restClient.post('/api/forms/contact/submit', {
      data: { email: 'bot@example.com' },
      honeypot: 'filled',
    });

    expect(await stats()).toEqual([]);
  });

  it('shows the counts to signed-in users only, who cannot change them', async () => {
    await ping('view');

    const signedOut = await booted.restClient.get<{ docs: unknown[] }>('/api/form-stats');

    expect(signedOut.status).toBe(403);

    await booted.frogbot.create({
      collection: 'users',
      data: { email: 'owner@example.com', password: 'secret-password' },
      overrideAccess: true,
    });

    const login = await booted.restClient.post<{ token: string }>('/api/users/login', {
      email: 'owner@example.com',
      password: 'secret-password',
    });

    const headers = { Authorization: `JWT ${login.body.token}` };

    const list = await booted.restClient.get<{ docs: Stats[] }>('/api/form-stats', { headers });

    expect(list.body.docs).toMatchObject([{ views: 1 }]);

    const id = (list.body.docs[0] as Stats & { id: number | string }).id;
    const edited = await booted.restClient.patch(
      `/api/form-stats/${id}`,
      { views: 999 },
      { headers },
    );

    expect(edited.status).toBe(403);
    expect(await stats()).toMatchObject([{ views: 1 }]);
  });

  it('deletes a form’s counts with the form', async () => {
    await ping('view');
    await booted.frogbot.delete({ collection: 'forms', id: form.id, overrideAccess: true });

    expect(await stats()).toEqual([]);
  });
});
