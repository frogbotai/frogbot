import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createSalesforce } from '../../../packages/pieces/piece-salesforce/src/index.js';
import { body, calls, data, instance, json, path, query, req, stubSalesforce } from './fixtures.js';

const salesforce = createSalesforce({});

type Run = (args: { input: Record<string, unknown>; req: unknown }) => Promise<unknown>;

function action(slug: string) {
  return (salesforce as unknown as Record<string, Run>)[slug];
}

afterEach(() => vi.unstubAllGlobals());

const account = (id: string) => ({
  attributes: { type: 'Account' },
  Id: id,
  Name: `Account ${id}`,
});

describe('query', () => {
  it('pages through three pages to a null nextRecordsUrl', async () => {
    const pages: Record<string, object> = {
      [`${data}/query`]: {
        totalSize: 5,
        done: false,
        records: [account('1'), account('2')],
        nextRecordsUrl: `${data}/query/01gD0000002HU6KIAW-2000`,
      },
      [`${data}/query/01gD0000002HU6KIAW-2000`]: {
        totalSize: 5,
        done: false,
        records: [account('3'), account('4')],
        nextRecordsUrl: `${data}/query/01gD0000002HU6KIAW-4000`,
      },
      [`${data}/query/01gD0000002HU6KIAW-4000`]: {
        totalSize: 5,
        done: true,
        records: [account('5')],
      },
    };

    stubSalesforce((call) => json(pages[path(call)]));

    const ids: unknown[] = [];
    let page = (await action('query')({
      input: { soql: 'SELECT Id, Name FROM Account ORDER BY Id', batchSize: 200 },
      req: req(),
    })) as { records: { Id: string }[]; nextRecordsUrl: string | null; done: boolean };

    ids.push(...page.records.map((record) => record.Id));

    while (page.nextRecordsUrl) {
      page = (await action('query')({
        input: { nextRecordsUrl: page.nextRecordsUrl },
        req: req(),
      })) as typeof page;

      ids.push(...page.records.map((record) => record.Id));
    }

    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    expect(page).toMatchObject({ done: true, nextRecordsUrl: null, totalSize: 5 });
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => new URL(call.url).origin === instance)).toBe(true);
    expect(query(calls[0])).toEqual({ q: 'SELECT Id, Name FROM Account ORDER BY Id' });
    expect(calls[0]?.headers.get('sforce-query-options')).toBe('batchSize=200');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer salesforce-token');
  });

  it('reads deleted records through queryAll', async () => {
    stubSalesforce(() => json({ totalSize: 0, done: true, records: [] }));

    await action('query')({
      input: { soql: 'SELECT Id FROM Account', queryAll: true },
      req: req(),
    });

    expect(path(calls[0])).toBe(`${data}/queryAll`);
  });

  it.each([
    'https://evil.example.com/services/data/v68.0/query/01g-2000',
    '//evil.example.com/services/data/v68.0/query/01g-2000',
    '/services/data/../../secret',
    '/services/apexrest/steal',
    '/services/data/v68.0/query/01g\\..\\x',
  ])('refuses nextRecordsUrl %s before any request', async (nextRecordsUrl) => {
    stubSalesforce(() => json({}));

    await expect(action('query')({ input: { nextRecordsUrl }, req: req() })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('refuses a page size outside 200 to 2,000', async () => {
    stubSalesforce(() => json({}));

    await expect(
      action('query')({ input: { soql: 'SELECT Id FROM Account', batchSize: 100 }, req: req() }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('listObjects and describeObject', () => {
  it('lists objects with whether they are custom and queryable', async () => {
    stubSalesforce(() =>
      json({
        encoding: 'UTF-8',
        sobjects: [
          {
            name: 'Account',
            label: 'Account',
            custom: false,
            queryable: true,
            createable: true,
            keyPrefix: '001',
          },
          {
            name: 'Invoice__c',
            label: 'Invoice',
            custom: true,
            queryable: true,
            createable: true,
            keyPrefix: 'a01',
          },
        ],
      }),
    );

    await expect(action('listObjects')({ input: {}, req: req() })).resolves.toEqual({
      objects: [
        {
          name: 'Account',
          label: 'Account',
          custom: false,
          queryable: true,
          createable: true,
          keyPrefix: '001',
        },
        {
          name: 'Invoice__c',
          label: 'Invoice',
          custom: true,
          queryable: true,
          createable: true,
          keyPrefix: 'a01',
        },
      ],
    });
    expect(path(calls[0])).toBe(`${data}/sobjects`);
  });

  it('maps custom fields and lookups', async () => {
    stubSalesforce(() =>
      json({
        name: 'Invoice__c',
        label: 'Invoice',
        custom: true,
        queryable: true,
        createable: true,
        fields: [
          {
            name: 'Account__c',
            label: 'Account',
            type: 'reference',
            custom: true,
            createable: true,
            referenceTo: ['Account'],
            relationshipName: 'Account__r',
            length: 18,
          },
          {
            name: 'Name',
            label: 'Invoice Name',
            type: 'string',
            custom: false,
            createable: true,
            referenceTo: [],
            relationshipName: null,
          },
        ],
        childRelationships: [
          { childSObject: 'Line__c', field: 'Invoice__c', relationshipName: 'Lines__r' },
        ],
      }),
    );

    const described = (await action('describeObject')({
      input: { object: 'Invoice__c' },
      req: req(),
    })) as { fields: object[]; notModified: boolean };

    expect(described).toMatchObject({ name: 'Invoice__c', custom: true, notModified: false });
    expect(described.fields[0]).toEqual({
      name: 'Account__c',
      label: 'Account',
      type: 'reference',
      custom: true,
      createable: true,
      referenceTo: ['Account'],
      relationshipName: 'Account__r',
    });
    expect(path(calls[0])).toBe(`${data}/sobjects/Invoice__c/describe`);
    expect(calls[0]?.headers.has('if-modified-since')).toBe(false);
  });

  it('returns notModified on a 304', async () => {
    stubSalesforce(() => new Response(null, { status: 304 }));

    await expect(
      action('describeObject')({
        input: { object: 'Account', ifModifiedSince: '2026-01-02T03:04:05Z' },
        req: req(),
      }),
    ).resolves.toEqual({ notModified: true });
    expect(calls[0]?.headers.get('if-modified-since')).toBe('Fri, 02 Jan 2026 03:04:05 GMT');
  });

  it('refuses an object name that is not an API name', async () => {
    stubSalesforce(() => json({}));

    await expect(
      action('describeObject')({ input: { object: '../limits' }, req: req() }),
    ).rejects.toThrow('Object must be a Salesforce API name');
    expect(calls).toHaveLength(0);
  });
});

describe('Bulk API 2.0 query', () => {
  it('creates a job, checks it and reads two CSV pages to a null locator', async () => {
    stubSalesforce((call) => {
      if (call.method === 'POST') {
        return json({
          id: '750R0000000zlh9IAA',
          state: 'UploadComplete',
          operation: 'query',
          object: 'Account',
        });
      }

      if (path(call).endsWith('/results')) {
        const second = query(call).locator === 'MTAwMDA';

        return new Response(
          second ? '"Id","Name"\n"3","Gamma"\n' : '"Id","Name"\n"1","Alpha"\n"2",""\n',
          {
            headers: { 'content-type': 'text/csv', 'sforce-locator': second ? 'null' : 'MTAwMDA' },
          },
        );
      }

      return json({ id: '750R0000000zlh9IAA', state: 'JobComplete', numberRecordsProcessed: 3 });
    });

    await expect(
      action('createQueryJob')({ input: { soql: 'SELECT Id, Name FROM Account' }, req: req() }),
    ).resolves.toMatchObject({ id: '750R0000000zlh9IAA', state: 'UploadComplete' });
    expect(body(calls[0])).toEqual({ operation: 'query', query: 'SELECT Id, Name FROM Account' });
    expect(path(calls[0])).toBe(`${data}/jobs/query`);

    await expect(
      action('getQueryJob')({ input: { id: '750R0000000zlh9IAA' }, req: req() }),
    ).resolves.toMatchObject({ state: 'JobComplete', numberRecordsProcessed: 3 });

    const first = await action('getQueryJobResults')({
      input: { id: '750R0000000zlh9IAA', maxRecords: 2 },
      req: req(),
    });

    expect(first).toEqual({
      records: [
        { Id: '1', Name: 'Alpha' },
        { Id: '2', Name: '' },
      ],
      locator: 'MTAwMDA',
    });
    expect(query(calls[2])).toEqual({ maxRecords: '2' });
    expect(calls[2]?.headers.get('accept')).toBe('text/csv');

    await expect(
      action('getQueryJobResults')({
        input: { id: '750R0000000zlh9IAA', locator: 'MTAwMDA', maxRecords: 2 },
        req: req(),
      }),
    ).resolves.toEqual({ records: [{ Id: '3', Name: 'Gamma' }], locator: null });
  });
});
