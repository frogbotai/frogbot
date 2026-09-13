import type { FrogbotRequest } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));
vi.mock(
  '@frogbotai/piece-google',
  () => import('../../../packages/pieces/piece-google/src/index.js'),
);

import { runKVLock } from '../../../packages/frogbot/src/kv/lock.js';
import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createGoogleSheets,
  googleSheetsActions,
  googleSheetsScopes,
} from '../../../packages/pieces/piece-google-sheets/src/index.js';
import {
  columnIndex,
  columnLabel,
} from '../../../packages/pieces/piece-google-sheets/src/shared.js';

const auth = { accessToken: 'access-test', refreshToken: 'refresh-test' };
const selection = { spreadsheetId: 'book', sheetId: 0 };
const title = "Owner's sheet";
const properties = {
  sheetId: 0,
  title,
  index: 0,
  gridProperties: { rowCount: 100, columnCount: 26 },
};

async function fixture({
  slug = 'google-sheets',
  user = null as null | { id: number; collection: string },
} = {}) {
  const state = new Map<string, unknown>();
  const leases = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string) => state.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      state.set(key, value);
    }),
    acquireLock: vi.fn(async (key: string) => {
      if (leases.has(key)) return null;
      leases.set(key, 'lease');
      return { key, token: 'lease' };
    }),
    extendLock: vi.fn(async ({ key }: { key: string }) => leases.has(key)),
    releaseLock: vi.fn(async ({ key }: { key: string }) => leases.delete(key)),
    lock: async <T>(key: string, ttl: number, fn: (args: { signal: AbortSignal }) => Promise<T>) =>
      runKVLock({ kv, key, ttl, fn }),
  };
  const piece = createGoogleSheets({ auth, slug });
  const findByID = vi.fn().mockResolvedValue({
    id: 'file',
    url: '/files/source.csv',
    filename: 'source.csv',
    mimeType: 'text/csv',
  });
  const create = vi.fn().mockResolvedValue({ id: 'saved', url: '/files/export.csv' });
  const key = {};
  const req = {
    url: 'https://app.test/api',
    headers: new Headers({ authorization: 'Bearer app', cookie: 'session=app' }),
    signal: new AbortController().signal,
    user,
    frogbot: {
      kv,
      findByID,
      create,
      config: {
        pieces: { instances: [piece] },
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key }) },
    },
  } as unknown as FrogbotRequest;
  const client = await piece.client({ req });
  const rows: unknown[][] = [
    ['Name', 'Count', ''],
    ['Alice', 0, false],
    [],
    ['alice smith', 2],
    ['Bob', 3],
  ];
  const respond = (
    data: unknown,
    config: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) => ({ data, config, status, statusText: 'OK', headers: new Headers(headers) });
  const transport = vi.fn(async (config: any) => {
    const url = new URL(String(config.url));
    const path = decodeURIComponent(url.pathname);
    if (url.hostname === 'docs.google.com') {
      return respond(Buffer.from('Name,Count\r\nAlice,"1,234.50"\r\n'), config);
    }
    if (path === '/drive/v3/files') {
      return config.method === 'POST'
        ? respond({ id: 'created', name: config.data.name }, config)
        : respond({ files: [{ id: 'book', name: 'Budget' }] }, config);
    }
    if (path.endsWith('/sheets/0:copyTo')) {
      return respond({ ...properties, sheetId: 9, title: `Copy of ${title}` }, config);
    }
    if (path.endsWith('/book:batchUpdate')) {
      const requests = config.data.requests;
      return respond(
        {
          spreadsheetId: 'book',
          replies: requests.map((request: any) =>
            request.addSheet
              ? {
                  addSheet: {
                    properties: {
                      ...properties,
                      sheetId: 9,
                      title: request.addSheet.properties.title,
                    },
                  },
                }
              : {},
          ),
        },
        config,
      );
    }
    if (path.endsWith('/values:batchUpdate')) {
      return respond(
        {
          spreadsheetId: 'book',
          totalUpdatedRows: config.data.data.length,
          totalUpdatedCells: 3,
          responses: config.data.data.map((entry: any) => ({ updatedRange: entry.range })),
        },
        config,
      );
    }
    if (path.endsWith('/values:batchClear')) {
      return respond({ spreadsheetId: 'book', clearedRanges: config.data.ranges }, config);
    }
    if (path.includes('/values/')) {
      const range = path.split('/values/')[1]!;
      if (path.endsWith(':append')) {
        return respond(
          {
            spreadsheetId: 'book',
            updates: {
              updatedRange: `'Owner''s sheet'!A6:C6`,
              updatedRows: config.data.values.length,
            },
          },
          config,
        );
      }
      if (path.endsWith(':clear')) {
        return respond({ spreadsheetId: 'book', clearedRange: range.slice(0, -6) }, config);
      }
      if (config.method === 'PUT') {
        return respond(
          { spreadsheetId: 'book', updatedRange: range, updatedRows: config.data.values.length },
          config,
        );
      }
      const coordinates = range.split('!')[1];
      const numbers = coordinates?.match(/^(?:[A-Z]+)?(\d+):(?:[A-Z]+)?(\d+)?$/);
      const values = numbers
        ? rows.slice(Number(numbers[1]) - 1, numbers[2] ? Number(numbers[2]) : undefined)
        : [...rows];
      while (
        values.length &&
        !values[values.length - 1]?.some((value) => value != null && value !== '')
      ) {
        values.pop();
      }
      const oriented =
        config.params?.majorDimension === 'COLUMNS'
          ? Array.from({ length: Math.max(0, ...values.map((row) => row.length)) }, (_, index) =>
              values.map((row) => row[index] ?? ''),
            )
          : values;
      return respond(
        { range, majorDimension: config.params?.majorDimension ?? 'ROWS', values: oriented },
        config,
      );
    }
    if (path === '/v4/spreadsheets/book') {
      return respond(
        {
          spreadsheetId: 'book',
          sheets: [{ properties }, { properties: { ...properties, sheetId: 7, title: 'Other' } }],
        },
        config,
      );
    }
    return respond({ ok: true }, config);
  });
  client.auth.transporter.request = transport as typeof client.auth.transporter.request;
  return { piece, client, req, kv, state, leases, transport, respond, rows, findByID, create };
}

