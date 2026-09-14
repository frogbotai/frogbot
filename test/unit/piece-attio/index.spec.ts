import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceInstanceTools } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { attioActions, createAttio } from '../../../packages/pieces/piece-attio/src/index.js';

const auth = { accessToken: 'attio-token' };
const req = {
  frogbot: {
    connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
  },
  user: null,
} as never;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function webhookRequest(body: string, secret = 'secret') {
  const request = new Request('https://example.test/hooks/attio', {
    method: 'POST',
    headers: {
      'attio-signature': createHmac('sha256', secret).update(body).digest('hex'),
      'Content-Type': 'application/json',
    },
    body,
  }) as any;

  request.data = JSON.parse(body);

  return request;
}

afterEach(() => vi.unstubAllGlobals());

describe('attio', () => {
  it('exposes all 15 native actions with semantic names', () => {
    const attio = createAttio({ auth });

    expect(pieceInstanceTools(attio)?.map(({ slug }) => slug)).toEqual(
      attioActions.map(({ slug }) => `attio_${slug}`),
    );
    expect(attioActions.map(({ slug }) => slug)).toEqual([
      'createRecord',
      'updateRecord',
      'findRecords',
      'getRecord',
      'createListEntry',
      'updateListEntry',
      'findListEntries',
      'createNote',
      'getCallTranscript',
      'createTask',
      'listTasks',
      'getTask',
      'deleteTask',
      'updateTask',
      'customApiCall',
    ]);
  });

  it('authenticates and preserves record attributes without dropping values', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ data: { id: { record_id: 'record' } } }));
    vi.stubGlobal('fetch', fetch);

    await expect(
      createAttio({ auth }).createRecord({
        input: {
          objectId: 'people',
          attributes: { name: [{ full_name: 'Ada Lovelace' }], score: [{ value: 42 }] },
        },
        req,
      }),
    ).resolves.toEqual({ id: { record_id: 'record' } });

    expect(fetch.mock.calls[0]?.[0].pathname).toBe('/v2/objects/people/records');
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer attio-token',
    );
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string)).toEqual({
      data: {
        values: { name: [{ full_name: 'Ada Lovelace' }], score: [{ value: 42 }] },
      },
    });
  });

  it('normalizes Attio record attribute arrays into readable values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          data: {
            id: { record_id: 'record' },
            values: {
              name: [{ attribute_type: 'personal-name', full_name: 'Ada Lovelace' }],
              tags: [
                { attribute_type: 'text', value: 'engineer' },
                { attribute_type: 'text', value: 'mathematician' },
              ],
              empty: [],
            },
          },
        }),
      ),
    );

    await expect(
      createAttio({ auth }).getRecord({
        input: { objectId: 'people', recordId: 'record' },
        req,
      }),
    ).resolves.toMatchObject({
      values: {
        name: 'Ada Lovelace',
        tags: ['engineer', 'mathematician'],
        empty: null,
      },
    });
  });

  it('prevents custom calls from escaping the API root or replacing auth', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ data: true }));

    vi.stubGlobal('fetch', fetch);
    const attio = createAttio({ auth });

    await expect(
      attio.customApiCall({
        input: { method: 'GET', path: '/../workspace_members' },
        req,
      }),
    ).rejects.toThrow('parent segments');

    await attio.customApiCall({
      input: {
        method: 'GET',
        path: '/workspace_members',
        headers: { Authorization: 'Bearer attacker' },
      },
      req,
    });

    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer attio-token',
    );
  });

  it('maps list, note, transcript, and task requests exactly', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(response({ data: { id: 'result' } })));
    vi.stubGlobal('fetch', fetch);
    const attio = createAttio({ auth });

    await attio.createListEntry({
      input: {
        listId: 'pipeline',
        parentObjectId: 'companies',
        parentRecordId: 'company',
        attributes: { stage: [{ status: 'won' }] },
      },
      req,
    });
    await attio.createNote({
      input: {
        parentObject: 'companies',
        parentRecordId: 'company',
        title: 'Summary',
        format: 'markdown',
        content: '**Won**',
      },
      req,
    });
    await attio.getCallTranscript({
      input: { meetingId: 'meeting', callRecordingId: 'recording' },
      req,
    });
    await attio.createTask({
      input: { content: 'Follow up', linkedObject: 'companies', linkedRecordId: 'company' },
      req,
    });

    expect(fetch.mock.calls.map(([url]) => url.pathname)).toEqual([
      '/v2/lists/pipeline/entries',
      '/v2/notes',
      '/v2/meetings/meeting/call_recordings/recording/transcript',
      '/v2/tasks',
    ]);
    expect(JSON.parse(fetch.mock.calls[3]?.[1]?.body as string).data).toMatchObject({
      content: 'Follow up',
      deadline_at: null,
      is_completed: false,
      linked_records: [{ target_object: 'companies', target_record_id: 'company' }],
      assignees: [],
    });
  });

  it('loads dynamic choices through the authenticated client', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response({ data: [{ id: { object_id: 'people' }, singular_noun: 'Person' }] }),
      );
    vi.stubGlobal('fetch', fetch);
    const action = attioActions.find(({ slug }) => slug === 'createRecord');

    await expect(
      action?.options?.objectId({ input: {}, client: await createAttio({ auth }).client({ req }) }),
    ).resolves.toEqual([{ label: 'Person', value: 'people' }]);
  });

  it('paginates record searches until the final page', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: index }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ data: firstPage }))
      .mockResolvedValueOnce(response({ data: [{ id: 500 }] }));
    vi.stubGlobal('fetch', fetch);

    const result = await createAttio({ auth }).findRecords({
      input: { objectId: 'people', attributes: {} },
      req,
    });

    expect(result.result).toHaveLength(501);
    expect(fetch.mock.calls[0]?.[0].searchParams.get('offset')).toBe('0');
    expect(fetch.mock.calls[1]?.[0].searchParams.get('offset')).toBe('500');
  });

  it('registers, verifies, delivers, and removes webhooks with retained state', async () => {
    const body = JSON.stringify({ events: [{ id: { record_id: 'record' } }] });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({ data: { id: { webhook_id: 'webhook' }, secret: 'secret' } }),
      )
      .mockResolvedValueOnce(response({ data: { id: { record_id: 'record' } } }))
      .mockResolvedValueOnce(response(null));
    vi.stubGlobal('fetch', fetch);
    const attio = createAttio({ auth }) as any;
    const definition = attio.triggers.recordCreated;
    const client = await attio.client({ req });
    const state = await definition.onEnable({
      client,
      input: { objectId: 'people' },
      webhookUrl: 'https://example.test/hooks/attio',
      options: {},
      req,
    });
    const webhookReq = webhookRequest(body);
    const events = await definition.run({
      client,
      input: { objectId: 'people' },
      req: webhookReq,
      options: {},
      state,
    });
    await definition.onDisable({ client, input: { objectId: 'people' }, state, options: {}, req });

    expect(state).toEqual({ webhookId: 'webhook', webhookSecret: 'secret' });
    expect(events[0]).toMatchObject({ data: { id: { record_id: 'record' } } });
    expect(fetch.mock.calls[2]?.[0].pathname).toBe('/v2/webhooks/webhook');
  });

  it('rejects an invalid webhook signature before using parsed request data', async () => {
    const body = JSON.stringify({ events: [{ id: { record_id: 'record' } }] });
    const fetch = vi.fn();

    vi.stubGlobal('fetch', fetch);

    const attio = createAttio({ auth }) as any;
    const definition = attio.triggers.recordCreated;
    const client = await attio.client({ req });
    const webhookReq = webhookRequest(body, 'wrong-secret');

    await expect(
      definition.run({
        client,
        input: { objectId: 'people' },
        req: webhookReq,
        options: {},
        state: { webhookId: 'webhook', webhookSecret: 'secret' },
      }),
    ).rejects.toThrow('Attio webhook signature is invalid.');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces validation and useful vendor failures', async () => {
    const attio = createAttio({ auth });

    await expect(attio.updateTask({ input: { taskId: 'task' }, req })).rejects.toThrow(
      'At least one field must be provided',
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'scope denied' }, 403)));

    await expect(attio.getTask({ input: { taskId: 'task' }, req })).rejects.toThrow(
      'Attio request failed (403): scope denied',
    );
  });
});
