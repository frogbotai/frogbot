import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createZendeskClient } from '../../../packages/pieces/piece-zendesk/src/client.js';
import {
  groupCreated,
  suspendedTicketCreated,
  ticketInView,
} from '../../../packages/pieces/piece-zendesk/src/triggers/polling.js';
import {
  organizationCreated,
  ticketCommentAdded,
  ticketCreated,
  ticketTagAdded,
  ticketUpdated,
  userCreated,
  userTagAdded,
} from '../../../packages/pieces/piece-zendesk/src/triggers/webhook.js';
import { api, auth, body, calls, json, path, query, stubZendesk } from './fixtures.js';

const client = createZendeskClient({ auth });
const secret = 'signing-secret';
const state = { webhookId: '01GZ', secret };
const timestamp = '2026-11-03T10:00:00Z';
const webhookUrl = 'https://app.test/api/triggers/zendesk/42';

function bare() {
  return { headers: new Headers() } as unknown as FrogBotRequest;
}

function delivery(
  data: unknown,
  { key = secret, signature }: { key?: string; signature?: string | null } = {},
) {
  const raw = JSON.stringify(data);
  const headers = new Headers({ 'x-zendesk-webhook-signature-timestamp': timestamp });
  const signed = createHmac('sha256', key).update(`${timestamp}${raw}`).digest('base64');

  if (signature !== null) headers.set('x-zendesk-webhook-signature', signature ?? signed);

  return { headers, text: () => Promise.resolve(raw) } as unknown as FrogBotRequest;
}

function event(
  type: string,
  detail: Record<string, unknown> = {},
  change: Record<string, unknown> = {},
) {
  return {
    id: `evt-${type}`,
    type: `zen:event-type:${type}`,
    time: '2026-11-03T10:00:00Z',
    account_id: 1,
    subject: 'zen:ticket:42',
    detail: { id: '42', organization_id: '9', ...detail },
    event: change,
  };
}