function calls(transport: Awaited<ReturnType<typeof fixture>>['transport'], suffix: string) {
  return transport.mock.calls
    .map(([config]) => config)
    .filter((config) => decodeURIComponent(new URL(String(config.url)).pathname).endsWith(suffix));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('native Google Sheets', () => {
  it('exposes all 27 native actions, no triggers, shared Google OAuth, and secret auth', async () => {
    const { piece, client } = await fixture();
    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      googleSheetsActions.map((slug) => `google-sheets_${slug}`),
    );
    expect(googleSheetsActions).toHaveLength(27);
    expect(piece.triggers).toEqual({});
    const definition = pieceFactoryDefinition(createGoogleSheets);
    expect(definition.oauth).toMatchObject({
      scopes: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        ...googleSheetsScopes,
      ],
      params: { access_type: 'offline', prompt: 'consent' },
    });
    expect(
      definition.oauth?.toAuth?.({ tokens: { access_token: 'a', refresh_token: 'r' } }),
    ).toEqual({ accessToken: 'a', refreshToken: 'r' });
    expect(client.auth.credentials).toEqual({ access_token: 'access-test' });
    expect(() => createGoogleSheets({ auth: { accessToken: '' } })).toThrow();
  });

  it('passes the native conformance harness with provider responses for every stateless action', async () => {
    const { client, transport } = await fixture();
    vi.spyOn(Object.getPrototypeOf(client.auth.transporter), 'request').mockImplementation(
      transport,
    );
    const appended = {
      row: 6,
      updates: { updatedRange: "'Owner''s sheet'!A6:C6", updatedRows: 1 },
    };
    const updated = {
      row: 2,
      updates: { spreadsheetId: 'book', updatedRange: "'Owner''s sheet'!2:2", updatedRows: 1 },
    };
    const batch = { spreadsheetId: 'book', replies: [{}] };
    const row = { row: 2, values: { A: 'Alice', B: '0', C: 'false' } };
    const fixtures = [
      { slug: 'appendRow', input: { ...selection, values: ['x'] }, result: appended },
      { slug: 'insertRow', input: { ...selection, values: ['x'] }, result: updated },
      {
        slug: 'appendRows',
        input: { ...selection, data: { format: 'columns', rows: [['x']] } },
        result: { insertedRows: 1, updates: appended.updates },
      },
      { slug: 'updateRow', input: { ...selection, row: 2, values: ['x'] }, result: updated },
      {
        slug: 'updateRows',
        input: { ...selection, rows: [{ row: 2, values: ['x'] }] },
        result: {
          spreadsheetId: 'book',
          totalUpdatedRows: 1,
          totalUpdatedCells: 3,
          responses: [{ updatedRange: "'Owner''s sheet'!2:2" }],
        },
      },
      { slug: 'deleteRow', input: { ...selection, row: 2 }, result: batch },
      {
        slug: 'deleteRows',
        input: { ...selection, selection: { mode: 'list', rows: [2] } },
        result: { deletedRanges: [{ startRow: 2, endRow: 2 }], result: batch },
      },
      {
        slug: 'findRows',
        input: { ...selection, searchValue: 'Alice', exactMatch: true },
        result: [row],
      },
      {
        slug: 'findOrCreateRow',
        input: { ...selection, searchValue: 'Alice', exactMatch: true, values: ['unused'] },
        result: { ...row, found: true, created: false },
      },
      {
        slug: 'createSpreadsheet',
        input: { title: 'New' },
        result: { id: 'created', name: 'New' },
      },
      {
        slug: 'createWorksheet',
        input: { spreadsheetId: 'book', title: 'New' },
        result: { ...properties, sheetId: 9, title: 'New' },
      },
      {
        slug: 'findOrCreateWorksheet',
        input: { spreadsheetId: 'book', title },
        result: { found: true, created: false, worksheet: properties },
      },
      {
        slug: 'clearWorksheet',
        input: selection,
        result: { spreadsheetId: 'book', clearedRange: "'Owner''s sheet'!A1:ZZZ" },
      },
      {
        slug: 'clearRows',
        input: { ...selection, startRow: 2 },
        result: { spreadsheetId: 'book', clearedRange: "'Owner''s sheet'!2:2" },
      },
      { slug: 'deleteWorksheet', input: selection, result: batch },
      { slug: 'renameWorksheet', input: { ...selection, title: 'New' }, result: batch },
      { slug: 'formatRows', input: { ...selection, startRow: 2, bold: true }, result: batch },
      { slug: 'getRow', input: { ...selection, row: 2 }, result: { found: true, ...row } },
      {
        slug: 'getRows',
        input: { ...selection, skipHeaders: true },
        result: [
          row,
          { row: 3, values: { A: '', B: '', C: '' } },
          { row: 4, values: { A: 'alice smith', B: '2', C: '' } },
          { row: 5, values: { A: 'Bob', B: '3', C: '' } },
        ],
      },
      {
        slug: 'readRange',
        input: { ...selection, range: '2:2' },
        result: {
          range: "'Owner''s sheet'!2:2",
          majorDimension: 'ROWS',
          values: [['Alice', 0, false]],
        },
      },
      {
        slug: 'findSpreadsheets',
        input: { name: 'Budget' },
        result: { found: true, spreadsheets: [{ id: 'book', name: 'Budget' }] },
      },
      {
        slug: 'findWorksheets',
        input: { spreadsheetId: 'book', title, exactMatch: true },
        result: { found: true, worksheets: [properties] },
      },
      {
        slug: 'copyWorksheet',
        input: { ...selection, destinationSpreadsheetId: 'destination' },
        result: { ...properties, sheetId: 9, title: `Copy of ${title}` },
      },
      {
        slug: 'createColumn',
        input: { ...selection, name: 'New', index: 1 },
        result: {
          column: 'A',
          index: 1,
          updates: { spreadsheetId: 'book', updatedRange: "'Owner''s sheet'!A1", updatedRows: 1 },
        },
      },
      {
        slug: 'exportWorksheet',
        input: { ...selection, returnAsText: true },
        result: { format: 'csv', text: 'Name,Count\r\nAlice,"1,234.50"\r\n' },
      },
      {
        slug: 'customApiCall',
        input: { path: '/spreadsheets/example' },
        result: { status: 200, headers: {}, body: { ok: true } },
      },
    ];
    expect(
      await pieceConformance(createGoogleSheets, {
        factoryOptions: { auth },
        oauth: true,
        triggers: [],
        actions: [
          ...fixtures.map(({ slug, input, result }) => ({ slug, input, expect: { result } })),
          {
            slug: 'getNextRows',
            input: { ...selection, batchSize: 0 },
            expect: { error: /Too small/ },
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('appends sparse column values in column order, preserving RAW and 1-based returned rows', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.appendRow({
        req,
        input: { ...selection, values: { C: false, A: '=SUM(1,2)' }, valueInputOption: 'RAW' },
      }),
    ).toMatchObject({ row: 6, updates: { updatedRows: 1 } });
    const [call] = calls(transport, ':append');
    expect(call.data).toEqual({ majorDimension: 'ROWS', values: [['=SUM(1,2)', '', false]] });
    expect(call.params.valueInputOption).toBe('RAW');
    expect(decodeURIComponent(String(call.url))).toContain("'Owner''s sheet'!A:A");
    expect(call.headers.get('authorization')).toBe('Bearer access-test');
    expect(call.signal).toBe(req.signal);
    expect(call.redirect).toBe('error');
    expect(call.retry).toBe(false);
  });

  it('inserts beneath headers or at row one without a truthiness bug for sheet ID zero', async () => {
    const { piece, req, transport } = await fixture();
    expect(await piece.insertRow({ req, input: { ...selection, values: ['new'] } })).toMatchObject({
      row: 2,
    });
    expect(calls(transport, '/book:batchUpdate')[0].data.requests).toEqual([
      {
        insertDimension: {
          range: { sheetId: 0, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
          inheritFromBefore: true,
        },
      },
    ]);
    await piece.insertRow({ req, input: { ...selection, values: ['first'], afterRow: 0 } });
    expect(
      calls(transport, '/book:batchUpdate')[1].data.requests[0].insertDimension.inheritFromBefore,
    ).toBe(false);
  });

  it('updates single and batch rows with blank/null skip semantics and JSON serialization', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.updateRow({
        req,
        input: { ...selection, row: 4, values: ['', null, 0, false, { x: 1 }] },
      }),
    ).toMatchObject({ row: 4 });
    const update = transport.mock.calls
      .map(([call]) => call)
      .find((call) => call.method === 'PUT')!;
    expect(update.data.values).toEqual([[null, null, 0, false, '{\n  "x": 1\n}']]);
    expect(update.params.valueInputOption).toBe('USER_ENTERED');
    await piece.updateRows({
      req,
      input: {
        ...selection,
        valueInputOption: 'RAW',
        rows: [
          { row: 2, values: { C: 'third', A: '' } },
          { values: ['skip'] },
          { row: 4, values: ['last'] },
        ],
      },
    });
    const [batch] = calls(transport, '/values:batchUpdate');
    expect(batch.data).toEqual({
      valueInputOption: 'RAW',
      data: [
        { range: "'Owner''s sheet'!2:2", majorDimension: 'ROWS', values: [[null, null, 'third']] },
        { range: "'Owner''s sheet'!4:4", majorDimension: 'ROWS', values: [['last']] },
      ],
    });
  });

  it('parses quoted multiline CSV, maps normalized headers, and keeps new duplicate keys within a batch', async () => {
    const { piece, req, transport } = await fixture();
    const result = await piece.appendRows({
      req,
      input: {
        ...selection,
        data: {
          format: 'csv',
          text: '\uFEFF name ,COUNT\r\n ALICE ,9\r\n"New, name",0\r\n"line\nname",2\r\n"New, name",3\r\n',
        },
        duplicateColumn: 'A',
      },
    });
    expect(result.insertedRows).toBe(3);
    expect(calls(transport, ':append')[0].data.values).toEqual([
      ['New, name', '0', ''],
      ['line\nname', '2', ''],
      ['New, name', '3', ''],
    ]);
  });

  it('extends JSON headers at the configured header row and maps records by name', async () => {
    const { piece, req, transport, rows } = await fixture();
    rows.splice(0, rows.length, ['Title'], ['Name', 'Count'], ['Existing', 3]);
    await piece.appendRows({
      req,
      input: {
        ...selection,
        headerRow: 2,
        data: {
          format: 'json',
          rows: [
            { Extra: true, Name: 'new' },
            { Name: 'next', Count: 0 },
          ],
        },
      },
    });
    const update = transport.mock.calls
      .map(([call]) => call)
      .find((call) => call.method === 'PUT')!;
    expect(decodeURIComponent(String(update.url))).toContain("'Owner''s sheet'!2:2");
    expect(update.data.values).toEqual([['Name', 'Count', 'Extra']]);
    expect(calls(transport, ':append')[0].data.values).toEqual([
      ['new', '', true],
      ['next', 0, ''],
    ]);
  });

  it('overwrites below the chosen header then clears trailing rows, including empty replacement', async () => {
    const { piece, req, transport } = await fixture();
    await piece.appendRows({
      req,
      input: {
        ...selection,
        headerRow: 2,
        overwrite: true,
        duplicateColumn: 'A',
        data: { format: 'columns', rows: [{ A: 'Alice' }] },
        valueInputOption: 'RAW',
      },
    });
    expect(calls(transport, '/values:batchUpdate')[0].data).toMatchObject({
      valueInputOption: 'RAW',
      data: [{ range: "'Owner''s sheet'!A3", values: [['Alice']] }],
    });
    expect(calls(transport, '/values:batchClear')[0].data.ranges).toEqual([
      "'Owner''s sheet'!4:100",
    ]);
    await piece.appendRows({
      req,
      input: { ...selection, overwrite: true, data: { format: 'columns', rows: [] } },
    });
    expect(calls(transport, '/values:batchClear')[1].data.ranges).toEqual([
      "'Owner''s sheet'!2:100",
    ]);
  });

  it('avoids writes when every incoming row already exists and rejects malformed CSV', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.appendRows({
        req,
        input: {
          ...selection,
          duplicateColumn: 'A',
          data: { format: 'columns', rows: [[' ALICE '], ['bob']] },
        },
      }),
    ).toMatchObject({ insertedRows: 0 });
    expect(calls(transport, ':append')).toHaveLength(0);
    await expect(
      piece.appendRows({
        req,
        input: { ...selection, data: { format: 'csv', text: 'Name,Count\n"unterminated' } },
      }),
    ).rejects.toThrow();
    expect(calls(transport, ':append')).toHaveLength(0);
  });

  it('distinguishes omitted duplicate keys from explicit blanks and requires CSV headers', async () => {
    const { piece, req, transport, rows } = await fixture();
    const result = await piece.appendRows({
      req,
      input: {
        ...selection,
        duplicateColumn: 'B',
        data: {
          format: 'columns',
          rows: [
            { A: 'missing key' },
            { A: 'blank key', B: '' },
            { A: 'null key', B: null },
            { A: 'zero key', B: 0 },
          ],
        },
      },
    });
    expect(result.insertedRows).toBe(2);
    expect(calls(transport, ':append')[0].data.values).toEqual([['missing key'], ['null key', '']]);
    rows[0] = [];
    await expect(
      piece.appendRows({
        req,
        input: { ...selection, data: { format: 'csv', text: 'Name\nnew' } },
      }),
    ).rejects.toThrow('header row');
  });

  it('deletes individual, contiguous, and noncontiguous rows without index shifting', async () => {
    const { piece, req, transport } = await fixture();
    await piece.deleteRow({ req, input: { ...selection, row: 1 } });
    await piece.deleteRows({
      req,
      input: { ...selection, selection: { mode: 'range', startRow: 3, endRow: 5 } },
    });
    expect(
      await piece.deleteRows({
        req,
        input: { ...selection, selection: { mode: 'list', rows: [3, 8, 3, 5] } },
      }),
    ).toMatchObject({
      deletedRanges: [
        { startRow: 8, endRow: 8 },
        { startRow: 5, endRow: 5 },
        { startRow: 3, endRow: 3 },
      ],
    });
    const requests = calls(transport, '/book:batchUpdate').flatMap((call) => call.data.requests);
    expect(requests.map((request: any) => request.deleteDimension.range)).toEqual([
      { sheetId: 0, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      { sheetId: 0, dimension: 'ROWS', startIndex: 2, endIndex: 5 },
      { sheetId: 0, dimension: 'ROWS', startIndex: 7, endIndex: 8 },
      { sheetId: 0, dimension: 'ROWS', startIndex: 4, endIndex: 5 },
      { sheetId: 0, dimension: 'ROWS', startIndex: 2, endIndex: 3 },
    ]);
    await expect(
      piece.deleteRows({
        req,
        input: { ...selection, selection: { mode: 'range', startRow: 5, endRow: 2 } },
      }),
    ).rejects.toThrow();
  });

  it('finds exact or substring matches and preserves physical rows, zero, false, and missing header fallback', async () => {
    const { piece, req } = await fixture();
    expect(
      await piece.findRows({
        req,
        input: { ...selection, column: 'A', searchValue: 'ALICE', limit: 10, useHeaderNames: true },
      }),
    ).toEqual([
      { row: 2, values: { Name: 'Alice', Count: '0', C: 'false' } },
      { row: 4, values: { Name: 'alice smith', Count: '2', C: '' } },
    ]);
    expect(
      await piece.findRows({
        req,
        input: { ...selection, searchValue: 'ALICE', exactMatch: true },
      }),
    ).toEqual([]);
    expect(
      await piece.findRows({
        req,
        input: { ...selection, searchValue: 'Alice', exactMatch: true },
      }),
    ).toEqual([{ row: 2, values: { A: 'Alice', B: '0', C: 'false' } }]);
  });

  it('returns found rows without appending and creates a missing row with its actual returned position', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.findOrCreateRow({
        req,
        input: { ...selection, searchValue: 'Bob', values: ['unused'] },
      }),
    ).toMatchObject({ found: true, created: false, row: 5 });
    expect(calls(transport, ':append')).toHaveLength(0);
    expect(
      await piece.findOrCreateRow({
        req,
        input: { ...selection, searchValue: 'new', values: ['new', 0], useHeaderNames: true },
      }),
    ).toEqual({ found: false, created: true, row: 6, values: { Name: 'new', Count: '0', C: '' } });
  });

  it('gets individual and all rows, tolerates empty headers, and distinguishes missing rows from provider errors', async () => {
    const { piece, req, transport, rows } = await fixture();
    expect(
      await piece.getRow({ req, input: { ...selection, row: 2, useHeaderNames: true } }),
    ).toEqual({ found: true, row: 2, values: { Name: 'Alice', Count: '0', C: 'false' } });
    expect(await piece.getRow({ req, input: { ...selection, row: 101 } })).toEqual({
      found: false,
      row: null,
    });
    expect(
      (await piece.getRows({ req, input: { ...selection, skipHeaders: true } })).map(
        (row: any) => row.row,
      ),
    ).toEqual([2, 3, 4, 5]);
    rows[0] = [];
    expect(
      await piece.getRow({ req, input: { ...selection, row: 2, useHeaderNames: true } }),
    ).toMatchObject({ values: { A: 'Alice', B: '0' } });
    transport.mockRejectedValueOnce(new Error('permission denied'));
    await expect(piece.getRow({ req, input: { ...selection, row: 2 } })).rejects.toThrow(
      'permission denied',
    );
  });

  it('creates spreadsheets in folders and worksheets with literal RAW headers', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.createSpreadsheet({ req, input: { title: 'Budget', folderId: 'folder' } }),
    ).toEqual({ id: 'created', name: 'Budget' });
    expect(calls(transport, '/drive/v3/files')[0].data).toEqual({
      name: 'Budget',
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: ['folder'],
    });
    expect(
      await piece.createWorksheet({
        req,
        input: { spreadsheetId: 'book', title: "New's tab", headers: ['=literal'] },
      }),
    ).toMatchObject({ sheetId: 9, title: "New's tab" });
    const write = transport.mock.calls.map(([call]) => call).find((call) => call.method === 'PUT')!;
    expect(decodeURIComponent(String(write.url))).toContain("'New''s tab'!A1");
    expect(write.params.valueInputOption).toBe('RAW');
    expect(write.data.values).toEqual([['=literal']]);
  });

  it('finds existing worksheets, creates only missing ones, and matches titles case-sensitively', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.findOrCreateWorksheet({
        req,
        input: { spreadsheetId: 'book', title, headers: ['ignored'] },
      }),
    ).toMatchObject({ found: true, created: false, worksheet: { sheetId: 0 } });
    expect(calls(transport, '/book:batchUpdate')).toHaveLength(0);
    expect(
      await piece.findOrCreateWorksheet({
        req,
        input: { spreadsheetId: 'book', title: 'Missing' },
      }),
    ).toMatchObject({ found: false, created: true, worksheet: { sheetId: 9 } });
    expect(
      await piece.findWorksheets({ req, input: { spreadsheetId: 'book', title: 'sheet' } }),
    ).toEqual({ found: true, worksheets: [properties] });
    expect(
      await piece.findWorksheets({
        req,
        input: { spreadsheetId: 'book', title: 'other', exactMatch: true },
      }),
    ).toEqual({ found: false, worksheets: [] });
  });

  it('clears values without deletion and supports retaining a later header row', async () => {
    const { piece, req, transport } = await fixture();
    await piece.clearWorksheet({
      req,
      input: { ...selection, headerRow: 3, preserveHeaders: true },
    });
    await piece.clearWorksheet({ req, input: { ...selection, preserveHeaders: false } });
    await piece.clearRows({ req, input: { ...selection, startRow: 4, endRow: 6 } });
    expect(
      calls(transport, ':clear').map(
        (call) => decodeURIComponent(String(call.url)).split('/values/')[1],
      ),
    ).toEqual([
      "'Owner''s sheet'!A4:ZZZ:clear",
      "'Owner''s sheet'!A1:ZZZ:clear",
      "'Owner''s sheet'!4:6:clear",
    ]);
    expect(calls(transport, '/book:batchUpdate')).toHaveLength(0);
  });

  it('renames, deletes, and copies worksheets by stable ID with formatting preserved by copyTo', async () => {
    const { piece, req, transport } = await fixture();
    await piece.renameWorksheet({ req, input: { ...selection, title: 'Renamed' } });
    await piece.deleteWorksheet({ req, input: selection });
    expect(
      await piece.copyWorksheet({
        req,
        input: { ...selection, destinationSpreadsheetId: 'destination' },
      }),
    ).toMatchObject({ sheetId: 9 });
    expect(calls(transport, '/book:batchUpdate').map((call) => call.data.requests)).toEqual([
      [
        {
          updateSheetProperties: { properties: { sheetId: 0, title: 'Renamed' }, fields: 'title' },
        },
      ],
      [{ deleteSheet: { sheetId: 0 } }],
    ]);
    expect(calls(transport, '/sheets/0:copyTo')[0].data).toEqual({
      destinationSpreadsheetId: 'destination',
    });
  });

  it('normalizes HEX colors and updates only explicitly selected formatting, including false', async () => {
    const { piece, req, transport } = await fixture();
    await piece.formatRows({
      req,
      input: {
        ...selection,
        startRow: 2,
        endRow: 4,
        backgroundColor: '#f80',
        textColor: '0000ff',
        bold: false,
      },
    });
    expect(calls(transport, '/book:batchUpdate')[0].data.requests).toEqual([
      {
        repeatCell: {
          range: { sheetId: 0, startRowIndex: 1, endRowIndex: 4 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 136 / 255, blue: 0 },
              textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 1 } },
            },
          },
          fields:
            'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor',
        },
      },
    ]);
    await expect(
      piece.formatRows({ req, input: { ...selection, startRow: 1, backgroundColor: 'invalid' } }),
    ).rejects.toThrow();
  });

  it('reads local ranges using requested orientation and rendering and rejects cross-sheet ranges', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.readRange({
        req,
        input: {
          ...selection,
          range: 'A2:C2',
          majorDimension: 'COLUMNS',
          valueRenderOption: 'FORMULA',
        },
      }),
    ).toMatchObject({ majorDimension: 'COLUMNS', values: [['Alice'], [0], [false]] });
    const read = transport.mock.calls
      .map(([call]) => call)
      .find((call) => String(call.url).includes('/values/'))!;
    expect(read.params).toMatchObject({ majorDimension: 'COLUMNS', valueRenderOption: 'FORMULA' });
    await expect(
      piece.readRange({ req, input: { ...selection, range: 'Other!A1' } }),
    ).rejects.toThrow();
  });

  it('escapes Drive search literals, follows every page, and includes shared drives when requested', async () => {
    const { piece, req, transport, respond } = await fixture();
    transport.mockImplementation(async (config) =>
      respond(
        config.params.pageToken
          ? { files: [{ id: 'second', name: 'second' }] }
          : { files: [{ id: 'first', name: 'first' }], nextPageToken: 'next' },
        config,
      ),
    );
    expect(
      await piece.findSpreadsheets({
        req,
        input: { name: "Owner's \\ budget", exactMatch: true, includeSharedDrives: true },
      }),
    ).toEqual({
      found: true,
      spreadsheets: [
        { id: 'first', name: 'first' },
        { id: 'second', name: 'second' },
      ],
    });
    expect(transport.mock.calls[0]![0].params).toMatchObject({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false and name = 'Owner\\'s \\\\ budget'",
      corpora: 'allDrives',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    expect(transport.mock.calls[1]![0].params.pageToken).toBe('next');
  });

  it('inserts columns at explicit indices or after the last header and handles AA/ZZZ boundaries', async () => {
    const { piece, req, transport, rows } = await fixture();
    expect(
      await piece.createColumn({ req, input: { ...selection, name: 'Inserted', index: 2 } }),
    ).toMatchObject({ column: 'B', index: 2 });
    rows[0] = Array.from({ length: 26 }, (_, index) => String(index));
    expect(
      await piece.createColumn({ req, input: { ...selection, name: 'Appended' } }),
    ).toMatchObject({ column: 'AA', index: 27 });
    expect(calls(transport, '/book:batchUpdate')[1].data.requests).toEqual([
      { appendDimension: { sheetId: 0, dimension: 'COLUMNS', length: 1 } },
    ]);
    expect(columnLabel(25)).toBe('Z');
    expect(columnLabel(26)).toBe('AA');
    expect(columnLabel(18277)).toBe('ZZZ');
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('ZZZ')).toBe(18277);
    expect(() => columnIndex('a')).toThrow();
    expect(() => columnLabel(18278)).toThrow();
  });

  it('exports formatted text or persists a file through access-controlled native file APIs', async () => {
    const { piece, req, transport, create } = await fixture();
    expect(
      await piece.exportWorksheet({ req, input: { ...selection, returnAsText: true } }),
    ).toEqual({ format: 'csv', text: 'Name,Count\r\nAlice,"1,234.50"\r\n' });
    expect(new URL(String(transport.mock.calls[0]![0].url)).searchParams.get('gid')).toBe('0');
    expect(await piece.exportWorksheet({ req, input: { ...selection, format: 'tsv' } })).toEqual({
      format: 'tsv',
      file: { id: 'saved', filename: 'exported_sheet.tsv', url: '/files/export.csv' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        req,
        overrideAccess: false,
        file: expect.objectContaining({
          name: 'exported_sheet.tsv',
          mimetype: 'text/tab-separated-values',
        }),
      }),
    );
  });

  it('follows only Google export redirects and never forwards bearer credentials to signed download hosts', async () => {
    const { piece, req, transport, respond } = await fixture();
    transport
      .mockImplementationOnce(async (config) =>
        respond('', config, 302, {
          location: 'https://sheets.googleusercontent.com/export/signed',
        }),
      )
      .mockImplementationOnce(async (config) => respond(Buffer.from('export'), config));
    expect(
      await piece.exportWorksheet({ req, input: { ...selection, returnAsText: true } }),
    ).toMatchObject({ text: 'export' });
    expect(transport.mock.calls[0]![0].headers.get('authorization')).toBe('Bearer access-test');
    expect(transport.mock.calls[1]![0].headers).toBeUndefined();
    transport.mockImplementationOnce(async (config) =>
      respond('', config, 302, { location: 'https://attacker.test/export' }),
    );
    await expect(
      piece.exportWorksheet({ req, input: { ...selection, returnAsText: true } }),
    ).rejects.toThrow('outside Google');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('makes bound custom API calls with query, body, response metadata, and redirects disabled', async () => {
    const { piece, req, transport } = await fixture();
    expect(
      await piece.customApiCall({
        req,
        input: {
          path: '/spreadsheets/book:batchUpdate',
          method: 'POST',
          query: { prettyPrint: false },
          headers: { 'x-request-id': 'test' },
          body: { type: 'json', value: { requests: [] } },
        },
      }),
    ).toMatchObject({ status: 200, body: { spreadsheetId: 'book', replies: [] } });
    const call = transport.mock.calls[0]![0];
    expect(String(call.url)).toBe('https://sheets.googleapis.com/v4/spreadsheets/book:batchUpdate');
    expect(call).toMatchObject({
      params: { prettyPrint: false },
      data: { requests: [] },
      redirect: 'error',
      maxRedirects: 0,
      signal: req.signal,
      timeout: 30000,
    });
    expect(call.headers.get('authorization')).toBe('Bearer access-test');
    expect(call.validateStatus(302)).toBe(false);
  });

  it.each([
    '//attacker.test',
    '/../../attacker',
    '/%2e%2e/oauth2',
    '/spreadsheets/book#fragment',
    '/spreadsheets\\evil',
  ])('rejects custom API escape %s before transport', async (path) => {
    const { piece, req, transport } = await fixture();
    await expect(piece.customApiCall({ req, input: { path } })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('supports raw bodies, form file references, and binary responses with access checks', async () => {
    const { piece, req, transport, findByID, create, respond } = await fixture();
    const fetch = vi.fn().mockResolvedValue(new Response('source'));
    vi.stubGlobal('fetch', fetch);
    transport.mockImplementation(async (config) =>
      respond(Buffer.from('binary'), config, 200, { 'content-type': 'text/csv' }),
    );
    await piece.customApiCall({
      req,
      input: {
        path: '/spreadsheets/book',
        method: 'POST',
        body: {
          type: 'form',
          fields: [
            { name: 'text', value: 'value' },
            { name: 'file', file: { fileId: 'file' } },
          ],
        },
        binary: true,
        filename: 'download.csv',
      },
    });
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'file', req, overrideAccess: false }),
    );
    expect(fetch.mock.calls[0]![1].headers.get('authorization')).toBe('Bearer app');
    expect(fetch.mock.calls[0]![1]).toMatchObject({ signal: req.signal, redirect: 'error' });
    expect(transport.mock.calls[0]![0].data.get('text')).toBe('value');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        overrideAccess: false,
        file: expect.objectContaining({ data: Buffer.from('binary'), name: 'download.csv' }),
      }),
    );
    transport.mockImplementationOnce(async (config) => respond('plain', config));
    expect(
      await piece.customApiCall({
        req,
        input: {
          path: '/spreadsheets/book',
          method: 'POST',
          body: { type: 'raw', value: 'plain' },
        },
      }),
    ).toMatchObject({ body: 'plain' });
    expect(transport.mock.calls[1]![0].data).toBe('plain');
  });

  it('does not forward app credentials to external file storage and rejects reserved custom headers', async () => {
    const { piece, req, findByID, transport } = await fixture();
    findByID.mockResolvedValue({ url: 'https://storage.test/signed', filename: 'source.csv' });
    const fetch = vi.fn().mockResolvedValue(new Response('source'));
    vi.stubGlobal('fetch', fetch);
    await piece.customApiCall({
      req,
      input: {
        path: '/spreadsheets/book',
        method: 'POST',
        body: { type: 'form', fields: [{ name: 'file', file: { fileId: 'file' } }] },
      },
    });
    expect([...fetch.mock.calls[0]![1].headers]).toEqual([]);
    transport.mockClear();
    await expect(
      piece.customApiCall({
        req,
        input: { path: '/spreadsheets/book', headers: { Authorization: 'other' } },
      }),
    ).rejects.toThrow('reserved');
    expect(transport).not.toHaveBeenCalled();
  });

  it('honors cancellation before any SDK request', async () => {
    const { piece, req, transport } = await fixture();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      piece.appendRow({
        req: { ...req, signal: controller.signal },
        input: { ...selection, values: ['a'] },
      }),
    ).rejects.toThrow('cancelled');
    expect(transport).not.toHaveBeenCalled();
  });

  it('uses real Gaxios to reject redirects even in failsafe mode and propagate provider errors without refreshing', async () => {
    const { piece, req, client } = await fixture();
    client.auth.transporter.request = Object.getPrototypeOf(client.auth.transporter).request;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 302, headers: { location: 'https://attacker.test/steal' } }),
      )
      .mockResolvedValueOnce(Response.json({ error: { message: 'expired' } }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ error: { message: 'limited' } }, { status: 429 }));
    client.auth.transporter.defaults.fetchImplementation = fetch;
    await expect(
      piece.customApiCall({ req, input: { path: '/spreadsheets/book', failOnError: false } }),
    ).rejects.toThrow();
    await expect(
      piece.customApiCall({ req, input: { path: '/spreadsheets/book' } }),
    ).rejects.toThrow('expired');
    expect(
      await piece.customApiCall({ req, input: { path: '/spreadsheets/book', failOnError: false } }),
    ).toMatchObject({ status: 429, body: { error: { message: 'limited' } } });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetch.mock.calls) {
      expect(new URL(String(url)).origin).toBe('https://sheets.googleapis.com');
      expect(options.redirect).toBe('error');
    }
  });
});

