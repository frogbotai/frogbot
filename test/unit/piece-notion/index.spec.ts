import type { FrogbotRequest } from 'frogbot';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceConformance } from '../../../packages/frogbot/src/pieces/conformance.js';
import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { pieceCapabilities } from '../../../packages/frogbot/src/pieces/types.js';
import {
  createNotion,
  notionActions,
  notionTriggers,
} from '../../../packages/pieces/piece-notion/src/index.js';

const auth = { accessToken: 'secret_test' };
const page = {
  object: 'page',
  id: 'page1',
  created_time: '2026-09-13T10:00:00.000Z',
  last_edited_time: '2026-09-13T11:00:00.000Z',
  archived: false,
  properties: { Name: { type: 'title', title: [{ plain_text: 'Task Alpha' }] } },
};
const comment = { object: 'comment', id: 'comment1', created_time: '2026-09-13T10:00:00.000Z' };

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installTransport() {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const transport = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));

    requests.push({ url, init });

    if (url.pathname === '/v1/users/me') {
      return response({ object: 'user', id: 'user1', name: 'Ada' });
    }
    if (url.pathname === '/v1/comments' && init.method === 'POST') return response(comment);
    if (url.pathname === '/v1/comments') {
      return response({ object: 'list', results: [comment], has_more: false, next_cursor: null });
    }
    if (url.pathname.endsWith('/children')) {
      return response({
        object: 'list',
        results: [{ object: 'block', id: 'block1' }],
        has_more: false,
        next_cursor: null,
      });
    }
    if (url.pathname.endsWith('/query')) {
      return response({ object: 'list', results: [page], has_more: false, next_cursor: null });
    }
    if (url.pathname === '/v1/search') {
      return response({ object: 'list', results: [page], has_more: false, next_cursor: null });
    }
    if (url.pathname.startsWith('/v1/databases/')) {
      return response({
        object: 'database',
        id: 'database1',
        properties: { Name: { type: 'title' } },
      });
    }
    if (url.pathname === '/v1/pages' || url.pathname.startsWith('/v1/pages/')) {
      return response(page);
    }
    if (url.pathname === '/v1/custom') return response({ ok: true });

    return response({ message: 'not found' }, 404);
  });

  vi.stubGlobal('fetch', transport);

  return { requests, transport };
}

