import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceActionDefinition,
  pieceFactoryDefinition,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createFront,
  frontActions,
  frontTriggers,
} from '../../../packages/pieces/piece-front/src/index.js';

const auth = { apiToken: 'front_test_token' };
const req = () =>
  ({
    frogbot: {
      connections: { resolvePieceCredential: vi.fn().mockResolvedValue({ auth, key: auth }) },
    },
    user: null,
  }) as never;
const json = (body: unknown = { id: 'result' }, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => vi.unstubAllGlobals());

describe('front', () => {
  it('exposes every semantic action and trigger', () => {
    const front = createFront({ auth });

    expect(pieceInstanceTools(front)?.map(({ slug }) => slug)).toEqual(
      frontActions.map((slug) => `front_${slug}`),
    );
    expect(Object.keys(front.triggers)).toEqual(frontTriggers);
  });

  it.each([
    [
      'addComment',
      { conversationId: 'cnv', authorId: 'tea', body: 'Note' },
      'POST',
      '/conversations/cnv/comments',
      { author_id: 'tea', body: 'Note' },
    ],
    [
      'addContactHandle',
      { contactId: 'crd', source: 'email', handle: 'a@example.com' },
      'POST',
      '/contacts/crd/handles',
      { source: 'email', handle: 'a@example.com' },
    ],
    [
      'addConversationLinks',
      { conversationId: 'cnv', linkIds: ['top'] },
      'POST',
      '/conversations/cnv/links',
      { link_ids: ['top'] },
    ],
    [
      'addConversationTags',
      { conversationId: 'cnv', tagIds: ['tag'] },
      'POST',
      '/conversations/cnv/tags',
      { tag_ids: ['tag'] },
    ],
    ['assignConversation', { conversationId: 'cnv' }, 'PUT', '/conversations/cnv/assignee', {}],
    ['createAccount', { name: 'Acme' }, 'POST', '/accounts', { name: 'Acme', custom_fields: {} }],
    [
      'createContact',
      { handles: [{ source: 'email', handle: 'a@example.com' }] },
      'POST',
      '/contacts',
      { handles: [{ source: 'email', handle: 'a@example.com' }], custom_fields: {} },
    ],
    [
      'createDraft',
      { channelId: 'cha', to: ['a@example.com'], body: 'Draft' },
      'POST',
      '/channels/cha/drafts',
      {
        channel_id: 'cha',
        to: ['a@example.com'],
        body: 'Draft',
        mode: 'private',
        should_add_default_signature: false,
      },
    ],
    [
      'createDraftReply',
      { conversationId: 'cnv', body: 'Draft' },
      'POST',
      '/conversations/cnv/drafts',
      { body: 'Draft', mode: 'private', should_add_default_signature: false },
    ],
    [
      'createLink',
      { name: 'Issue', externalUrl: 'https://example.com' },
      'POST',
      '/links',
      { name: 'Issue', external_url: 'https://example.com' },
    ],
    [
      'removeContactHandle',
      { contactId: 'crd', source: 'email', handle: 'a@example.com' },
      'DELETE',
      '/contacts/crd/handles',
      { source: 'email', handle: 'a@example.com', force: false },
    ],
    [
      'removeConversationLinks',
      { conversationId: 'cnv', links: ['https://example.com'] },
      'DELETE',
      '/conversations/cnv/links',
      { links: ['https://example.com'] },
    ],
    [
      'removeConversationTags',
      { conversationId: 'cnv', tagIds: ['tag'] },
      'DELETE',
      '/conversations/cnv/tags',
      { tag_ids: ['tag'] },
    ],
    [
      'sendMessage',
      { channelId: 'cha', to: ['a@example.com'], body: 'Hello' },
      'POST',
      '/channels/cha/messages',
      { channel_id: 'cha', to: ['a@example.com'], body: 'Hello' },
    ],
    [
      'sendReply',
      { conversationId: 'cnv', body: 'Hello' },
      'POST',
      '/conversations/cnv/messages',
      { body: 'Hello' },
    ],
    [
      'updateAccount',
      { accountId: 'acc', name: 'Acme' },
      'PATCH',
      '/accounts/acc',
      { name: 'Acme' },
    ],
    [
      'updateContact',
      { contactId: 'crd', avatarUrl: 'https://example.com/a.png' },
      'PATCH',
      '/contacts/crd',
      { avatar_url: 'https://example.com/a.png' },
    ],
    [
      'updateConversation',
      { conversationId: 'cnv', status: 'archived', tagIds: ['tag'] },
      'PATCH',
      '/conversations/cnv',
      { status: 'archived', tag_ids: ['tag'] },
    ],
    [
      'updateLink',
      { linkId: 'top', externalUrl: 'https://example.com/new' },
      'PATCH',
      '/links/top',
      { external_url: 'https://example.com/new' },
    ],
  ] as const)('maps %s to Front', async (slug, input, method, path, body) => {
    const fetch = vi.fn().mockResolvedValue(json());
    vi.stubGlobal('fetch', fetch);

    await createFront({ auth })[slug]({ input, req: req() } as never);

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url.toString()).toBe(`https://api2.frontapp.com${path}`);
    expect(init.method).toBe(method);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer front_test_token' });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it.each([
    ['listAccounts', { emailDomain: 'example.com', limit: 10 }, '/accounts?limit=10'],
    [
      'searchContacts',
      { email: 'a@example.com', limit: 5 },
      '/contacts?q%5Btypes%5D=a%40example.com&limit=5',
    ],
    [
      'searchConversations',
      { query: 'subject:"Order"' },
      '/conversations/search?q=subject%3A%22Order%22',
    ],
  ] as const)('maps %s query parameters', async (slug, input, path) => {
    const body =
      slug === 'listAccounts'
        ? { _results: [{ id: 'acc', email_domain: 'example.com' }] }
        : { _results: [] };
    const fetch = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal('fetch', fetch);

    await createFront({ auth })[slug]({ input, req: req() } as never);

    expect(fetch.mock.calls[0]?.[0].toString()).toBe(`https://api2.frontapp.com${path}`);
  });

  it('loads every dynamic option through the authenticated client', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () =>
        json({ _results: [{ id: 'one', name: 'One', subject: 'Subject', username: 'user' }] }),
      );
    vi.stubGlobal('fetch', fetch);
    const front = createFront({ auth });
    const client = await front.client({ req: req() });
    const callbacks = frontActions.flatMap((slug) =>
      Object.values(pieceActionDefinition(front[slug])?.options ?? {}),
    );

    for (const callback of callbacks) {
      await expect(
        callback({ input: {}, client, options: {}, req: req() } as never),
      ).resolves.toEqual([expect.objectContaining({ value: 'one' })]);
    }

    expect(callbacks.length).toBeGreaterThan(0);
  });

  it.each([
    ['commentCreated', { conversationId: 'cnv' }, 'comment', 15],
    ['inboundMessageCreated', { inboxId: 'inb' }, 'inbound', 15],
    ['outboundMessageCreated', {}, 'outbound', 15],
    ['conversationTagAdded', { conversationId: 'cnv' }, 'tag', 50],
  ] as const)('polls and advances the %s cursor', async (slug, input, type, limit) => {
    const definition = pieceFactoryDefinition(createFront).triggers?.find(
      (trigger) => trigger.slug === slug,
    );
    if (!definition || definition.type !== 'polling') {
      throw new Error(`Missing polling trigger ${slug}.`);
    }
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          _results: [
            { id: 'new', type, emitted_at: 2, conversation: { id: 'cnv' } },
            { id: 'old', type, emitted_at: 1, conversation: { id: 'cnv' } },
            { id: 'wrong', type: 'other', emitted_at: 3, conversation: { id: 'cnv' } },
          ],
          _pagination: { next: 'https://api2.frontapp.com/events?page_token=next' },
        })
        .mockResolvedValueOnce({
          _results: [{ id: 'later', type, emitted_at: 4, conversation: { id: 'cnv' } }],
        }),
    };

    await expect(
      definition.run({ client, input, cursor: 1_500, options: {}, req: req() } as never),
    ).resolves.toEqual({
      events: [
        { id: 'new', type, emitted_at: 2, conversation: { id: 'cnv' } },
        { id: 'later', type, emitted_at: 4, conversation: { id: 'cnv' } },
      ],
      cursor: 4_000,
    });
    expect(client.request).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining(`q%5Btypes%5D=${type}&limit=${limit}`),
    );
    expect(client.request).toHaveBeenNthCalledWith(
      2,
      'GET',
      'https://api2.frontapp.com/events?page_token=next',
    );
  });

  it('polls conversation status without repeating an old state', async () => {
    const definition = pieceFactoryDefinition(createFront).triggers?.find(
      (trigger) => trigger.slug === 'conversationStatusChanged',
    );
    if (!definition || definition.type !== 'polling') throw new Error('Missing status trigger.');
    const client = {
      request: vi.fn().mockResolvedValue({ id: 'cnv', status: 'archived', updated_at: 2 }),
    };

    await expect(
      definition.run({
        client,
        input: { conversationId: 'cnv', status: 'archived' },
        cursor: 1_000,
        options: {},
        req: req(),
      } as never),
    ).resolves.toEqual({
      events: [{ id: 'cnv', status: 'archived', updated_at: 2 }],
      cursor: 2_000,
    });
    await expect(
      definition.run({
        client,
        input: { conversationId: 'cnv', status: 'archived' },
        cursor: 2_000,
        options: {},
        req: req(),
      } as never),
    ).resolves.toEqual({ events: [], cursor: 2_000 });
  });

  it('keeps Front failures useful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('invalid token', { status: 401 })),
    );

    await expect(
      createFront({ auth }).createLink({
        input: { name: 'x', externalUrl: 'https://example.com' },
        req: req(),
      }),
    ).rejects.toThrow('Front request failed (401): invalid token');
  });
});