describe('persistent row cursors', () => {
  it('walks empty gaps without stalling and includes the last grid row', async () => {
    const { piece, req, rows, state } = await fixture();
    rows.splice(0, rows.length, ['Name'], [], ['after gap']);
    const input = { ...selection, startRow: 2, batchSize: 1 };
    expect(await piece.getNextRows({ req, input })).toEqual([{ row: 2, values: { A: '' } }]);
    expect(await piece.getNextRows({ req, input })).toEqual([
      { row: 3, values: { A: 'after gap' } },
    ]);
    expect([...state.values()]).toEqual([4]);
    rows.length = 100;
    rows.fill([], 3, 99);
    rows[99] = ['last grid row'];
    expect(
      await piece.getNextRows({ req, input: { ...selection, startRow: 100, memoryKey: 'last' } }),
    ).toEqual([{ row: 100, values: { A: 'last grid row' } }]);
  });

  it('advances only after reads, resumes from persistent KV across runtime clients, and retains EOF for future appends', async () => {
    const { piece, req, kv, state, client, transport, rows } = await fixture();
    const input = { ...selection, startRow: 2, batchSize: 2, memoryKey: 'import' };
    expect((await piece.getNextRows({ req, input })).map((row: any) => row.row)).toEqual([2, 3]);
    expect([...state.values()]).toEqual([4]);
    const restarted = createGoogleSheets({ auth });
    req.frogbot.config.pieces.instances = [restarted];
    const nextClient = await restarted.client({ req });
    expect(nextClient).not.toBe(client);
    nextClient.auth.transporter.request = transport as typeof nextClient.auth.transporter.request;
    expect((await restarted.getNextRows({ req, input })).map((row: any) => row.row)).toEqual([
      4, 5,
    ]);
    expect(await restarted.getNextRows({ req, input })).toEqual([]);
    expect([...state.values()]).toEqual([6]);
    rows.push(['New']);
    expect((await restarted.getNextRows({ req, input })).map((row: any) => row.row)).toEqual([6]);
    expect(kv.acquireLock).toHaveBeenCalledWith(
      expect.stringMatching(/^pieces:google-sheets:cursor:[a-f0-9]{64}:lock$/),
      30000,
    );
  });

  it('isolates owner collection/id, instance, spreadsheet, worksheet, and memory keys', async () => {
    const keys: string[] = [];
    for (const owner of [
      null,
      { collection: 'users', id: 1 },
      { collection: 'users', id: 2 },
      { collection: 'admins', id: 1 },
    ]) {
      const { piece, req, kv } = await fixture({ user: owner });
      await piece.getNextRows({ req, input: selection });
      keys.push(kv.get.mock.calls[0]![0]);
    }
    const other = await fixture({ slug: 'sheets-other' });
    await other.piece.getNextRows({ req: other.req, input: selection });
    keys.push(other.kv.get.mock.calls[0]![0]);
    await other.piece.getNextRows({ req: other.req, input: { ...selection, memoryKey: 'other' } });
    keys.push(other.kv.get.mock.calls[1]![0]);
    await other.piece.getNextRows({ req: other.req, input: { ...selection, sheetId: 7 } });
    keys.push(other.kv.get.mock.calls[2]![0]);
    other.transport.mockImplementationOnce(async (config) =>
      other.respond({ sheets: [{ properties }] }, config),
    );
    await other.piece.getNextRows({
      req: other.req,
      input: { ...selection, spreadsheetId: 'another-book' },
    });
    keys.push(other.kv.get.mock.calls[3]![0]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prevents overlapping calls from returning the same batch and resumes after lock release', async () => {
    const { piece, req, transport, respond, state } = await fixture();
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    transport.mockImplementationOnce(async (config) => {
      started();
      await gate;
      return respond({ sheets: [{ properties }] }, config);
    });
    const first = piece.getNextRows({ req, input: { ...selection, startRow: 2 } });
    await ready;
    await expect(
      piece.getNextRows({ req, input: { ...selection, startRow: 2 } }),
    ).rejects.toThrow();
    release();
    expect((await first)[0]?.row).toBe(2);
    expect((await piece.getNextRows({ req, input: selection }))[0]?.row).toBe(3);
    expect([...state.values()]).toEqual([4]);
  });

  it('cancels in-flight cursor reads without persisting progress', async () => {
    const { piece, req, kv, transport } = await fixture();
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    transport.mockImplementationOnce(async (config) => {
      started();
      return new Promise((_resolve, reject) =>
        config.signal.addEventListener('abort', () => reject(config.signal.reason), { once: true }),
      );
    });
    const pending = piece.getNextRows({
      req: { ...req, signal: controller.signal },
      input: selection,
    });
    const rejected = pending.catch((error: unknown) => error);
    await ready;
    controller.abort(new Error('cancelled'));
    expect(await rejected).toEqual(new Error('cancelled'));
    expect(kv.set).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalled();
  });

  it('does not advance on provider failure, invalid stored data, or lock contention', async () => {
    const { piece, req, kv, transport, state } = await fixture();
    transport.mockRejectedValueOnce(new Error('unavailable'));
    await expect(piece.getNextRows({ req, input: selection })).rejects.toThrow('unavailable');
    expect(kv.set).not.toHaveBeenCalled();
    const key = kv.get.mock.calls[0]![0];
    state.set(key, 'not-a-number');
    await expect(piece.getNextRows({ req, input: selection })).rejects.toThrow();
    expect(kv.set).not.toHaveBeenCalled();
    state.clear();
    kv.acquireLock.mockResolvedValueOnce(null);
    await expect(piece.getNextRows({ req, input: selection })).rejects.toThrow();
    expect(kv.set).not.toHaveBeenCalled();
  });

  it('renews a lease during slow transport and aborts without advancement when renewal fails', async () => {
    vi.useFakeTimers();
    const { piece, req, kv, transport } = await fixture();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    transport.mockImplementationOnce(async (config) => {
      started();
      return new Promise((_resolve, reject) =>
        config.signal.addEventListener('abort', () => reject(config.signal.reason), { once: true }),
      );
    });
    kv.extendLock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const pending = piece.getNextRows({ req, input: selection });
    const rejection = pending.catch((error: unknown) => error);
    await ready;
    await vi.advanceTimersByTimeAsync(10_001);
    expect(kv.extendLock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await rejection).toBeInstanceOf(Error);
    expect(kv.set).not.toHaveBeenCalled();
    expect(kv.releaseLock).toHaveBeenCalled();
  });
});
