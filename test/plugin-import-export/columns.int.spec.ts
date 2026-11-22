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
    return booted.restClient.post<T>(
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

  type ErrorBody = { errors: { message: string; data: Record<string, unknown> }[] };

  function postBody(body: Record<string, unknown>, headers = ana.headers) {
    return booted.restClient.post<ErrorBody & Partial<ImportColumnsResponse>>(
      `/api/${importsSlug}/import-columns`,
      { collectionSlug: contactsSlug, ...body },
      { headers },
    );
  }

  const json = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

  it('refuses a request that may not create an import', async () => {
    const response = await post<ErrorBody>('import-columns', [['Name']]);

    expect(response.status).toBe(403);
    expect(response.body.errors).toMatchObject([
      { message: 'You are not allowed to import.', data: { code: 'import_not_allowed' } },
    ]);
  });

  it('refuses a collection this import collection does not serve, listing the ones it does', async () => {
    const response = await postBody({
      collectionSlug: 'users',
      fileData: csv([['email']]).toString('base64'),
      format: 'csv',
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toMatchObject([
      {
        message: `Collection "users" can't be imported here. Importable: companies, tags, contacts, notes.`,
        data: {
          code: 'collection_not_importable',
          allowed: ['companies', 'tags', 'contacts', 'notes'],
        },
      },
    ]);
  });

  it('says the file goes in base64 fileData when it is missing', async () => {
    const response = await postBody({ format: 'csv' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toMatchObject([
      {
        message: 'No file data provided: send the file base64-encoded as `fileData`.',
        data: { code: 'file_data_missing' },
      },
    ]);
  });

  it.each(['xlsx', 'CSV', 5, null])(
    'refuses the format %j instead of reading it as CSV',
    async (format) => {
      const response = await postBody({ fileData: csv([['Name']]).toString('base64'), format });

      expect(response.status).toBe(400);
      expect(response.body.errors).toMatchObject([
        {
          message: `Unsupported format ${JSON.stringify(format)}. Use "csv" or "json".`,
          data: { code: 'unsupported_format', allowed: ['csv', 'json'] },
        },
      ]);
    },
  );

  it('reads a file with no format as CSV', async () => {
    const response = await postBody({ fileData: csv([['Full Name'], ['Ana']]).toString('base64') });

    expect(response.status).toBe(200);
    expect(response.body.headers).toEqual(['Full Name']);
  });

  it('names the first JSON item that is not an object', async () => {
    const response = await postBody({ fileData: json([{ a: 1 }, 5, 'x']), format: 'json' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toMatchObject([
      {
        message: 'Could not read the file: Item 2 is not an object (got number).',
        data: { code: 'file_unreadable' },
      },
    ]);
  });

  it('refuses a JSON file that is not an array as unreadable', async () => {
    const response = await postBody({ fileData: json({ a: 1 }), format: 'json' });

    expect(response.status).toBe(400);
    expect(response.body.errors).toMatchObject([
      {
        message: 'Could not read the file: A JSON import must be an array of objects.',
        data: { code: 'file_unreadable' },
      },
    ]);
  });

  it('has no AI suggestion endpoint without an AI model', async () => {
    const response = await post('suggest-columns', [['Name']], ana.headers);

    expect(response.status).toBe(404);
  });
});
