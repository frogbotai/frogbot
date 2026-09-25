import type { FrogBotRequest } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  airtableActions,
  airtableTriggers,
  createAirtable,
} from '../../../packages/pieces/piece-airtable/src/index.js';

const auth = { personalAccessToken: 'pat-test' };
const table = {
  id: 'tbl1',
  name: 'Tasks',
  primaryFieldId: 'fldName',
  fields: [
    { id: 'fldName', name: 'Name', type: 'singleLineText' },
    { id: 'fldFile', name: 'Files', type: 'multipleAttachments' },
    { id: 'fldModified', name: 'Modified', type: 'lastModifiedTime' },
  ],
  views: [{ id: 'viw1', name: 'All', type: 'grid' }],
};
const record = {
  id: 'rec1',
  createdTime: '2026-09-13T10:00:00.000Z',
  fields: { Name: 'Alpha', Modified: '2026-09-13T11:00:00.000Z' },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installTransport() {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const transport = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));

    requests.push({ url, init });

    if (url.hostname === 'app.test') return new Response('file bytes');
    if (url.pathname === '/v0/meta/bases' && init.method === 'POST') {
      return response({ id: 'appNew', tables: [table] });
    }
    if (url.pathname === '/v0/meta/bases') {
      return response({ bases: [{ id: 'app1', name: 'Operations', workspaceId: 'wsp1' }] });
    }
    if (url.pathname === '/v0/meta/bases/app1/tables' && init.method === 'POST') {
      return response(table);
    }
    if (url.pathname === '/v0/meta/bases/app1/tables') return response({ tables: [table] });
    if (url.hostname === 'content.airtable.com') return response(record);
    if (url.pathname === '/v0/app1/tbl1/rec1/comments') {
      return response({
        id: 'com1',
        text: 'Hello',
        createdTime: '2026-09-13T10:00:00.000Z',
      });
    }
    if (url.pathname === '/v0/app1/tbl1/rec1' && init.method === 'DELETE') {
      return response({ id: 'rec1', deleted: true });
    }
    if (url.pathname === '/v0/app1/tbl1/rec1') return response(record);
    if (url.pathname === '/v0/app1/tbl1' && init.method === 'POST') return response(record);
    if (url.pathname === '/v0/app1/tbl1') return response({ records: [record] });
    if (url.pathname === '/v0/whoami') return response({ id: 'usr1' });

    return response({ error: 'not found' }, 404);
  });

  vi.stubGlobal('fetch', transport);

  return { requests, transport };
}

