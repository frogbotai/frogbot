import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ImportColumn } from '@frogbotai/plugin-import-export';
import { ImportLookupError, resolveRelationship } from '@frogbotai/plugin-import-export';
import type { PayloadRequest } from 'payload';
import { createPayloadRequest } from 'payload';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { BootedFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { bootFrogBot } from '../__helpers/shared/bootFrogBot.js';
import { clearAndSeed } from '../__helpers/shared/clearAndSeed/index.js';
import { csv } from './harness.js';
import {
  brokenCompanyMessage,
  brokenCompanyName,
  companiesSlug,
  contactsSlug,
  hiddenCompanyName,
  importsDir,
  importsSlug,
  notesHookCalls,
  notesSlug,
  tagsSlug,
  usersSlug,
} from './shared.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const credentials = { email: 'ana@import.test', password: 'frogbot-import-password' };

type ID = number | string;

type Doc = Record<string, unknown> & { id: ID };

type ImportSummary = {
  imported?: number;
  issues?: number;
  issueDetails?: { error: string; row: number }[];
};

type ImportResult = Doc & { status: string; summary?: ImportSummary; headerKey?: string };

type ImportOptions = {
  collection?: string;
  columns?: ImportColumn[];
  importMode?: 'create' | 'update' | 'upsert';
  matchField?: string;
};

const name = (header: string, field: string | null): ImportColumn => ({ header, field });

const company = (header: string, matchBy = 'name', createMissing = false): ImportColumn => ({
  header,
  field: 'company',
  matchBy,
  createMissing,
});

describe('import column mapping', () => {
  let booted: BootedFrogBot;
  let ana: { id: ID; collection: string };
  let headers: Record<string, string>;

  beforeAll(async () => {
    booted = await bootFrogBot(dirname, 'plugin-import-export-mapping');
  });

  beforeEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');

    notesHookCalls.length = 0;

    const user = await booted.frogbot.create({
      collection: usersSlug,
      data: credentials,
      overrideAccess: true,
    } as never);

    ana = { id: (user as unknown as Doc).id, collection: usersSlug };

    const login = await booted.restClient.post<{ token: string }>(
      `/api/${usersSlug}/login`,
      credentials,
    );

    headers = { Authorization: `JWT ${login.body.token}` };
  });

  afterEach(async () => {
    await clearAndSeed(booted.frogbot, 'empty');
  });

  afterAll(async () => {
    await booted.shutdown();
    await rm(importsDir, { recursive: true, force: true });
  });

  function columnMap(rows: string[][], columns?: ImportColumn[]) {
    return columns && { headers: rows[0], columns };
  }

  async function importRows(rows: string[][], options: ImportOptions = {}): Promise<ImportResult> {
    const { collection = contactsSlug, columns, importMode = 'create', matchField } = options;
    const data = csv(rows);

    const created = (await booted.frogbot.create({
      collection: importsSlug,
      data: {
        collectionSlug: collection,
        importMode,
        ...(matchField && { matchField }),
        ...(columns && { columnMap: columnMap(rows, columns) }),
      },
      file: { data, mimetype: 'text/csv', name: `${collection}.csv`, size: data.length },
      user: ana,
      overrideAccess: true,
    } as never)) as unknown as Doc;

    await booted.frogbot.jobs.run({ overrideAccess: true });

    return (await booted.frogbot.findByID({
      collection: importsSlug,
      id: created.id,
      overrideAccess: true,
    } as never)) as unknown as ImportResult;
  }

  async function seed(collection: string, data: Record<string, unknown>): Promise<Doc> {
    return (await booted.frogbot.create({
      collection,
      data,
      overrideAccess: true,
    } as never)) as unknown as Doc;
  }

  async function all(collection: string, where = {}): Promise<Doc[]> {
    const found = await booted.frogbot.find({
      collection,
      where,
      depth: 0,
      limit: 100,
      sort: 'createdAt',
      overrideAccess: true,
    } as never);

    return found.docs as unknown as Doc[];
  }

  function errors(result: ImportResult): string[] {
    return (result.summary?.issueDetails ?? []).map(({ error }) => error);
  }

  it('maps foreign headers and links a company by name on the job path', async () => {
    const acme = await seed(companiesSlug, { name: 'Acme Corp' });

    const result = await importRows(
      [
        ['Full Name', 'Account Name', 'Ignored'],
        ['Ada Lovelace', 'Acme Corp', 'x'],
      ],
      { columns: [name('Full Name', 'name'), company('Account Name'), name('Ignored', null)] },
    );

    const [contact] = await all(contactsSlug);

    expect(result).toMatchObject({ status: 'completed', summary: { imported: 1 } });
    expect(result.headerKey).toBe(JSON.stringify(['Account Name', 'Full Name', 'Ignored']));
    expect(contact).toMatchObject({ name: 'Ada Lovelace', company: acme.id });
    expect(contact).not.toHaveProperty('Ignored');
  });

  it.each([
    ['without a column map', undefined],
    [
      'with an identity column map',
      [name('name', 'name'), { ...company('company', 'id') }, name('details_city', 'details.city')],
    ],
  ])('imports FrogBot-format headers %s as before', async (_label, columns) => {
    const acme = await seed(companiesSlug, { name: 'Acme Corp' });

    const result = await importRows(
      [
        ['name', 'company', 'details_city'],
        ['Grace Hopper', String(acme.id), 'Arlington'],
      ],
      { columns },
    );

    const [contact] = await all(contactsSlug);

    expect(result.status).toBe('completed');
    expect(contact).toMatchObject({
      name: 'Grace Hopper',
      company: acme.id,
      details: { city: 'Arlington' },
    });
  });

  it('maps a header with an underscore and links every name in a hasMany cell', async () => {
    const acme = await seed(tagsSlug, { name: 'Acme' });
    const globex = await seed(tagsSlug, { name: 'Globex' });

    const result = await importRows(
      [
        ['contact_name', 'Home_City', 'Tag Names'],
        ['Linus', 'Helsinki', 'Acme, Globex'],
      ],
      {
        columns: [
          name('contact_name', 'name'),
          name('Home_City', 'details.city'),
          { header: 'Tag Names', field: 'tags', matchBy: 'name' },
        ],
      },
    );

    const [contact] = await all(contactsSlug);

    expect(result.status).toBe('completed');
    expect(contact).toMatchObject({
      name: 'Linus',
      details: { city: 'Helsinki' },
      tags: [acme.id, globex.id],
    });
  });

  it('imports a header that equals a field name with an underscore', async () => {
    const result = await importRows(
      [
        ['first_name', 'Full Name'],
        ['Ada', 'Ada Lovelace'],
      ],
      { columns: [name('first_name', 'first_name'), name('Full Name', 'name')] },
    );

    const [contact] = await all(contactsSlug);

    expect(result.status).toBe('completed');
    expect(contact).toMatchObject({ first_name: 'Ada', name: 'Ada Lovelace' });
  });

  it('fails rows whose name matches no company or several, and the import ends partial', async () => {
    await seed(companiesSlug, { name: 'Acme Corp' });
    await seed(companiesSlug, { name: 'Twin' });
    await seed(companiesSlug, { name: 'Twin' });

    const result = await importRows(
      [
        ['Full Name', 'Company'],
        ['Kept', 'Acme Corp'],
        ['Missing', 'Acme Inc'],
        ['Doubled', 'Twin'],
      ],
      { columns: [name('Full Name', 'name'), company('Company')] },
    );

    expect(result).toMatchObject({ status: 'partial', summary: { imported: 1, issues: 2 } });
    expect(errors(result)).toEqual([
      'Company "Acme Inc": no companies record with name "Acme Inc"',
      'Company "Twin": 2 companies records with name "Twin"',
    ]);
    expect((await all(contactsSlug)).map((contact) => contact.name)).toEqual(['Kept']);
  });

  it('creates a missing company once for several rows, and a failed create fails only its rows', async () => {
    const result = await importRows(
      [
        ['Full Name', 'Company'],
        ['One', 'Initech'],
        ['Two', 'Initech'],
        ['Three', 'Initech'],
        ['Four', brokenCompanyName],
        ['Five', brokenCompanyName],
      ],
      { columns: [name('Full Name', 'name'), company('Company', 'name', true)] },
    );

    const companies = await all(companiesSlug);
    const contacts = await all(contactsSlug);

    expect(result).toMatchObject({ status: 'partial', summary: { imported: 3, issues: 2 } });
    expect(companies.map((entry) => entry.name)).toEqual(['Initech']);
    expect(contacts.map((contact) => contact.company)).toEqual([
      companies[0].id,
      companies[0].id,
      companies[0].id,
    ]);
    expect(errors(result)).toEqual([
      expect.stringContaining(`Company "${brokenCompanyName}": could not create companies record`),
      expect.stringContaining(`Company "${brokenCompanyName}": could not create companies record`),
    ]);
    expect(errors(result)[0]).toContain(brokenCompanyMessage);
  });

  it('links and creates as the importing user when another user runs the job', async () => {
    const bob = await seed(usersSlug, { email: 'bob@import.test', password: 'bob-password-1' });

    const rows = [
      ['Full Name', 'Company'],
      ['Ada', 'Initech'],
    ];

    const data = csv(rows);

    const created = (await booted.frogbot.create({
      collection: importsSlug,
      data: {
        collectionSlug: contactsSlug,
        importMode: 'create',
        columnMap: columnMap(rows, [name('Full Name', 'name'), company('Company', 'name', true)]),
      },
      file: { data, mimetype: 'text/csv', name: 'contacts.csv', size: data.length },
      user: ana,
      overrideAccess: true,
    } as never)) as unknown as Doc;

    const runner = await createPayloadRequest({
      payload: booted.payload,
      user: { ...bob, collection: usersSlug },
    });

    await booted.payload.jobs.run({ overrideAccess: true, req: runner });

    const [initech] = await all(companiesSlug);

    expect(
      await booted.frogbot.findByID({
        collection: importsSlug,
        id: created.id,
        overrideAccess: true,
      } as never),
    ).toMatchObject({ status: 'completed' });
    expect(initech).toMatchObject({ name: 'Initech', createdBy: { value: ana.id } });
  });

  it('never pairs a row with another line of the file after an empty row', async () => {
    const result = await importRows(
      [
        ['Full Name', 'Email Address'],
        ['Ada', 'ada@x.test'],
        ['', ''],
        ['Bob', 'bob@x.test'],
        ['Cy', 'cy@x.test'],
      ],
      { columns: [name('Full Name', 'name'), name('Email Address', 'email')] },
    );

    const contacts = await all(contactsSlug);

    expect(contacts.map((contact) => [contact.name, contact.email])).toEqual([
      ['Ada', 'ada@x.test'],
      ['Bob', 'bob@x.test'],
    ]);
    expect(result).toMatchObject({ status: 'partial', summary: { imported: 2, issues: 1 } });
    expect(errors(result)).toEqual([
      'This row could not be lined up with the file because of an empty row above it. Remove the empty rows and import the file again.',
    ]);
  });

  it('treats a company the importing user cannot read as no match', async () => {
    await seed(companiesSlug, { name: hiddenCompanyName });

    const result = await importRows(
      [
        ['Full Name', 'Company'],
        ['Hidden', hiddenCompanyName],
      ],
      { columns: [name('Full Name', 'name'), company('Company')] },
    );

    expect(result.status).toBe('failed');
    expect(errors(result)).toEqual([
      `Company "${hiddenCompanyName}": no companies record with name "${hiddenCompanyName}"`,
    ]);
  });

  it('previews linked and will-create cells without writing', async () => {
    await seed(companiesSlug, { name: 'Acme Corp' });

    const rows = [
      ['Full Name', 'Company'],
      ['Linked', 'Acme Corp'],
      ['Created', 'Initech'],
    ];

    const response = await booted.restClient.post<{ docs: Record<string, unknown>[] }>(
      `/api/${importsSlug}/preview-data`,
      {
        collectionSlug: contactsSlug,
        fileData: csv(rows).toString('base64'),
        format: 'csv',
        formData: {
          collectionSlug: contactsSlug,
          importMode: 'create',
          columnMap: columnMap(rows, [name('Full Name', 'name'), company('Company', 'name', true)]),
        },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    expect(response.body.docs).toEqual([
      { name: 'Linked', company: 'Acme Corp · linked' },
      { name: 'Created', company: 'Initech · will create' },
    ]);
    expect((await all(companiesSlug)).map((entry) => entry.name)).toEqual(['Acme Corp']);
    expect(await all(contactsSlug)).toEqual([]);
  });

  it("runs before the app's hooks.before, which sees FrogBot keys, on the sync path", async () => {
    const acme = await seed(companiesSlug, { name: 'Acme Corp' });

    const result = await importRows(
      [
        ['Subject', 'Account'],
        ['Kickoff', 'Acme Corp'],
        ['Orphan', 'Nobody'],
      ],
      {
        collection: notesSlug,
        columns: [name('Subject', 'title'), company('Account')],
      },
    );

    const notes = await all(notesSlug);

    expect(result).toMatchObject({ status: 'partial', summary: { imported: 1, issues: 1 } });
    expect(errors(result)).toEqual(['Account "Nobody": no companies record with name "Nobody"']);
    expect(notes).toEqual([expect.objectContaining({ title: 'Kickoff', company: acme.id })]);
    expect(notesHookCalls).toHaveLength(1);
    expect(notesHookCalls[0][0]).toEqual({ title: 'Kickoff', company: acme.id });
    expect(notesHookCalls[0][1]).toMatchObject({ title: 'Orphan' });
  });

  describe('resolveRelationship', () => {
    let req: PayloadRequest;

    beforeEach(async () => {
      const user = await booted.payload.findByID({
        collection: usersSlug,
        id: ana.id,
        overrideAccess: true,
      });

      req = await createPayloadRequest({
        payload: booted.payload,
        user: { ...user, collection: usersSlug },
      });
    });

    it('finds a record by a field', async () => {
      const acme = await seed(companiesSlug, { name: 'Acme Corp', domain: 'acme.test' });

      await expect(
        resolveRelationship({
          req,
          collection: companiesSlug,
          field: 'domain',
          value: 'acme.test',
        }),
      ).resolves.toBe(acme.id);
    });

    it('creates one record for two calls with one value on one request', async () => {
      const args = { req, collection: companiesSlug, field: 'name', value: 'Umbrella' };

      const [first, second] = await Promise.all([
        resolveRelationship({ ...args, createMissing: true }),
        resolveRelationship({ ...args, createMissing: true }),
      ]);

      const third = await resolveRelationship(args);

      expect(second).toBe(first);
      expect(third).toBe(first);
      expect((await all(companiesSlug)).map((entry) => entry.name)).toEqual(['Umbrella']);
    });

    it('throws when several records match', async () => {
      await seed(companiesSlug, { name: 'Twin' });
      await seed(companiesSlug, { name: 'Twin' });

      const lookup = resolveRelationship({
        req,
        collection: companiesSlug,
        field: 'name',
        value: 'Twin',
        createMissing: true,
      });

      await expect(lookup).rejects.toThrow(ImportLookupError);
      await expect(lookup).rejects.toThrow('2 companies records with name "Twin"');
      expect(await all(companiesSlug)).toHaveLength(2);
    });
  });
});