const run = <T extends { run: (args: never) => Promise<unknown> }>(
  trigger: T,
  input: Record<string, unknown>,
  req: FrogBotRequest,
) =>
  (
    trigger.run as (
      args: unknown,
    ) => Promise<Array<{ dedupeKey: string; data: Record<string, unknown> }>>
  )({
    input,
    client,
    options: {},
    req,
    state,
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Zendesk webhook triggers: onEnable and onDisable', () => {
  it.each([
    [ticketCreated, ['zen:event-type:ticket.created']],
    [ticketTagAdded, ['zen:event-type:ticket.tags_changed']],
    [ticketCommentAdded, ['zen:event-type:ticket.comment_added']],
    [organizationCreated, ['zen:event-type:organization.created']],
    [userCreated, ['zen:event-type:user.created']],
    [userTagAdded, ['zen:event-type:user.tags_changed']],
  ] as const)(
    '%#: creates a webhook for its events and keeps the signing secret',
    async (trigger, subscriptions) => {
      stubZendesk((call) =>
        call.method === 'POST'
          ? json({ webhook: { id: '01GZ', status: 'active' } }, 201)
          : json({ signing_secret: { algorithm: 'SHA256', secret } }),
      );

      await expect(
        trigger.onEnable({ input: {}, client, options: {}, req: bare(), webhookUrl }),
      ).resolves.toEqual(state);

      expect(calls[0]).toMatchObject({ method: 'POST', url: `${api}/webhooks` });
      expect(body(calls[0])).toEqual({
        webhook: {
          name: `FrogBot ${trigger.slug}`,
          status: 'active',
          endpoint: webhookUrl,
          http_method: 'POST',
          request_format: 'json',
          subscriptions,
        },
      });
      expect(calls[1]).toMatchObject({ method: 'GET', url: `${api}/webhooks/01GZ/signing_secret` });
    },
  );

  it('ticketUpdated subscribes to every ticket change but creation', async () => {
    stubZendesk((call) =>
      call.method === 'POST'
        ? json({ webhook: { id: '01GZ' } }, 201)
        : json({ signing_secret: { secret } }),
    );

    await ticketUpdated.onEnable({ input: {}, client, options: {}, req: bare(), webhookUrl });

    const subscriptions: string[] = body(calls[0]).webhook.subscriptions;

    expect(subscriptions).toEqual(
      expect.arrayContaining([
        'zen:event-type:ticket.status_changed',
        'zen:event-type:ticket.tags_changed',
        'zen:event-type:ticket.comment_added',
        'zen:event-type:ticket.merged',
        'zen:event-type:ticket.soft_deleted',
        'zen:event-type:ticket.undeleted',
        'zen:event-type:ticket.marked_as_spam',
      ]),
    );
    expect(subscriptions).not.toContain('zen:event-type:ticket.created');
    expect(
      subscriptions.every(
        (type) =>
          type.endsWith('_changed') ||
          ['comment_added', 'merged', 'soft_deleted', 'undeleted', 'marked_as_spam'].some((name) =>
            type.endsWith(`.${name}`),
          ),
      ),
    ).toBe(true);
  });

  it.each([
    ['no secret', () => json({ signing_secret: {} })],
    ['a failed secret read', () => json({ error: 'Forbidden' }, 403)],
  ])('deletes the webhook it created after %s', async (_, secretResponse) => {
    stubZendesk((call) => {
      if (call.method === 'POST') return json({ webhook: { id: '01GZ' } }, 201);
      if (call.method === 'DELETE') return new Response(null, { status: 204 });

      return secretResponse();
    });

    await expect(
      ticketCreated.onEnable({ input: {}, client, options: {}, req: bare(), webhookUrl }),
    ).rejects.toThrow();
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: `${api}/webhooks/01GZ` });
  });

  it('fails without deleting when Zendesk returns no webhook id', async () => {
    stubZendesk(() => json({ webhook: {} }, 201));

    await expect(
      ticketCreated.onEnable({ input: {}, client, options: {}, req: bare(), webhookUrl }),
    ).rejects.toThrow('Zendesk did not return an id for the ticketCreated webhook.');
    expect(calls).toHaveLength(1);
  });

  it('deletes the webhook, treating a 404 as done', async () => {
    stubZendesk(() => json({ errors: [{ title: 'Not found' }] }, 404));

    await expect(
      ticketCreated.onDisable({ input: {}, client, options: {}, req: bare(), state }),
    ).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: `${api}/webhooks/01GZ` });
  });

  it('throws other delete failures', async () => {
    stubZendesk(() => json({ error: 'Forbidden', description: 'No access' }, 403));

    await expect(
      ticketCreated.onDisable({ input: {}, client, options: {}, req: bare(), state }),
    ).rejects.toThrow('Zendesk request failed (403): Forbidden; No access');
  });
});