function request() {
  const piece = createNotion({ auth });
  const req = {
    signal: new AbortController().signal,
    user: null,
    frogbot: {
      config: { pieces: { instances: [piece] } },
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: piece }) },
    },
  } as unknown as FrogbotRequest;

  return { piece, req };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native Notion', () => {
  it('declares the complete inventory and maps stored OAuth tokens without enabling sign-in', () => {
    const { piece } = request();
    const oauthPiece = createNotion({ oauth: { clientId: 'client', clientSecret: 'secret' } });
    const definition = pieceFactoryDefinition(createNotion);

    expect(pieceInstanceTools(piece)?.map(({ slug }) => slug)).toEqual(
      notionActions.map((slug) => `notion_${slug}`),
    );
    expect(notionActions).toHaveLength(15);
    expect(Object.keys(piece.triggers)).toEqual(notionTriggers);
    expect(definition.oauth).toMatchObject({
      tokenEndpointAuthMethod: 'client_secret_basic',
    });
    expect(definition.oauth?.toAuth?.({ tokens: { access_token: 'stored' } })).toEqual({
      accessToken: 'stored',
    });
    expect(definition.oauth?.account).toBeUndefined();
    expect(oauthPiece[pieceCapabilities]).toMatchObject({ signIn: false });
  });

  it('executes all action transports through conformance', async () => {
    const { transport } = installTransport();

    await pieceConformance(createNotion, {
      factoryOptions: { auth },
      actions: [
        {
          slug: 'listDatabases',
          input: {},
          expect: {
            result: {
              success: true,
              data: [page],
              pagination: { count: 1, hasMore: false, nextCursor: null, limit: 10 },
            },
          },
        },
        {
          slug: 'createDatabaseItem',
          input: { databaseId: 'database1', fields: { Name: 'Task' } },
          expect: { result: page },
        },
        {
          slug: 'updateDatabaseItem',
          input: { databaseId: 'database1', itemId: 'page1', fields: { Name: 'Task' } },
          expect: { result: page },
        },
        {
          slug: 'findDatabaseItem',
          input: { databaseId: 'database1', fields: {} },
          expect: { result: { success: true, results: [page] } },
        },
        {
          slug: 'listDatabasePages',
          input: { databaseId: 'database1' },
          expect: {
            result: {
              success: true,
              data: [page],
              pagination: { count: 1, hasMore: false, nextCursor: null, limit: 10 },
            },
          },
        },
        { slug: 'createPage', input: { pageId: 'page1' }, expect: { result: page } },
        {
          slug: 'appendToPage',
          input: { pageId: 'page1', content: 'Text' },
          expect: {
            result: {
              object: 'list',
              results: [{ object: 'block', id: 'block1' }],
              has_more: false,
              next_cursor: null,
            },
          },
        },
        {
          slug: 'getBlockContent',
          input: { parentId: 'page1' },
          expect: { result: [{ object: 'block', id: 'block1' }] },
        },
        {
          slug: 'archiveDatabaseItem',
          input: { databaseId: 'database1', itemId: 'page1' },
          expect: { result: page },
        },
        {
          slug: 'restoreDatabaseItem',
          input: { databaseId: 'database1', itemId: 'page1' },
          expect: { result: page },
        },
        {
          slug: 'addComment',
          input: { pageId: 'page1', commentText: 'Hi' },
          expect: { result: comment },
        },
        {
          slug: 'retrieveDatabase',
          input: { databaseId: 'database1' },
          expect: {
            result: {
              object: 'database',
              id: 'database1',
              properties: { Name: { type: 'title' } },
            },
          },
        },
        { slug: 'getPageComments', input: { pageId: 'page1' }, expect: { result: [comment] } },
        { slug: 'findPage', input: { title: 'Task' }, expect: { result: [page] } },
        {
          slug: 'customApiCall',
          input: { method: 'GET', path: '/custom' },
          expect: { result: { ok: true } },
        },
      ],
      triggers: notionTriggers.map((slug) => ({ slug, type: 'polling' })),
      oauth: true,
    });

    expect(transport).toHaveBeenCalled();
  });

  it('sets authentication and version headers and rejects unsafe paths and malformed responses', async () => {
    const { requests } = installTransport();
    const { piece, req } = request();

    await piece.customApiCall({ input: { method: 'GET', path: '/custom' }, req });

    expect(requests[0]?.init.headers).toMatchObject({
      authorization: 'Bearer secret_test',
      'notion-version': '2022-02-22',
    });
    await expect(
      piece.customApiCall({ input: { method: 'GET', path: '/users/../custom' }, req }),
    ).rejects.toThrow();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ id: 'missing-object' })));

    await expect(piece.createPage({ input: { pageId: 'page1' }, req })).rejects.toThrow();
  });

  it('executes every polling transport and advances timestamp cursors', async () => {
    installTransport();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T12:00:00.000Z'));

    const { piece, req } = request();
    const definition = pieceFactoryDefinition(createNotion);
    const client = await piece.client({ req });
    const inputs = [
      { databaseId: 'database1' },
      { databaseId: 'database1' },
      { pageId: 'page1' },
      {},
    ];

    for (const [index, trigger] of (definition.triggers ?? []).entries()) {
      if (trigger.type !== 'polling') throw new Error('Expected a polling trigger.');

      const result = await trigger.run({
        input: inputs[index] ?? {},
        cursor: Date.parse('2026-09-13T09:00:00.000Z'),
        client,
        options: {},
        req,
      });

      expect(result.events).toHaveLength(1);
      expect(result.cursor).toBe(Date.parse('2026-09-13T12:00:00.000Z'));
    }
  });

  it('maps exact and contains database filters and omits empty fields', async () => {
    const { requests } = installTransport();
    const { piece, req } = request();

    await piece.findDatabaseItem({
      input: { databaseId: 'database1', fields: { Name: 'Task', Missing: '', Unknown: 'no' } },
      req,
    });
    await piece.listDatabasePages({
      input: { databaseId: 'database1', fields: { Name: 'Task', Missing: null } },
      req,
    });

    const queries = requests.filter(({ url }) => url.pathname.endsWith('/query'));

    expect(JSON.parse(String(queries[0]?.init.body))).toMatchObject({
      filter: { and: [{ property: 'Name', title: { equals: 'Task' } }] },
    });
    expect(JSON.parse(String(queries[1]?.init.body))).toMatchObject({
      filter: { and: [{ property: 'Name', title: { contains: 'Task' } }] },
    });
  });

  it('distinguishes fuzzy and exact page-title matches across pages', async () => {
    const exact = {
      ...page,
      id: 'exact',
      properties: { Name: { type: 'title', title: [{ plain_text: 'Task' }] } },
    };
    const fuzzy = { ...page, id: 'fuzzy' };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init: RequestInit = {}) => {
        const body = JSON.parse(String(init.body));

        return body.start_cursor
          ? response({ object: 'list', results: [fuzzy], has_more: false, next_cursor: null })
          : response({ object: 'list', results: [exact], has_more: true, next_cursor: 'next' });
      }),
    );

    const { piece, req } = request();

    await expect(
      piece.findPage({ input: { title: 'Task', exactMatch: true }, req }),
    ).resolves.toEqual([exact]);
    await expect(
      piece.findPage({ input: { title: 'task', exactMatch: false }, req }),
    ).resolves.toEqual([exact, fuzzy]);
  });

  it('recurses through paginated block children only to the requested depth', async () => {
    const transport = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith('/root/children') && !url.searchParams.has('start_cursor')) {
        return response({
          object: 'list',
          results: [{ object: 'block', id: 'parent', has_children: true }],
          has_more: true,
          next_cursor: 'next',
        });
      }
      if (url.pathname.endsWith('/root/children')) {
        return response({
          object: 'list',
          results: [{ object: 'block', id: 'leaf', has_children: false }],
          has_more: false,
          next_cursor: null,
        });
      }

      return response({
        object: 'list',
        results: [{ object: 'block', id: 'child', has_children: true }],
        has_more: false,
        next_cursor: null,
      });
    });

    vi.stubGlobal('fetch', transport);

    const { piece, req } = request();
    const result = await piece.getBlockContent({ input: { parentId: 'root', depth: 2 }, req });

    expect(result).toEqual([
      {
        object: 'block',
        id: 'parent',
        has_children: true,
        children: [{ object: 'block', id: 'child', has_children: true }],
      },
      { object: 'block', id: 'leaf', has_children: false },
    ]);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('paginates polling and excludes cursor-boundary and duplicate events', async () => {
    const boundary = '2026-09-13T09:00:00.000Z';
    const newer = { ...page, id: 'newer', created_time: '2026-09-13T10:00:00.000Z' };
    const atBoundary = { ...page, id: 'boundary', created_time: boundary };
    const transport = vi.fn(async (_input: string | URL | Request, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body));

      return body.start_cursor
        ? response({ object: 'list', results: [newer], has_more: false, next_cursor: null })
        : response({
            object: 'list',
            results: [atBoundary, newer],
            has_more: true,
            next_cursor: 'next',
          });
    });

    vi.stubGlobal('fetch', transport);
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-13T12:00:00.000Z'));

    const { piece, req } = request();
    const trigger = pieceFactoryDefinition(createNotion).triggers?.[0];

    if (trigger?.type !== 'polling') throw new Error('Expected database polling trigger.');

    const result = await trigger.run({
      input: { databaseId: 'database1' },
      cursor: Date.parse(boundary),
      client: await piece.client({ req }),
      options: {},
      req,
    });

    expect(result.events).toEqual([newer]);
    expect(result.cursor).toBe(Date.parse('2026-09-13T12:00:00.000Z'));
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
