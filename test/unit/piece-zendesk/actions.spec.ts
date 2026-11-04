import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createZendesk } from '../../../packages/pieces/piece-zendesk/src/index.js';
import { api, basic, body, calls, json, path, query, req, stubZendesk } from './fixtures.js';

const zendesk = createZendesk({});
const ticket = { id: 42, subject: 'Help', status: 'open', tags: ['vip'] };
const user = { id: 7, name: 'Dana', email: 'dana@acme.com', role: 'agent' };
const organization = { id: 9, name: 'Acme' };

afterEach(() => vi.unstubAllGlobals());

describe('Zendesk ticket actions', () => {
  it('createTicket sends the comment, the requester and snake_case fields', async () => {
    stubZendesk(() => json({ ticket }, 201));

    const result = await zendesk.createTicket({
      input: {
        subject: 'Help',
        commentBody: 'It broke',
        commentPublic: false,
        requesterEmail: 'sam@example.com',
        priority: 'high',
        tags: ['vip'],
        assigneeEmail: 'dana@acme.com',
        groupId: 3,
        customFields: [{ id: 100, value: 'gold' }],
        collaboratorEmails: ['cc@example.com'],
        followerEmails: ['lead@acme.com'],
        externalId: '',
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'POST', url: `${api}/tickets` });
    expect(body(calls[0])).toEqual({
      ticket: {
        subject: 'Help',
        priority: 'high',
        tags: ['vip'],
        assignee_email: 'dana@acme.com',
        group_id: 3,
        custom_fields: [{ id: 100, value: 'gold' }],
        collaborators: ['cc@example.com'],
        followers: [{ user_email: 'lead@acme.com', action: 'put' }],
        comment: { body: 'It broke', public: false },
        requester: { email: 'sam@example.com', name: 'sam@example.com' },
      },
    });
    expect(result).toEqual({ ticket });
  });

  it('createTicket needs a comment', async () => {
    stubZendesk(() => json({ ticket }));

    await expect(zendesk.createTicket({ input: { subject: 'x' }, req: req() })).rejects.toThrow(
      'createTicket needs commentBody or commentHtmlBody.',
    );
    expect(calls).toHaveLength(0);
  });

  it('updateTicket PUTs only the given fields, with a safe update', async () => {
    stubZendesk(() => json({ ticket, audit: { id: 1 } }));

    const result = await zendesk.updateTicket({
      input: {
        ticketId: 42,
        status: 'solved',
        commentHtmlBody: '<p>Done</p>',
        requesterId: 8,
        customStatusId: 5,
        updatedStamp: '2026-11-01T10:00:00Z',
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'PUT', url: `${api}/tickets/42` });
    expect(body(calls[0])).toEqual({
      ticket: {
        status: 'solved',
        requester_id: 8,
        custom_status_id: 5,
        comment: { html_body: '<p>Done</p>' },
        safe_update: true,
        updated_stamp: '2026-11-01T10:00:00Z',
      },
    });
    expect(result).toEqual({ ticket });
  });

  it('addTagToTicket and removeTagFromTicket return the tags left', async () => {
    stubZendesk((call) => json({ tags: call.method === 'PUT' ? ['vip', 'new'] : ['vip'] }));

    await expect(
      zendesk.addTagToTicket({ input: { ticketId: 42, tags: ['new'] }, req: req() }),
    ).resolves.toEqual({ tags: ['vip', 'new'] });
    await expect(
      zendesk.removeTagFromTicket({ input: { ticketId: 42, tags: ['new'] }, req: req() }),
    ).resolves.toEqual({ tags: ['vip'] });

    expect(calls.map((call) => [call.method, path(call), body(call)])).toEqual([
      ['PUT', '/api/v2/tickets/42/tags', { tags: ['new'] }],
      ['DELETE', '/api/v2/tickets/42/tags', { tags: ['new'] }],
    ]);
  });

  it.each([
    [{ public: true }, { body: 'Thanks!', public: true }],
    [{}, { body: 'Thanks!', public: true }],
    [
      { public: false, authorId: 7, uploads: ['tok'] },
      { body: 'Thanks!', public: false, author_id: 7, uploads: ['tok'] },
    ],
  ])('addCommentToTicket %j', async (extra, expected) => {
    stubZendesk(() => json({ ticket }));

    const result = await zendesk.addCommentToTicket({
      input: { ticketId: 42, body: 'Thanks!', ...extra },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'PUT', url: `${api}/tickets/42` });
    expect(body(calls[0])).toEqual({ ticket: { comment: expected } });
    expect(result).toEqual({ ticket });
  });

  it('attachFileToTicket uploads the bytes, then attaches the token on a comment', async () => {
    const findByID = vi.fn().mockResolvedValue({
      id: 'f1',
      url: '/api/files/file/log.txt',
      filename: 'log.txt',
      mimeType: 'text/plain',
    });

    const request = req({
      headers: new Headers({ cookie: 'session=1' }),
      url: 'https://app.test/api',
    }) as unknown as { frogbot: Record<string, unknown> };

    Object.assign(request.frogbot, {
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
      findByID,
    });

    const upload = { id: 5, file_name: 'log.txt', content_url: 'https://acme.zendesk.com/a/5' };

    stubZendesk((call) => {
      if (call.url.startsWith('https://app.test/')) return new Response('log body');
      if (path(call) === '/api/v2/uploads') {
        return json({ upload: { token: 'tok', attachment: upload } }, 201);
      }

      return json({ ticket });
    });

    const result = await zendesk.attachFileToTicket({
      input: { ticketId: 42, file: { fileId: 'f1' }, public: false },
      req: request as unknown as FrogBotRequest,
    });

    expect(calls[0]?.headers.get('authorization')).toBeNull();
    expect(calls[1]).toMatchObject({ method: 'POST', url: `${api}/uploads?filename=log.txt` });
    expect(calls[1]?.headers.get('authorization')).toBe(basic);
    expect(calls[1]?.headers.get('content-type')).toBe('text/plain');
    expect(new TextDecoder().decode(calls[1]?.raw as Uint8Array)).toBe('log body');
    expect(calls[2]).toMatchObject({ method: 'PUT', url: `${api}/tickets/42` });
    expect(body(calls[2])).toEqual({
      ticket: { comment: { body: 'File attached: log.txt', uploads: ['tok'], public: false } },
    });
    expect(result).toEqual({ ticket, attachment: upload, uploadToken: 'tok' });
  });
});

describe('Zendesk user and organization actions', () => {
  it('createUser maps fields and a new organization', async () => {
    stubZendesk(() => json({ user }, 201));

    const result = await zendesk.createUser({
      input: {
        name: 'Dana',
        email: 'dana@acme.com',
        role: 'agent',
        timeZone: 'Berlin',
        skipVerifyEmail: true,
        organizationName: 'Acme',
        userFields: { plan: 'gold' },
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'POST', url: `${api}/users` });
    expect(body(calls[0])).toEqual({
      user: {
        name: 'Dana',
        email: 'dana@acme.com',
        role: 'agent',
        time_zone: 'Berlin',
        skip_verify_email: true,
        user_fields: { plan: 'gold' },
        organization: { name: 'Acme' },
      },
    });
    expect(result).toEqual({ user });
  });

  it('updateUser and deleteUser target the user', async () => {
    stubZendesk(() => json({ user }));

    await zendesk.updateUser({ input: { userId: 7, phone: '+1555', tags: ['vip'] }, req: req() });

    await expect(zendesk.deleteUser({ input: { userId: 7 }, req: req() })).resolves.toEqual({
      user,
    });

    expect(calls.map((call) => [call.method, path(call), call.body && body(call)])).toEqual([
      ['PUT', '/api/v2/users/7', { user: { phone: '+1555', tags: ['vip'] } }],
      ['DELETE', '/api/v2/users/7', undefined],
    ]);
  });

  it('createOrganization and updateOrganization send snake_case fields', async () => {
    stubZendesk(() => json({ organization }));

    await zendesk.createOrganization({
      input: {
        name: 'Acme',
        domainNames: ['acme.com'],
        sharedTickets: true,
        organizationFields: { tier: 1 },
      },
      req: req(),
    });

    await zendesk.updateOrganization({
      input: { organizationId: 9, notes: 'Key account', groupId: 3 },
      req: req(),
    });

    expect(calls.map((call) => [call.method, path(call), body(call)])).toEqual([
      [
        'POST',
        '/api/v2/organizations',
        {
          organization: {
            name: 'Acme',
            domain_names: ['acme.com'],
            shared_tickets: true,
            organization_fields: { tier: 1 },
          },
        },
      ],
      ['PUT', '/api/v2/organizations/9', { organization: { notes: 'Key account', group_id: 3 } }],
    ]);
  });
});

describe('Zendesk find actions', () => {
  it('findTickets ANDs the inputs into one search', async () => {
    stubZendesk(() => json({ results: [ticket], count: 31, next_page: 'x' }));

    const result = await zendesk.findTickets({
      input: {
        text: 'refund',
        status: 'open',
        type: 'incident',
        tag: 'vip',
        requesterEmail: 'sam@example.com',
        query: 'created>2026-01-01',
        sortBy: 'updated_at',
        sortOrder: 'desc',
        limit: 10,
      },
      req: req(),
    });

    expect(path(calls[0])).toBe('/api/v2/search');
    expect(query(calls[0])).toEqual({
      query:
        'type:ticket refund status:"open" ticket_type:"incident" tags:"vip" requester:"sam@example.com" created>2026-01-01',
      sort_by: 'updated_at',
      sort_order: 'desc',
      per_page: '10',
    });
    expect(result).toEqual({ results: [ticket], count: 31 });
  });

  it('findUser and findOrganization search their type', async () => {
    stubZendesk((call) =>
      json({
        results: [query(call).query?.startsWith('type:user') ? user : organization],
        count: 1,
      }),
    );

    await expect(
      zendesk.findUser({ input: { email: 'dana@acme.com', role: 'agent' }, req: req() }),
    ).resolves.toEqual({ results: [user], count: 1 });
    await expect(
      zendesk.findOrganization({ input: { name: 'Acme "Inc"', domain: 'acme.com' }, req: req() }),
    ).resolves.toEqual({ results: [organization], count: 1 });

    expect(calls.map((call) => query(call).query)).toEqual([
      'type:user email:"dana@acme.com" role:"agent"',
      'type:organization name:"Acme Inc" domain:"acme.com"',
    ]);
    expect(query(calls[0]).per_page).toBe('25');
  });

  it('findAgent returns the exact email match among staff, or null', async () => {
    stubZendesk(() =>
      json({ results: [{ ...user, id: 6, email: 'dana.old@acme.com' }, user], count: 2 }),
    );

    await expect(
      zendesk.findAgent({ input: { email: 'Dana@acme.com' }, req: req() }),
    ).resolves.toEqual({ agent: user });
    expect(query(calls[0]).query).toBe('type:user -role:end-user email:"Dana@acme.com"');

    stubZendesk(() => json({ results: [], count: 0 }));

    await expect(zendesk.findAgent({ input: { name: 'Nobody' }, req: req() })).resolves.toEqual({
      agent: null,
    });
    await expect(zendesk.findAgent({ input: {}, req: req() })).rejects.toThrow(
      'findAgent needs an email or a name.',
    );
  });

  it('findGroup walks the group pages for the name', async () => {
    stubZendesk((call) =>
      query(call)['page[after]']
        ? json({ groups: [{ id: 2, name: 'Billing' }], meta: { has_more: false } })
        : json({
            groups: [{ id: 1, name: 'Support' }],
            meta: { has_more: true, after_cursor: 'c2' },
          }),
    );

    await expect(zendesk.findGroup({ input: { name: ' billing ' }, req: req() })).resolves.toEqual({
      group: { id: 2, name: 'Billing' },
    });
    expect(calls.map((call) => query(call))).toEqual([
      { 'page[size]': '100' },
      { 'page[size]': '100', 'page[after]': 'c2' },
    ]);

    await expect(zendesk.findGroup({ input: { name: 'Sales' }, req: req() })).resolves.toEqual({
      group: null,
    });
  });

  it('findLatestComment skips internal notes unless asked', async () => {
    const note = { id: 3, public: false, body: 'Internal', attachments: [] };
    const reply = { id: 2, public: true, body: 'Reply', attachments: [] };

    stubZendesk(() => json({ comments: [note, reply], meta: { has_more: false } }));

    await expect(
      zendesk.findLatestComment({ input: { ticketId: 42 }, req: req() }),
    ).resolves.toEqual({ comment: reply });
    expect(path(calls[0])).toBe('/api/v2/tickets/42/comments');
    expect(query(calls[0])).toEqual({ sort_order: 'desc', 'page[size]': '100' });

    await expect(
      zendesk.findLatestComment({ input: { ticketId: 42, includePrivate: true }, req: req() }),
    ).resolves.toEqual({ comment: note });
  });
});
