import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceFactoryDefinition,
  pieceInstanceRuntime,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createTrello,
  trelloActions,
  trelloTriggers,
} from '../../../packages/pieces/piece-trello/src/index.js';

const auth = {
  username: 'trello-key',
  password: 'trello-token',
  applicationSecret: 'trello-application-secret',
};
const req = () =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function webhookRequest(delivery: unknown, webhookUrl: string, valid = true) {
  const body = JSON.stringify(delivery);
  const signature = createHmac('sha1', valid ? auth.applicationSecret : 'wrong-secret')
    .update(body)
    .update(webhookUrl)
    .digest('base64');

  return {
    arrayBuffer: async () => Buffer.from(body),
    data: delivery,
    headers: new Headers({ 'x-trello-webhook': signature }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('trello', () => {
  it('exposes the full semantic action and trigger inventory', () => {
    const trello = createTrello({ auth });

    expect(pieceInstanceTools(trello)?.map(({ slug }) => slug)).toEqual(
      trelloActions.map((slug) => `trello_${slug}`),
    );
    expect(Object.keys(trello.triggers)).toEqual(trelloTriggers);
  });

  it('requires the basic-auth API key and token fields', () => {
    const definition = pieceFactoryDefinition(createTrello);

    expect(definition.auth?.safeParse(auth).success).toBe(true);
    expect(definition.auth?.safeParse({ username: '', password: 'token' }).success).toBe(false);
    expect(definition.auth?.safeParse({ username: 'key', password: 'token' }).success).toBe(false);
    expect(definition.auth?.safeParse({ apiKey: 'key', token: 'token' }).success).toBe(false);
  });

  it.each([
    ['getCard', { cardId: 'card' }, 'GET', '/1/cards/card'],
    ['deleteCard', { cardId: 'card' }, 'DELETE', '/1/cards/card'],
    ['listCardAttachments', { cardId: 'card' }, 'GET', '/1/cards/card/attachments'],
    [
      'getCardAttachment',
      { cardId: 'card', attachmentId: 'attachment' },
      'GET',
      '/1/cards/card/attachments/attachment',
    ],
    [
      'deleteCardAttachment',
      { cardId: 'card', attachmentId: 'attachment' },
      'DELETE',
      '/1/cards/card/attachments/attachment',
    ],
  ] as const)('maps %s to Trello', async (slug, input, method, path) => {
    const response =
      slug.includes('Attachment') && !slug.startsWith('delete')
        ? slug.startsWith('list')
          ? []
          : { id: 'attachment', name: 'File', url: 'https://example.com/file' }
        : slug.startsWith('delete')
          ? {}
          : { id: 'card', name: 'Card' };
    const fetch = vi.fn().mockResolvedValue(json(response));

    vi.stubGlobal('fetch', fetch);

    await createTrello({ auth })[slug]({ input, req: req() } as never);

    const [url, init] = fetch.mock.calls[0]!;

    expect(new URL(String(url)).pathname).toBe(path);
    expect(init.method ?? 'GET').toBe(method);
    expect(new URL(String(url)).searchParams.get('key')).toBe(auth.username);
    expect(new URL(String(url)).searchParams.get('token')).toBe(auth.password);
  });

  it('maps card creation and update fields exactly', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ id: 'card', name: 'Card' }));

    vi.stubGlobal('fetch', fetch);
    const trello = createTrello({ auth });

    await trello.createCard({
      input: {
        boardId: 'board',
        listId: 'list',
        name: 'Card',
        description: 'Body',
        position: 'top',
        labelIds: ['label'],
      },
      req: req(),
    });
    await trello.updateCard({
      input: { cardId: 'card', listId: 'next', archived: false, due: '2026-09-14T00:00:00.000Z' },
      req: req(),
    });

    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('idList')).toBe('list');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      name: 'Card',
      desc: 'Body',
      pos: 'top',
      idLabels: ['label'],
    });
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({
      idList: 'next',
      closed: false,
      due: '2026-09-14T00:00:00.000Z',
    });
  });

  it('loads all dynamic action options', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json([{ id: 'board', name: 'Board' }]))
      .mockResolvedValueOnce(json([{ id: 'list', name: 'List' }]))
      .mockResolvedValueOnce(json([{ id: 'label', name: '', color: 'green' }]));

    vi.stubGlobal('fetch', fetch);
    const trello = createTrello({ auth });
    const client = await trello.client({ req: req() });
    const options = pieceActionDefinition(trello.createCard)!.options!;
    const args = { client, options: {}, req: req() };

    await expect(options.boardId!({ ...args, input: {} })).resolves.toEqual([
      { label: 'Board', value: 'board' },
    ]);
    await expect(options.listId!({ ...args, input: { boardId: 'board' } })).resolves.toEqual([
      { label: 'List', value: 'list' },
    ]);
    await expect(options.labelIds!({ ...args, input: { boardId: 'board' } })).resolves.toEqual([
      { label: 'green', value: 'label' },
    ]);
  });

  it('uploads an attachment from the configured files collection', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async (value: URL | string) =>
        String(value).includes('/files/report.pdf')
          ? new Response('report data', { headers: { 'Content-Type': 'application/pdf' } })
          : json({ id: 'attachment', name: 'Report', url: 'https://trello.com/report' }),
      );
    const request = {
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.example.com' }) },
        },
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
        findByID: vi.fn().mockResolvedValue({
          url: '/files/report.pdf',
          filename: 'report.pdf',
          mimeType: 'application/pdf',
        }),
      },
      headers: new Headers({ cookie: 'session=test' }),
      signal: undefined,
      url: 'https://app.example.com/actions',
      user: null,
    } as never;

    vi.stubGlobal('fetch', fetch);

    await createTrello({ auth }).addCardAttachment({
      input: { cardId: 'card', attachment: { fileId: 'file' }, setCover: true },
      req: request,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ redirect: 'error' });
    expect((fetch.mock.calls[0]![1].headers as Headers).get('cookie')).toBe('session=test');
    const trelloUrl = new URL(String(fetch.mock.calls[1]![0]));

    expect(trelloUrl.pathname).toBe('/1/cards/card/attachments');
    expect(trelloUrl.searchParams.get('mimeType')).toBe('application/pdf');
    expect(trelloUrl.searchParams.get('setCover')).toBe('true');
    expect(fetch.mock.calls[1]![1].body).toBeInstanceOf(FormData);
  });

  it('passes custom API calls through without allowing another origin', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true }));

    vi.stubGlobal('fetch', fetch);

    await createTrello({ auth }).customApiCall({
      input: {
        method: 'POST',
        path: '/boards',
        query: { fields: 'name' },
        body: { name: 'Board' },
      },
      req: req(),
    });

    const url = new URL(String(fetch.mock.calls[0]![0]));

    expect(url.origin).toBe('https://api.trello.com');
    expect(url.searchParams.get('fields')).toBe('name');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ name: 'Board' });
  });

  it('preserves useful Trello errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('invalid token', { status: 401 })),
    );

    await expect(
      createTrello({ auth }).getCard({ input: { cardId: 'card' }, req: req() }),
    ).rejects.toThrow('Trello request failed (401): invalid token');
  });

  it('handles Trello webhook handshakes', async () => {
    const webhook = pieceInstanceRuntime(createTrello()).definition.webhook!;

    await expect(
      webhook.handshake!({ req: { method: 'HEAD' } as never, options: {} }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      webhook.handshake!({ req: { method: 'POST' } as never, options: {} }),
    ).resolves.toBeNull();
  });

  it.each(['cardCreated', 'cardMovedToList'] as const)(
    'reuses, filters, and deletes the %s webhook',
    async (slug) => {
      const definition = pieceFactoryDefinition(createTrello).triggers!.find(
        (trigger) => trigger.slug === slug,
      )!;
      if (definition.type !== 'webhook') throw new Error('Expected webhook trigger.');

      const input =
        slug === 'cardCreated'
          ? { boardId: 'board', listId: 'list' }
          : { boardId: 'board', listId: 'list' };
      const client = {
        listWebhooks: vi
          .fn()
          .mockResolvedValue([
            { id: 'hook', idModel: 'list', callbackURL: 'https://example.com/hook' },
          ]),
        createWebhook: vi.fn(),
        deleteWebhook: vi.fn().mockResolvedValue({}),
        getCard: vi.fn().mockResolvedValue({ id: 'card', name: 'Card' }),
        verifyWebhook: vi.fn().mockReturnValue(true),
      };
      const state = await definition.onEnable({
        client,
        input,
        webhookUrl: 'https://example.com/hook',
      } as never);

      expect(state).toEqual({
        webhookId: 'hook',
        webhookUrl: 'https://example.com/hook',
        owned: false,
      });
      expect(client.createWebhook).not.toHaveBeenCalled();

      const entities =
        slug === 'cardCreated'
          ? { card: { id: 'card' }, list: { id: 'list' } }
          : { card: { id: 'card' }, listAfter: { id: 'list' }, listBefore: { id: 'old' } };
      const delivery = {
        action: {
          display: {
            translationKey:
              slug === 'cardCreated' ? 'action_create_card' : 'action_move_card_from_list_to_list',
            entities,
          },
        },
      };

      await expect(
        definition.run({
          client,
          input,
          req: webhookRequest(delivery, state.webhookUrl),
          state,
        } as never),
      ).resolves.toEqual([
        { dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/), data: { id: 'card', name: 'Card' } },
      ]);
      await expect(
        definition.run({
          client,
          input,
          req: webhookRequest(
            { action: { display: { translationKey: 'other' } } },
            state.webhookUrl,
          ),
          state,
        } as never),
      ).resolves.toEqual([]);

      await definition.onDisable({ client, input, state } as never);

      expect(client.deleteWebhook).not.toHaveBeenCalled();
    },
  );

  it('creates a webhook when no registration matches', async () => {
    const definition = pieceFactoryDefinition(createTrello).triggers!.find(
      (trigger) => trigger.slug === 'cardCreated',
    )!;
    if (definition.type !== 'webhook') throw new Error('Expected webhook trigger.');

    const client = {
      listWebhooks: vi.fn().mockResolvedValue([]),
      createWebhook: vi.fn().mockResolvedValue({ id: 'new-hook' }),
    };

    await expect(
      definition.onEnable({
        client,
        input: { boardId: 'board' },
        webhookUrl: 'https://example.com/hook',
      } as never),
    ).resolves.toEqual({
      webhookId: 'new-hook',
      webhookUrl: 'https://example.com/hook',
      owned: true,
    });
    expect(client.createWebhook).toHaveBeenCalledWith('board', 'https://example.com/hook');
  });

  it('accepts a webhook signed over the raw body and registered callback URL', async () => {
    const definition = pieceFactoryDefinition(createTrello).triggers!.find(
      (trigger) => trigger.slug === 'cardCreated',
    )!;
    if (definition.type !== 'webhook') throw new Error('Expected webhook trigger.');

    const webhookUrl = 'https://example.com/hook';
    const delivery = {
      action: {
        display: {
          translationKey: 'action_create_card',
          entities: { card: { id: 'card' } },
        },
      },
    };
    const trello = createTrello({ auth });
    const client = await trello.client({ req: req() });
    client.getCard = vi.fn().mockResolvedValue({ id: 'card', name: 'Card' });

    await expect(
      definition.run({
        client,
        input: { boardId: 'board' },
        req: webhookRequest(delivery, webhookUrl),
        state: { webhookId: 'hook', webhookUrl, owned: true },
      } as never),
    ).resolves.toEqual([
      { dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/), data: { id: 'card', name: 'Card' } },
    ]);
  });

  it('rejects an invalid webhook signature before reading parsed data', async () => {
    const definition = pieceFactoryDefinition(createTrello).triggers!.find(
      (trigger) => trigger.slug === 'cardCreated',
    )!;
    if (definition.type !== 'webhook') throw new Error('Expected webhook trigger.');

    const webhookUrl = 'https://example.com/hook';
    const delivery = { action: { display: { translationKey: 'action_create_card' } } };
    const trello = createTrello({ auth });
    const client = await trello.client({ req: req() });
    const request = webhookRequest(delivery, webhookUrl, false);
    const data = vi.fn();

    Object.defineProperty(request, 'data', { get: data });

    await expect(
      definition.run({
        client,
        input: { boardId: 'board' },
        req: request,
        state: { webhookId: 'hook', webhookUrl, owned: true },
      } as never),
    ).rejects.toThrow('Trello webhook signature is invalid.');
    expect(data).not.toHaveBeenCalled();
  });

  it('rejects webhook cards that do not match the trigger output', async () => {
    const definition = pieceFactoryDefinition(createTrello).triggers!.find(
      (trigger) => trigger.slug === 'cardCreated',
    )!;
    if (definition.type !== 'webhook') throw new Error('Expected webhook trigger.');

    const client = {
      getCard: vi.fn().mockResolvedValue({ id: 'card' }),
      verifyWebhook: vi.fn().mockReturnValue(true),
    };
    const delivery = {
      action: {
        display: {
          translationKey: 'action_create_card',
          entities: { card: { id: 'card' } },
        },
      },
    };

    await expect(
      definition.run({
        client,
        input: { boardId: 'board' },
        req: {
          arrayBuffer: async () => Buffer.from(JSON.stringify(delivery)),
          data: delivery,
          headers: new Headers({ 'x-trello-webhook': 'signature' }),
        },
        state: {
          webhookId: 'hook',
          webhookUrl: 'https://example.com/hook',
          owned: true,
        },
      } as never),
    ).rejects.toThrow();
  });

  it('emits only approaching incomplete deadlines and advances the cursor', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00.000Z'));
    const definition = pieceFactoryDefinition(createTrello).triggers!.find(
      (trigger) => trigger.slug === 'cardDeadline',
    )!;
    if (definition.type !== 'polling') throw new Error('Expected polling trigger.');

    const due = '2026-09-13T01:00:00.000Z';
    const client = {
      listAll: vi.fn().mockResolvedValue([
        { id: 'due', name: 'Due', due, dueComplete: false },
        { id: 'done', name: 'Done', due, dueComplete: true },
        { id: 'later', name: 'Later', due: '2026-09-14T02:00:00.000Z', dueComplete: false },
      ]),
    };

    await expect(
      definition.run({
        client,
        input: { boardId: 'board', timeUnit: 'hours', timeBeforeDue: 24 },
      } as never),
    ).resolves.toEqual({
      events: [{ id: 'due', name: 'Due', due, dueComplete: false }],
      cursor: Date.parse(due),
    });
    expect(client.listAll).toHaveBeenCalledWith('boards/board/cards');

    vi.useRealTimers();
  });

  it('rejects file records that point outside the FrogBot origin', async () => {
    const fetch = vi.fn();
    const request = {
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.example.com' }) },
        },
        connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
        findByID: vi.fn().mockResolvedValue({ url: 'https://attacker.example/file' }),
      },
      headers: new Headers({ authorization: 'Bearer secret' }),
      url: 'https://app.example.com/actions',
      user: null,
    } as never;

    vi.stubGlobal('fetch', fetch);

    await expect(
      createTrello({ auth }).addCardAttachment({
        input: { cardId: 'card', attachment: { fileId: 'file' } },
        req: request,
      }),
    ).rejects.toThrow("File 'file' has an invalid URL");
    expect(fetch).not.toHaveBeenCalled();
  });
});
