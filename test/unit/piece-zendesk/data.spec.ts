import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createZendesk } from '../../../packages/pieces/piece-zendesk/src/index.js';
import {
  api,
  basic,
  calls,
  filesReq,
  json,
  origin,
  path,
  query,
  req,
  stubZendesk,
} from './fixtures.js';

const zendesk = createZendesk({});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Zendesk exports', () => {
  it('starts a cursor export at startTime and maps after_cursor and end_of_stream', async () => {
    stubZendesk(() =>
      json({
        tickets: [{ id: 1, subject: 'Help', custom_fields: [{ id: 9, value: 'x' }] }],
        after_cursor: 'MTU3',
        before_cursor: null,
        end_of_stream: false,
      }),
    );

    const result = await zendesk.exportTickets({
      input: { startTime: '2026-01-01T00:00:00Z', excludeDeleted: true },
      req: req(),
    });

    expect(path(calls[0])).toBe('/api/v2/incremental/tickets/cursor');
    expect(query(calls[0])).toEqual({ start_time: '1767225600', exclude_deleted: 'true' });
    expect(result).toEqual({
      data: [{ id: 1, subject: 'Help', custom_fields: [{ id: 9, value: 'x' }] }],
      pagination: { count: 1, hasMore: true, nextCursor: 'MTU3' },
    });
  });

  it('continues a cursor export and keeps the cursor at the end of the stream', async () => {
    stubZendesk(() => json({ users: [], after_cursor: 'MTU4', end_of_stream: true }));

    const result = await zendesk.exportUsers({ input: { cursor: 'MTU3' }, req: req() });

    expect(path(calls[0])).toBe('/api/v2/incremental/users/cursor');
    expect(query(calls[0])).toEqual({ cursor: 'MTU3' });
    expect(result.pagination).toEqual({ count: 0, hasMore: false, nextCursor: 'MTU4' });
  });

  it.each([
    ['exportOrganizations', '/api/v2/incremental/organizations', 'organizations', {}],
    [
      'exportTicketEvents',
      '/api/v2/incremental/ticket_events',
      'ticket_events',
      { include: 'comment_events' },
    ],
  ] as const)('%s pages by end_time', async (slug, route, key, extra) => {
    const record =
      key === 'ticket_events' ? { id: 5, ticket_id: 1, child_events: [] } : { id: 5, name: 'Acme' };

    stubZendesk(() =>
      json({ [key]: [record], end_time: 1767225700, end_of_stream: false, next_page: 'x' }),
    );

    const result = await zendesk[slug]({ input: { cursor: '1767225600' }, req: req() });

    expect(path(calls[0])).toBe(route);
    expect(query(calls[0])).toEqual({ ...extra, start_time: '1767225600' });
    expect(result).toEqual({
      data: [record],
      pagination: { count: 1, hasMore: true, nextCursor: '1767225700' },
    });
  });

  it('exportArticles ends when Help Center sends no next_page', async () => {
    stubZendesk(() =>
      json({ articles: [{ id: 7, title: 'Reset' }], end_time: 1767225700, next_page: null }),
    );

    const result = await zendesk.exportArticles({
      input: { startTime: '2026-01-01T00:00:00Z' },
      req: req(),
    });

    expect(path(calls[0])).toBe('/api/v2/help_center/incremental/articles');
    expect(result.pagination).toEqual({ count: 1, hasMore: false, nextCursor: '1767225700' });
  });

  it.each([
    [{ startTime: '2026-01-01T00:00:00Z', cursor: 'MTU3' }, 'not both'],
    [{}, 'not both'],
    [{ startTime: 'yesterday' }, 'Invalid ISO datetime'],
  ])('refuses %j unsent', async (input, message) => {
    stubZendesk(() => json({}));

    await expect(zendesk.exportTickets({ input, req: req() })).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  it('refuses a startTime under a minute old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-03T12:00:00Z'));
    stubZendesk(() => json({}));

    await expect(
      zendesk.exportUsers({ input: { startTime: '2026-11-03T11:59:30Z' }, req: req() }),
    ).rejects.toThrow('startTime must be at least a minute ago.');
    expect(calls).toHaveLength(0);

    stubZendesk(() => json({ users: [], after_cursor: null, end_of_stream: true }));

    await expect(
      zendesk.exportUsers({ input: { startTime: '2026-11-03T11:58:59Z' }, req: req() }),
    ).resolves.toMatchObject({ pagination: { hasMore: false, nextCursor: null } });
  });
});