describe('Zendesk webhook triggers: run', () => {
  const created = event('ticket.created', { subject: 'Help' });

  it('emits a signed delivery once, keyed by its event id', async () => {
    await expect(run(ticketCreated, {}, delivery(created))).resolves.toEqual([
      {
        dedupeKey: 'evt-ticket.created',
        data: {
          id: 'evt-ticket.created',
          type: 'ticket.created',
          time: '2026-11-03T10:00:00Z',
          detail: { id: '42', organization_id: '9', subject: 'Help' },
          event: {},
        },
      },
    ]);
  });

  it.each([
    ['a bad signature', { key: 'other' }, 'Zendesk webhook signature is invalid.'],
    ['a garbled signature', { signature: 'not base64!' }, 'Zendesk webhook signature is invalid.'],
    ['no signature', { signature: null }, 'Zendesk webhook signature headers are missing.'],
  ])('rejects %s', async (_, options, message) => {
    await expect(run(ticketCreated, {}, delivery(created, options))).rejects.toThrow(message);
  });

  it('drops an event type it did not subscribe to', async () => {
    await expect(run(ticketCreated, {}, delivery(event('ticket.status_changed')))).resolves.toEqual(
      [],
    );
  });

  it.each([
    [ticketCreated, { organizationId: 9 }, created, 1],
    [ticketCreated, { organizationId: 10 }, created, 0],
    [ticketUpdated, { ticketId: 42 }, event('ticket.status_changed'), 1],
    [ticketUpdated, { ticketId: 43 }, event('ticket.status_changed'), 0],
    [ticketUpdated, { organizationId: 10 }, event('ticket.merged'), 0],
    [ticketCommentAdded, { ticketId: 43 }, event('ticket.comment_added'), 0],
    [userCreated, { role: 'agent' }, event('user.created', { role: 'agent' }), 1],
    [userCreated, { role: 'admin' }, event('user.created', { role: 'agent' }), 0],
    [userCreated, {}, event('user.created', { role: 'end-user' }), 1],
    [organizationCreated, {}, event('organization.created'), 1],
  ] as const)('%#: filters on its inputs', async (trigger, input, value, count) => {
    await expect(run(trigger, input, delivery(value))).resolves.toHaveLength(count);
  });

  it('ticketTagAdded emits added tags, only the one asked for, and never removals alone', async () => {
    const added = event(
      'ticket.tags_changed',
      {},
      { tags_added: ['vip', 'refund'], tags_removed: [] },
    );

    const removed = event('ticket.tags_changed', {}, { tags_added: [], tags_removed: ['vip'] });

    const [emitted] = await run(ticketTagAdded, {}, delivery(added));

    expect(emitted?.data.tagsAdded).toEqual(['vip', 'refund']);
    await expect(run(ticketTagAdded, { tag: 'refund' }, delivery(added))).resolves.toHaveLength(1);
    await expect(run(ticketTagAdded, { tag: 'spam' }, delivery(added))).resolves.toHaveLength(0);
    await expect(run(ticketTagAdded, {}, delivery(removed))).resolves.toHaveLength(0);
  });

  it('ticketCommentAdded says whether the comment is public', async () => {
    const note = event(
      'ticket.comment_added',
      {},
      { comment: { id: '5', body: 'Internal', is_public: false } },
    );

    const reply = event(
      'ticket.comment_added',
      {},
      { comment: { id: '6', body: 'Hi', is_public: true } },
    );

    const [first] = await run(ticketCommentAdded, {}, delivery(note));
    const [second] = await run(ticketCommentAdded, { organizationId: 9 }, delivery(reply));

    expect(first?.data).toMatchObject({
      isPublic: false,
      event: { comment: { body: 'Internal' } },
    });
    expect(second?.data).toMatchObject({ isPublic: true });
  });

  it('userTagAdded emits added tags and ignores removals alone', async () => {
    const added = event(
      'user.tags_changed',
      {},
      { added: { tags: ['vip'] }, removed: { tags: [] } },
    );

    const removed = event(
      'user.tags_changed',
      {},
      { added: { tags: [] }, removed: { tags: ['vip'] } },
    );

    const [emitted] = await run(userTagAdded, {}, delivery(added));

    expect(emitted?.data.tagsAdded).toEqual(['vip']);
    await expect(run(userTagAdded, {}, delivery(removed))).resolves.toEqual([]);
  });
});

type Poll = (args: {
  input: Record<string, unknown>;
  cursor?: unknown;
  client: unknown;
  options: unknown;
  req: unknown;
}) => Promise<{ events: Array<{ id: number }>; cursor?: unknown }>;

function poll(trigger: { run: unknown }, input: Record<string, unknown>, cursor?: unknown) {
  return (trigger.run as Poll)({ input, cursor, client, options: {}, req: bare() });
}

