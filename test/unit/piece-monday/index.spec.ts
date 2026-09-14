import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createMondayClient } from '../../../packages/pieces/piece-monday/src/client.js';
import {
  createMonday,
  mondayActionNames,
  mondayTriggerNames,
} from '../../../packages/pieces/piece-monday/src/index.js';

const auth = { apiToken: 'monday-test-token' };
const fetchMock = vi.fn<typeof fetch>();

function response(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function request(data?: unknown, signal?: AbortSignal) {
  const key = {};

  return {
    data,
    signal,
    frogbot: { connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key }) } },
    user: null,
  } as never;
}

async function fixture() {
  const req = request();
  const monday = createMonday({ auth });
  const client = await monday.client({ req });

  return { req, monday, client };
}

function body(call = fetchMock.mock.calls.at(-1)) {
  return JSON.parse(String(call?.[1]?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('native Monday', () => {
  it('declares the full semantic action and trigger contract with secret auth and outputs', () => {
    const piece = createMonday({ auth });
    const definition = pieceFactoryDefinition(createMonday);

    expect(pieceInstanceTools(piece)?.map((action) => action.slug)).toEqual(
      mondayActionNames.map((name) => `monday_${name}`),
    );
    expect(Object.keys(piece.triggers)).toEqual(mondayTriggerNames);
    expect(z.toJSONSchema(definition.auth)).toMatchObject({
      properties: { apiToken: { secret: true } },
      required: ['apiToken'],
    });
    expect(() => createMondayClient({ auth: {} })).toThrow();

    for (const action of definition.actions) {
      expect(z.toJSONSchema(action.input).type).toBe('object');
      expect(action.output).toBeDefined();
    }

    for (const trigger of definition.triggers) expect(trigger.output).toBeDefined();
  });

  it('maps create, update, and read operations through authenticated GraphQL', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: { create_column: { id: 'column-1' } } }))
      .mockResolvedValueOnce(
        response({
          data: {
            boards: [
              {
                groups: [],
                columns: [{ id: 'status', title: 'Status', type: 'status' }],
                items_page: { items: [] },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        response({ data: { change_multiple_column_values: { id: 'item-1', name: 'Item' } } }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: 'item-1',
                      name: 'Item',
                      column_values: [
                        { id: 'status', type: 'status', value: '{}', label: 'Done' },
                        { id: 'people', type: 'people', value: '{"personsAndTeams":[{"id":7}]}' },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        }),
      );
    const { monday, req } = await fixture();

    await expect(
      monday.createColumn({
        input: {
          workspaceId: 'workspace-1',
          boardId: 'board-1',
          title: 'Priority',
          type: 'status',
        },
        req,
      }),
    ).resolves.toEqual({ id: 'column-1' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.monday.com/v2');
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      auth.apiToken,
    );
    expect(body(fetchMock.mock.calls[0])).toMatchObject({
      variables: { boardId: 'board-1', title: 'Priority', type: 'status' },
    });

    await monday.updateItemColumnValues({
      input: {
        workspaceId: 'workspace-1',
        boardId: 'board-1',
        itemId: 'item-1',
        columnValues: { status: 'Done' },
      },
      req,
    });
    expect(JSON.parse(body().variables.columnValues as string)).toEqual({
      status: { label: 'Done' },
    });

    await expect(
      monday.listBoardItems({
        input: { workspaceId: 'workspace-1', boardId: 'board-1', columnIds: ['status'] },
        req,
      }),
    ).resolves.toEqual([{ id: 'item-1', name: 'Item', status: 'Done', people: [7] }]);
    expect(body().query).toContain('column_values(ids: $columnIds)');
    expect(body().variables.columnIds).toEqual(['status']);
  });

  it('executes every remaining action with exact provider results', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };

      if (request.query.includes('groups {')) {
        return response({
          data: {
            boards: [
              {
                groups: [],
                columns: [{ id: 'text', title: 'Text', type: 'text' }],
                items_page: { items: [] },
              },
            ],
          },
        });
      }
      if (request.query.includes('create_group')) {
        return response({ data: { create_group: { id: 'group-1' } } });
      }
      if (request.query.includes('create_item')) {
        return response({ data: { create_item: { id: 'item-1' } } });
      }
      if (request.query.includes('create_update')) {
        return response({ data: { create_update: { id: 'update-1' } } });
      }
      if (request.query.includes('items_page(query_params')) {
        return response({
          data: {
            boards: [
              {
                items_page: {
                  items: [
                    {
                      id: 'item-1',
                      name: 'Original',
                      column_values: [{ id: 'text', type: 'text', value: '"Value"' }],
                    },
                  ],
                },
              },
            ],
          },
        });
      }

      return response({
        data: { change_multiple_column_values: { id: 'item-1', name: 'Renamed' } },
      });
    });
    const { monday, req } = await fixture();

    await expect(
      monday.createGroup({
        input: { workspaceId: 'workspace-1', boardId: 'board-1', name: 'Group' },
        req,
      }),
    ).resolves.toEqual({ id: 'group-1' });
    await expect(
      monday.createItem({
        input: {
          workspaceId: 'workspace-1',
          boardId: 'board-1',
          name: 'Item',
          columnValues: { text: 'Value' },
        },
        req,
      }),
    ).resolves.toEqual({ id: 'item-1' });
    expect(JSON.parse(body().variables.columnValues as string)).toEqual({ text: 'Value' });
    await expect(
      monday.createUpdate({ input: { itemId: 'item-1', body: 'News' }, req }),
    ).resolves.toEqual({ id: 'update-1' });
    await expect(
      monday.getItemColumnValues({
        input: { workspaceId: 'workspace-1', boardId: 'board-1', itemId: 'item-1' },
        req,
      }),
    ).resolves.toEqual({ id: 'item-1', name: 'Original', text: 'Value' });
    await expect(
      monday.updateItemName({
        input: {
          workspaceId: 'workspace-1',
          boardId: 'board-1',
          itemId: 'item-1',
          name: 'Renamed',
        },
        req,
      }),
    ).resolves.toEqual({ id: 'item-1', name: 'Renamed' });
    expect(JSON.parse(body().variables.columnValues as string)).toEqual({ name: 'Renamed' });
  });

  it('loads every kind of dynamic choice from controlled board data', async () => {
    const details = {
      data: {
        boards: [
          {
            groups: [{ id: 'group-1', title: 'Group' }],
            columns: [
              { id: 'text', title: 'Text', type: 'text' },
              { id: 'file', title: 'Files', type: 'file' },
            ],
            items_page: { items: [{ id: 'item-1', name: 'Item' }] },
          },
        ],
      },
    };
    fetchMock.mockImplementation(async () => response(details));
    const { client, req } = await fixture();
    const definition = pieceFactoryDefinition(createMonday);
    const createItem = definition.actions.find((action) => action.slug === 'createItem')!;
    const upload = definition.actions.find((action) => action.slug === 'uploadFileToColumn')!;

    fetchMock.mockResolvedValueOnce(
      response({ data: { workspaces: [{ id: 'workspace-1', name: 'Workspace' }] } }),
    );
    await expect(
      createItem.options?.workspaceId?.({ input: {}, client, req, options: {} }),
    ).resolves.toEqual([{ label: 'Workspace', value: 'workspace-1' }]);
    fetchMock.mockResolvedValueOnce(
      response({ data: { boards: [{ id: 'board-1', name: 'Board', type: 'board' }] } }),
    );
    await expect(
      createItem.options?.boardId?.({
        input: { workspaceId: 'workspace-1' },
        client,
        req,
        options: {},
      }),
    ).resolves.toEqual([{ label: 'Board', value: 'board-1' }]);
    await expect(
      createItem.options?.groupId?.({ input: { boardId: 'board-1' }, client, req, options: {} }),
    ).resolves.toEqual([{ label: 'Group', value: 'group-1' }]);
    await expect(
      upload.options?.itemId?.({ input: { boardId: 'board-1' }, client, req, options: {} }),
    ).resolves.toEqual([{ label: 'Item', value: 'item-1' }]);
    await expect(
      upload.options?.columnId?.({ input: { boardId: 'board-1' }, client, req, options: {} }),
    ).resolves.toEqual([{ label: 'Files', value: 'file' }]);
  });

  it('uploads multipart files with auth and exact Monday variables', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ data: { add_file_to_column: { id: 'asset-1', name: 'note.txt' } } }),
    );
    const { monday, req } = await fixture();

    await expect(
      monday.uploadFileToColumn({
        input: {
          workspaceId: 'workspace-1',
          boardId: 'board-1',
          itemId: 'item-1',
          columnId: 'files',
          fileName: 'note.txt',
          base64: Buffer.from('hello').toString('base64'),
        },
        req,
      }),
    ).resolves.toEqual({ id: 'asset-1', name: 'note.txt' });
    const [url, init] = fetchMock.mock.calls[0]!;
    const form = init?.body as FormData;

    expect(url).toBe('https://api.monday.com/v2/file');
    expect(new Headers(init?.headers).get('authorization')).toBe(auth.apiToken);
    expect(JSON.parse(String(form.get('variables')))).toEqual({
      itemId: 'item-1',
      columnId: 'files',
    });
    expect(await (form.get('file') as File).text()).toBe('hello');
  });

  it('registers, delivers, and removes both webhooks and handles challenges', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: { create_webhook: { id: 'hook-1' } } }))
      .mockResolvedValueOnce(response({ data: { delete_webhook: { id: 'hook-1' } } }))
      .mockResolvedValueOnce(response({ data: { create_webhook: { id: 'hook-2' } } }));
    const definition = pieceFactoryDefinition(createMonday);
    const client = createMondayClient({ auth });
    const req = request();
    const itemCreated = definition.triggers.find((trigger) => trigger.slug === 'itemCreated')!;
    const columnUpdated = definition.triggers.find((trigger) => trigger.slug === 'columnUpdated')!;

    expect('options' in itemCreated).toBe(false);
    expect('options' in columnUpdated).toBe(false);
    expect(z.toJSONSchema(itemCreated.input)).toMatchObject({
      properties: { boardId: { label: 'Board ID' } },
      required: ['boardId'],
    });
    expect(z.toJSONSchema(columnUpdated.input)).toMatchObject({
      properties: {
        boardId: { label: 'Board ID' },
        columnId: { label: 'Column ID' },
      },
      required: ['boardId', 'columnId'],
    });

    const state = await itemCreated.onEnable({
      input: { boardId: 'board-1' },
      webhookUrl: 'https://example.test/hook',
      client,
      options: {},
      req,
    });
    expect(state).toEqual({ webhookId: 'hook-1' });
    expect(body().variables).toMatchObject({
      event: 'create_item',
      url: 'https://example.test/hook',
    });
    await itemCreated.onDisable({
      input: { boardId: 'board-1' },
      state,
      client,
      options: {},
      req,
    });
    expect(body().variables).toEqual({ webhookId: 'hook-1' });
    await columnUpdated.onEnable({
      input: { boardId: 'board-1', columnId: 'status' },
      webhookUrl: 'https://example.test/column',
      client,
      options: {},
      req,
    });
    expect(body().variables).toMatchObject({
      event: 'change_specific_column_value',
      config: '{"columnId":"status"}',
    });
    await expect(
      columnUpdated.run({
        input: { boardId: 'board-1', columnId: 'status' },
        client,
        options: {},
        req: request({ event: { pulseId: 1 } }),
      }),
    ).resolves.toEqual([{ dedupeKey: expect.any(String), data: { event: { pulseId: 1 } } }]);
    const handshake = await definition.webhook?.handshake?.({
      req: request({ challenge: 'challenge-token' }),
      options: {},
    });
    expect(await handshake?.json()).toEqual({ challenge: 'challenge-token' });
    await expect(
      definition.webhook?.handshake?.({ req: request({ event: {} }), options: {} }),
    ).resolves.toBeNull();
  });

  it('delivers the original item event when enrichment is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(response({ errors: [{ message: 'Item is not visible' }] }));
    const definition = pieceFactoryDefinition(createMonday);
    const itemCreated = definition.triggers.find((trigger) => trigger.slug === 'itemCreated')!;
    const delivery = { event: { boardId: 1, pulseId: 2 } };

    await expect(
      itemCreated.run({
        input: { boardId: 'board-1' },
        client: createMondayClient({ auth }),
        options: {},
        req: request(delivery),
      }),
    ).resolves.toEqual([{ dedupeKey: expect.any(String), data: delivery }]);
  });

  it('surfaces GraphQL errors and cancellation without a second request', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ errors: [{ message: 'Invalid board identifier' }] }),
    );
    const { monday, req } = await fixture();

    await expect(
      monday.createGroup({
        input: { workspaceId: 'workspace-1', boardId: 'missing', name: 'Group' },
        req,
      }),
    ).rejects.toThrow('Invalid board identifier');

    const controller = new AbortController();
    controller.abort(new Error('Caller cancelled'));
    await expect(
      monday.createUpdate({
        input: { itemId: 'item-1', body: 'Update' },
        req: request(undefined, controller.signal),
      }),
    ).rejects.toThrow('Caller cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