function request() {
  const piece = createAirtable({ auth });
  const findByID = vi.fn().mockResolvedValue({
    id: 'file1',
    url: '/files/report.txt',
    filename: 'report.txt',
  });
  const req = {
    url: 'https://app.test/api',
    headers: new Headers({ authorization: 'Bearer caller', cookie: 'session=caller' }),
    signal: new AbortController().signal,
    user: null,
    frogbot: {
      findByID,
      config: {
        files: { slug: 'files' },
        pieces: { instances: [piece] },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      connections: {
        resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: piece }),
      },
    },
  } as unknown as FrogBotRequest;

  return { piece, req, findByID };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native Airtable', () => {
  it('declares the complete native inventory and validates auth', () => {
    const { piece } = request();

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      airtableActions.map((slug) => `airtable_${slug}`),
    );
    expect(airtableActions).toHaveLength(15);
    expect(Object.keys(piece.triggers)).toEqual(airtableTriggers);
    expect(() => createAirtable({ auth: { personalAccessToken: '' } })).toThrow();
  });

  it('runs every action through the native conformance harness', async () => {
    const { transport } = installTransport();

    await pieceConformance(createAirtable, {
      factoryOptions: { auth },
      actions: [
        {
          slug: 'createRecord',
          input: { baseId: 'app1', tableId: 'tbl1', fields: { Name: 'Alpha', Empty: '' } },
          expect: { result: record },
        },
        {
          slug: 'findRecords',
          input: { baseId: 'app1', tableId: 'tbl1', searchField: 'Name', searchValue: 'Alpha' },
          expect: { result: [record] },
        },
        {
          slug: 'updateRecord',
          input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', fields: { Name: 'Alpha' } },
          expect: { result: record },
        },
        {
          slug: 'cleanRecord',
          input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', fields: { Name: '' } },
          expect: { result: record },
        },
        {
          slug: 'deleteRecord',
          input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' },
          expect: { result: { id: 'rec1', deleted: true } },
        },
        {
          slug: 'uploadAttachment',
          input: {
            baseId: 'app1',
            tableId: 'tbl1',
            recordId: 'rec1',
            attachmentFieldId: 'fldFile',
            fileId: 'file1',
            contentType: 'text/plain',
          },
          expect: { error: "reading 'files'" },
        },
        {
          slug: 'addRecordComment',
          input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', text: 'Hello' },
          expect: {
            result: { id: 'com1', text: 'Hello', createdTime: '2026-09-13T10:00:00.000Z' },
          },
        },
        {
          slug: 'createBase',
          input: {
            workspaceId: 'wsp1',
            name: 'New',
            tables: [{ name: 'Tasks', fields: [{ name: 'Name', type: 'singleLineText' }] }],
          },
          expect: { result: { id: 'appNew', tables: [table] } },
        },
        {
          slug: 'createTable',
          input: {
            baseId: 'app1',
            name: 'Tasks',
            fields: [{ name: 'Name', type: 'singleLineText' }],
          },
          expect: { result: table },
        },
        {
          slug: 'findBases',
          input: { name: 'oper' },
          expect: { result: [{ id: 'app1', name: 'Operations', workspaceId: 'wsp1' }] },
        },
        { slug: 'getTable', input: { baseId: 'app1', tableId: 'tbl1' }, expect: { result: table } },
        {
          slug: 'getRecord',
          input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1' },
          expect: { result: record },
        },
        { slug: 'findTable', input: { baseId: 'app1', name: 'tasks' }, expect: { result: table } },
        { slug: 'getBaseSchema', input: { baseId: 'app1' }, expect: { result: [table] } },
        {
          slug: 'customApiCall',
          input: { method: 'GET', path: '/whoami' },
          expect: { result: { id: 'usr1' } },
        },
      ],
      triggers: [
        { slug: 'newRecord', type: 'polling' },
        { slug: 'newOrUpdatedRecord', type: 'polling' },
      ],
    });

    expect(transport).toHaveBeenCalled();
  });

  it('maps requests, credentials, field clearing, and useful vendor errors exactly', async () => {
    const { requests } = installTransport();
    const { piece, req } = request();

    await piece.cleanRecord({
      input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', fields: { Name: '', Keep: 0 } },
      req,
    });

    const patch = requests.find(({ init }) => init.method === 'PATCH')!;

    expect(patch.init.headers).toMatchObject({ authorization: 'Bearer pat-test' });
    expect(JSON.parse(String(patch.init.body))).toEqual({ fields: { Name: null, Keep: 0 } });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'INVALID_REQUEST' }, 422)));

    await expect(
      piece.customApiCall({ input: { method: 'GET', path: '/bad' }, req }),
    ).rejects.toThrow('Airtable request failed (422)');
  });

  it('rejects malformed record responses', async () => {
    const { piece, req } = request();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ records: [{ fields: {} }] })));

    await expect(
      piece.findRecords({
        input: { baseId: 'app1', tableId: 'tbl1', searchField: 'Name', searchValue: 'Alpha' },
        req,
      }),
    ).rejects.toThrow();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ fields: {} })));

    await expect(
      piece.updateRecord({
        input: { baseId: 'app1', tableId: 'tbl1', recordId: 'rec1', fields: { Name: 'Alpha' } },
        req,
      }),
    ).rejects.toThrow();
  });

  it('loads attachment files with caller access and controlled transport', async () => {
    const { requests } = installTransport();
    const { piece, req, findByID } = request();

    await expect(
      piece.uploadAttachment({
        input: {
          baseId: 'app1',
          tableId: 'tbl1',
          recordId: 'rec1',
          attachmentFieldId: 'fldFile',
          fileId: 'file1',
          contentType: 'text/plain',
        },
        req,
      }),
    ).resolves.toEqual(record);

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', id: 'file1', req, overrideAccess: false }),
    );
    expect(requests[0]?.init).toMatchObject({ redirect: 'error', signal: req.signal });
    expect(requests[0]?.init.headers).toEqual(
      new Headers({ authorization: 'Bearer caller', cookie: 'session=caller' }),
    );
    expect(JSON.parse(String(requests[1]?.init.body))).toEqual({
      contentType: 'text/plain',
      file: Buffer.from('file bytes').toString('base64'),
      filename: 'report.txt',
    });
  });

  it('runs every dynamic action option callback', async () => {
    const { transport } = installTransport();

    await pieceConformance(createAirtable, {
      factoryOptions: { auth },
      actions: airtableActions.map((slug) => ({ slug, input: {}, expect: { error: /./ } })),
      options: [
        {
          action: 'createRecord',
          field: 'baseId',
          expect: [{ label: 'Operations', value: 'app1' }],
        },
        {
          action: 'createRecord',
          field: 'tableId',
          input: { baseId: 'app1' },
          expect: [{ label: 'Tasks', value: 'tbl1' }],
        },
        {
          action: 'findRecords',
          field: 'searchField',
          input: { baseId: 'app1', tableId: 'tbl1' },
          expect: [
            { label: 'Name', value: 'Name' },
            { label: 'Files', value: 'Files' },
            { label: 'Modified', value: 'Modified' },
          ],
        },
        {
          action: 'findRecords',
          field: 'viewId',
          input: { baseId: 'app1', tableId: 'tbl1' },
          expect: [{ label: 'All', value: 'viw1' }],
        },
        {
          action: 'uploadAttachment',
          field: 'attachmentFieldId',
          input: { baseId: 'app1', tableId: 'tbl1' },
          expect: [{ label: 'Files', value: 'fldFile' }],
        },
      ],
      triggers: [
        { slug: 'newRecord', type: 'polling' },
        { slug: 'newOrUpdatedRecord', type: 'polling' },
      ],
    });

    expect(transport).toHaveBeenCalled();
  });

  it('polls both triggers directly and advances their cursors', async () => {
    installTransport();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T12:00:00.000Z'));

    const { piece, req } = request();
    const definition = pieceFactoryDefinition(createAirtable);
    const client = await piece.client({ req });
    const created = definition.triggers?.[0];
    const updated = definition.triggers?.[1];

    if (created?.type !== 'polling' || updated?.type !== 'polling') {
      throw new Error('Missing polling triggers.');
    }

    expect(created).not.toHaveProperty('options');
    expect(updated).not.toHaveProperty('options');

    await expect(
      created.run({
        input: { baseId: 'app1', tableId: 'tbl1' },
        cursor: Date.parse('2026-09-13T09:00:00.000Z'),
        client,
        options: {},
        req,
      }),
    ).resolves.toEqual({ events: [record], cursor: Date.parse('2026-09-13T12:00:00.000Z') });
    await expect(
      updated.run({
        input: { baseId: 'app1', tableId: 'tbl1', modifiedTimeField: 'Modified' },
        cursor: Date.parse('2026-09-13T09:00:00.000Z'),
        client,
        options: {},
        req,
      }),
    ).resolves.toEqual({ events: [record], cursor: Date.parse('2026-09-13T12:00:00.000Z') });
  });
});