describe('Zendesk polling triggers', () => {
  it('ticketInView records the view, then emits only tickets new to it', async () => {
    let ids = [1, 2];

    stubZendesk(() =>
      json({ tickets: ids.map((id) => ({ id, subject: `T${id}` })), meta: { has_more: false } }),
    );

    const first = await poll(ticketInView, { viewId: 360 });

    expect(path(calls[0])).toBe('/api/v2/views/360/tickets');
    expect(query(calls[0])).toEqual({ 'page[size]': '100' });
    expect(first).toEqual({ events: [], cursor: { ids: [1, 2] } });

    ids = [2, 3, 4];

    const second = await poll(ticketInView, { viewId: 360 }, first.cursor);

    expect(second.events.map((item) => item.id)).toEqual([3, 4]);
    expect(second.cursor).toEqual({ ids: [2, 3, 4] });
  });

  it('ticketInView reads at most 500 tickets', async () => {
    let page = 0;

    stubZendesk(() => {
      page++;

      return json({
        tickets: Array.from({ length: 100 }, (_, index) => ({ id: page * 1000 + index })),
        meta: { has_more: true, after_cursor: `c${page}` },
      });
    });

    const result = await poll(ticketInView, { viewId: 360 });

    expect(calls).toHaveLength(5);
    expect((result.cursor as { ids: number[] }).ids).toHaveLength(500);
  });

  it('groupCreated keeps the newest created_at, then emits only newer groups', async () => {
    let groups = [
      { id: 1, name: 'Support', created_at: '2026-01-01T00:00:00Z' },
      { id: 2, name: 'Billing', created_at: '2026-02-01T00:00:00Z' },
    ];

    stubZendesk(() => json({ groups, meta: { has_more: false } }));

    const first = await poll(groupCreated, {});

    expect(first).toEqual({
      events: [],
      cursor: { createdAt: '2026-02-01T00:00:00.000Z', ids: [2] },
    });

    groups = [
      ...groups,
      { id: 4, name: 'Sales', created_at: '2026-03-01T00:00:00Z' },
      { id: 3, name: 'Same second', created_at: '2026-02-01T00:00:00Z' },
    ];

    const second = await poll(groupCreated, {}, first.cursor);

    expect(second.events.map((item) => item.id)).toEqual([3, 4]);
    expect(second.cursor).toEqual({ createdAt: '2026-03-01T00:00:00.000Z', ids: [4] });

    const third = await poll(groupCreated, {}, second.cursor);

    expect(third.events).toEqual([]);
  });

  it('suspendedTicketCreated keeps the highest id, then emits newer ones oldest first', async () => {
    let suspended = [{ id: 20, subject: 'Spam?', cause: 'Detected as spam' }];

    stubZendesk(() => json({ suspended_tickets: suspended, meta: { has_more: false } }));

    const first = await poll(suspendedTicketCreated, {});

    expect(path(calls[0])).toBe('/api/v2/suspended_tickets');
    expect(query(calls[0])).toEqual({
      sort_by: 'created_at',
      sort_order: 'desc',
      'page[size]': '100',
    });
    expect(first).toEqual({ events: [], cursor: { lastId: 20 } });

    suspended = [
      { id: 22, subject: 'B', cause: 'x' },
      { id: 21, subject: 'A', cause: 'x' },
      ...suspended,
    ];

    const second = await poll(suspendedTicketCreated, {}, first.cursor);

    expect(second.events.map((item) => item.id)).toEqual([21, 22]);
    expect(second.cursor).toEqual({ lastId: 22 });
  });

  it('suspendedTicketCreated starts at zero on an empty queue, so the first one is emitted', async () => {
    stubZendesk(() => json({ suspended_tickets: [], meta: { has_more: false } }));

    const first = await poll(suspendedTicketCreated, {});

    expect(first).toEqual({ events: [], cursor: { lastId: 0 } });

    stubZendesk(() => json({ suspended_tickets: [{ id: 5 }], meta: { has_more: false } }));

    await expect(poll(suspendedTicketCreated, {}, first.cursor)).resolves.toMatchObject({
      events: [{ id: 5 }],
    });
  });
});
