import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ImportColumn, SuggestColumnsResponse } from '@frogbotai/plugin-import-export';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../../__helpers/shared/clearAndSeed/index.js';
import type { StubChatModel } from '../../__helpers/shared/StubChatModel.js';
import { startStubChatModel } from '../../__helpers/shared/StubChatModel.js';
import { csv, signIn } from '../harness.js';
import { contactsSlug, importsDir, importsSlug, modelPort } from '../shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const rows = [
  ['Full Name', 'Account Name', 'Town', 'Acct Owner', 'Phone', 'email'],
  ['Ada', 'Acme', 'London', 'Grace', '555-0100', 'ada@example.test'],
];

const sent: ImportColumn[] = [
  { header: 'Full Name', field: 'name' },
  { header: 'Account Name', field: null },
  { header: 'Town', field: null },
  { header: 'Acct Owner', field: null },
  { header: 'Phone', field: null },
  { header: 'email', field: 'email' },
];

describe('AI column suggestions', () => {
  let booted: BootedFrogBot;
  let model: StubChatModel;
  let headers: Record<string, string>;

  beforeAll(async () => {
    model = await startStubChatModel(modelPort);
    booted = await bootFrogBot(dirname, 'plugin-import-export-ai');

    await clearAndSeed(booted.frogbot, 'empty');

    ({ headers } = await signIn(booted, 'ana@import.test'));
  });

  afterEach(() => {
    model.reset();
  });

  afterAll(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
    await booted.shutdown();
    await model.close();
    await rm(importsDir, { recursive: true, force: true });
  });

  function suggest(columns: ImportColumn[]) {
    return booted.restClient.post<SuggestColumnsResponse>(
      `/api/${importsSlug}/suggest-columns`,
      {
        collectionSlug: contactsSlug,
        fileData: csv(rows).toString('base64'),
        format: 'csv',
        columns,
      },
      { headers },
    );
  }

  it('fills only "Skip" columns, dropping unknown and already-used fields', async () => {
    model.respondTitle({
      text: JSON.stringify({
        'Full Name': 'email',
        'Account Name': 'company',
        Town: 'details.city',
        'Acct Owner': 'owner',
        Phone: 'email',
      }),
    });

    const response = await suggest(sent);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      suggested: 2,
      columns: [
        { header: 'Full Name', field: 'name' },
        { header: 'Account Name', field: 'company', matchBy: 'name', createMissing: false },
        { header: 'Town', field: 'details.city' },
        { header: 'Acct Owner', field: null },
        { header: 'Phone', field: null },
        { header: 'email', field: 'email' },
      ],
    });

    const [request] = model.titleRequests;
    const prompt = JSON.parse(String(request.messages.at(-1)?.content)) as {
      columns: { header: string; samples: unknown[] }[];
      fields: { field: string }[];
    };

    expect(request.model).toBe('mapper');
    expect(prompt.columns).toEqual([
      { header: 'Account Name', samples: ['Acme'] },
      { header: 'Town', samples: ['London'] },
      { header: 'Acct Owner', samples: ['Grace'] },
      { header: 'Phone', samples: ['555-0100'] },
    ]);

    const fields = prompt.fields.map(({ field }) => field);

    expect(fields).toEqual(expect.arrayContaining(['company', 'tags', 'details.city']));
    expect(fields).not.toContain('name');
    expect(fields).not.toContain('email');
  });

  it('returns the mapping unchanged with a message when the model fails', async () => {
    model.respondTitle({ text: '', error: { status: 400, body: { error: { message: 'bad' } } } });

    const response = await suggest(sent);

    expect(response.status).toBe(502);
    expect(response.body.columns).toEqual(sent);
    expect(response.body.suggested).toBe(0);
    expect(response.body.error).toMatch(/^AI suggestion failed: /);
  });

  it('calls no model when no column is "Skip"', async () => {
    const full: ImportColumn[] = [
      { header: 'Full Name', field: 'name' },
      { header: 'email', field: 'email' },
    ];

    const response = await booted.restClient.post<SuggestColumnsResponse>(
      `/api/${importsSlug}/suggest-columns`,
      {
        collectionSlug: contactsSlug,
        fileData: csv([['Full Name', 'email']]).toString('base64'),
        format: 'csv',
        columns: full,
      },
      { headers },
    );

    expect(response.body).toEqual({ columns: full, suggested: 0 });
    expect(model.titleRequests).toEqual([]);
  });
});