describe('Zendesk lists', () => {
  it('sends page[size] and page[after] and maps meta', async () => {
    stubZendesk(() =>
      json({
        comments: [
          {
            id: 11,
            public: false,
            body: 'Internal note',
            attachments: [
              {
                id: 3,
                file_name: 'a.png',
                content_url: `${origin}/attachments/token/t/?name=a.png`,
              },
            ],
          },
        ],
        meta: { has_more: true, after_cursor: 'xyz' },
      }),
    );

    const result = await zendesk.listTicketComments({
      input: { ticketId: 42, limit: 25, cursor: 'abc' },
      req: req(),
    });

    expect(path(calls[0])).toBe('/api/v2/tickets/42/comments');
    expect(query(calls[0])).toEqual({ 'page[size]': '25', 'page[after]': 'abc' });
    expect(calls[0]?.headers.get('authorization')).toBe(basic);
    expect(result.data[0]).toMatchObject({ id: 11, public: false });
    expect(result.data[0]?.attachments[0]?.id).toBe(3);
    expect(result.pagination).toEqual({ count: 1, hasMore: true, nextCursor: 'xyz', limit: 25 });
  });

  it.each([
    ['listGroups', '/api/v2/groups', 'groups'],
    ['listTicketFields', '/api/v2/ticket_fields', 'ticket_fields'],
    ['listUserFields', '/api/v2/user_fields', 'user_fields'],
    ['listOrganizationFields', '/api/v2/organization_fields', 'organization_fields'],
    ['listCategories', '/api/v2/help_center/categories', 'categories'],
    ['listSections', '/api/v2/help_center/sections', 'sections'],
    ['listMacros', '/api/v2/macros', 'macros'],
    ['listViews', '/api/v2/views', 'views'],
  ] as const)('%s reads %s with the default limit', async (slug, route, key) => {
    stubZendesk(() => json({ [key]: [{ id: 1 }], meta: { has_more: false, after_cursor: 'end' } }));

    const result = await zendesk[slug]({ input: {}, req: req() });

    expect(path(calls[0])).toBe(route);
    expect(query(calls[0])).toEqual({ 'page[size]': '100' });
    expect(result).toEqual({
      data: [{ id: 1 }],
      pagination: { count: 1, hasMore: false, nextCursor: null, limit: 100 },
    });
  });

  it('listSlaPolicies returns everything with no paging', async () => {
    stubZendesk(() =>
      json({
        sla_policies: [
          { id: 1, title: 'Gold' },
          { id: 2, title: 'Silver' },
        ],
      }),
    );

    const result = await zendesk.listSlaPolicies({ input: {}, req: req() });

    expect(path(calls[0])).toBe('/api/v2/slas/policies');
    expect(query(calls[0])).toEqual({});
    expect(result.pagination).toEqual({ count: 2, hasMore: false, nextCursor: null, limit: 100 });
  });

  it.each([0, 101])('refuses limit %i', async (limit) => {
    stubZendesk(() => json({}));

    await expect(zendesk.listGroups({ input: { limit }, req: req() })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('Zendesk downloadAttachment', () => {
  const meta = {
    id: 3,
    file_name: 'log.txt',
    content_type: 'text/plain',
    size: 8,
    content_url: `${origin}/attachments/token/abc/?name=log.txt`,
  };

  it('saves the file, sending the token only to the account', async () => {
    const { req: request, create } = filesReq();
    const cdn = 'https://acme.zdusercontent.com/attachment/1/log.txt?token=signed';

    stubZendesk((call) => {
      if (call.url === `${api}/attachments/3`) return json({ attachment: meta });
      if (call.url === meta.content_url) {
        return new Response(null, { status: 302, headers: { location: cdn } });
      }

      return new Response('log body', { headers: { 'content-type': 'text/plain' } });
    });

    const result = await zendesk.downloadAttachment({ input: { attachmentId: 3 }, req: request });

    expect(calls.map((call) => call.url)).toEqual([`${api}/attachments/3`, meta.content_url, cdn]);
    expect(calls[1]?.headers.get('authorization')).toBe(basic);
    expect(calls[1]?.redirect).toBe('manual');
    expect(calls[2]?.headers.get('authorization')).toBeNull();
    expect(calls[2]?.redirect).toBe('manual');

    const args = create.mock.calls[0][0] as unknown as {
      collection: string;
      overrideAccess: boolean;
      file: { data: Buffer; name: string; mimetype: string; size: number };
    };

    expect(args).toMatchObject({ collection: 'files', overrideAccess: false });
    expect(args.file).toMatchObject({ name: 'log.txt', mimetype: 'text/plain', size: 8 });
    expect(args.file.data.toString()).toBe('log body');
    expect(result).toEqual({
      attachment: meta,
      file: {
        fileId: 'file-log.txt',
        name: 'log.txt',
        mimeType: 'text/plain',
        size: 8,
        url: '/api/files/file/log.txt',
      },
    });
  });

  it('refuses a non-HTTPS hop', async () => {
    const { req: request, create } = filesReq();

    stubZendesk((call) =>
      call.url === `${api}/attachments/3`
        ? json({ attachment: meta })
        : new Response(null, { status: 302, headers: { location: 'http://cdn.example.com/x' } }),
    );

    await expect(
      zendesk.downloadAttachment({ input: { attachmentId: 3 }, req: request }),
    ).rejects.toThrow('non-HTTPS');
    expect(calls).toHaveLength(2);
    expect(create).not.toHaveBeenCalled();
  });

  it('stops after five redirects', async () => {
    const { req: request } = filesReq();

    stubZendesk((call) =>
      call.url === `${api}/attachments/3`
        ? json({ attachment: meta })
        : new Response(null, { status: 302, headers: { location: meta.content_url } }),
    );

    await expect(
      zendesk.downloadAttachment({ input: { attachmentId: 3 }, req: request }),
    ).rejects.toThrow('redirected too many times');
    expect(calls).toHaveLength(7);
  });
});
