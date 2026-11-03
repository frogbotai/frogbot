import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ImportColumn, ImportColumnsResponse } from '@frogbotai/plugin-import-export';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { csv, signIn } from './harness.js';
import { contactsSlug, importsDir, importsSlug } from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

type Session = Awaited<ReturnType<typeof signIn>>;

const accountColumn: ImportColumn = {
  header: 'Account',
  field: 'company',
  matchBy: 'domain',
  createMissing: true,
};

describe('import columns endpoint', () => {
  let booted: BootedFrogBot;
  let ana: Session;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-import-export-columns');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    ana = await signIn(booted, 'ana@import.test');
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
  });

  function post<T>(endpoint: string, rows: string[][], headers?: Record<string, string>) {
    return booted.restClient.post<T & { error?: string }>(
      `/api/${importsSlug}/${endpoint}`,
      { collectionSlug: contactsSlug, fileData: csv(rows).toString('base64'), format: 'csv' },
      { headers },
    );
  }

  async function saveImport(
    session: Session,
    rows: string[][],
    columns: ImportColumn[],
    createdAt?: string,
  ) {
    const data = csv(rows);

    await booted.frogbot.create({
      collection: importsSlug,
      data: {
        collectionSlug: contactsSlug,
        columnMap: { headers: rows[0], columns },
        ...(createdAt && { createdAt }),
      },
      file: { data, mimetype: 'text/csv', name: 'contacts.csv', size: data.length },
      user: session.user,
      overrideAccess: false,
    } as never);
  }

  it('returns headers, samples and targets, and matches a new header set by name', async () => {
    const response = await post<ImportColumnsResponse>(
      'import-columns',
      [
        ['Name', 'E-mail', 'Company', 'details_city', 'Notes'],
        ['Ada', 'ada@example.test', 'Acme', 'London', ''],
        ['Linus', 'linus@example.test', 'Globex, Initech', 'Helsinki', 'hi'],
        ['Grace', '', 'Acme', 'Arlington', ''],
        ['Ken', 'ken@example.test', 'Bell', 'Murray Hill', ''],
      ],
      ana.headers,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      headers: ['Name', 'E-mail', 'Company', 'details_city', 'Notes'],
      samples: {
        Name: ['Ada', 'Linus', 'Grace'],
        'E-mail': ['ada@example.test', 'linus@example.test', 'ken@example.test'],
        Company: ['Acme', 'Globex, Initech', 'Acme'],
        Notes: ['hi'],
      },
      source: 'names',
      columns: [
        { header: 'Name', field: 'name' },
        { header: 'E-mail', field: 'email' },
        { header: 'Company', field: 'company', matchBy: 'name', createMissing: false },
        { header: 'details_city', field: 'details.city' },
        { header: 'Notes', field: null },
      ],
    });
    expect(response.body.targets.find(({ field }) => field === 'company')).toEqual({
      field: 'company',
      label: 'Company',
      type: 'relationship',
      hasMany: false,
      relationship: {
        collection: 'companies',
        matchBy: [
          { field: 'name', label: 'Name' },
          { field: 'domain', label: 'Domain' },
          { field: 'id', label: 'ID' },
        ],
        defaultMatchBy: 'name',
      },
    });
  });

  it('starts from the latest import with the same headers in any order', async () => {
    await saveImport(
      ana,
      [
        ['Full Name', 'Account'],
        ['Ada', 'acme.test'],
      ],
      [{ header: 'Full Name', field: 'email' }, accountColumn],
      '2026-01-01T00:00:00.000Z',
    );

    await saveImport(
      ana,
      [
        ['Full Name', 'Account'],
        ['Ada', 'acme.test'],
      ],
      [{ header: 'Full Name', field: 'name' }, accountColumn],
    );

    const response = await post<ImportColumnsResponse>(
      'import-columns',
      [
        ['Account', 'Full Name'],
        ['globex.test', 'Linus'],
      ],
      ana.headers,
    );

    expect(response.body.source).toBe('previous');
    expect(response.body.columns).toEqual([accountColumn, { header: 'Full Name', field: 'name' }]);
  });

  it('falls back to names for a different header set', async () => {
    await saveImport(
      ana,
      [['Full Name', 'Account']],
      [{ header: 'Full Name', field: 'name' }, accountColumn],
    );

    const response = await post<ImportColumnsResponse>(
      'import-columns',
      [['Full Name', 'Account', 'Email']],
      ana.headers,
    );

    expect(response.body.source).toBe('names');
    expect(response.body.columns).toEqual([
      { header: 'Full Name', field: null },
      { header: 'Account', field: null },
      { header: 'Email', field: 'email' },
    ]);
  });

  it("doesn't reuse another user's import they can't read", async () => {
    await saveImport(
      ana,
      [['Full Name', 'Account']],
      [{ header: 'Full Name', field: 'name' }, accountColumn],
    );

    const bob = await signIn(booted, 'bob@import.test');

    const response = await post<ImportColumnsResponse>(
      'import-columns',
      [['Account', 'Full Name']],
      bob.headers,
    );

    expect(response.body.source).toBe('names');
  });

  it('refuses a request that may not create an import', async () => {
    const response = await post('import-columns', [['Name']]);

    expect(response.status).toBe(403);
  });

  it('refuses a collection this import collection does not serve', async () => {
    const response = await booted.restClient.post<{ error: string }>(
      `/api/${importsSlug}/import-columns`,
      { collectionSlug: 'users', fileData: csv([['email']]).toString('base64'), format: 'csv' },
      { headers: ana.headers },
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(`Collection "users" can't be imported here.`);
  });

  it('has no AI suggestion endpoint without an AI model', async () => {
    const response = await post('suggest-columns', [['Name']], ana.headers);

    expect(response.status).toBe(404);
  });
});
