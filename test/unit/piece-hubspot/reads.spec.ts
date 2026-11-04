import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { createHubSpot } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { body, calls, json, path, query, req, stubHubSpot } from './fixtures.js';

const hubspot = createHubSpot({});

afterEach(() => vi.unstubAllGlobals());

const contact = {
  id: '51',
  properties: { email: 'dana@acme.com', firstname: 'Dana', lastname: null },
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-02-02T03:04:05.000Z',
  archived: false,
  associations: { companies: { results: [{ id: '7', type: 'contact_to_company' }] } },
};

describe('listRecords', () => {
  it('sends limit, after, properties and associations, and maps paging.next.after', async () => {
    stubHubSpot((call) =>
      query(call).after
        ? json({ results: [] })
        : json({
            results: [contact],
            paging: { next: { after: 'NTI', link: 'https://api.hubapi.com/x' } },
          }),
    );

    const input = {
      objectType: 'contacts' as const,
      properties: ['email', 'firstname', 'lastname'],
      associations: ['companies', 'deals'],
      limit: 1,
    };

    const first = await hubspot.listRecords({ input, req: req() });
    const last = await hubspot.listRecords({
      input: { ...input, cursor: first.nextCursor ?? undefined },
      req: req(),
    });

    expect(path(calls[0])).toBe('/crm/v3/objects/contacts');
    expect(query(calls[0])).toEqual({
      limit: '1',
      properties: 'email,firstname,lastname',
      associations: 'companies,deals',
    });
    expect(query(calls[1])).toEqual({ ...query(calls[0]), after: 'NTI' });
    expect(first).toEqual({ results: [contact], nextCursor: 'NTI' });
    expect(last).toEqual({ results: [], nextCursor: null });
  });

  it.each(['notes', 'line_items', '2-3456789'])('reads %s with 100 per page', async (type) => {
    stubHubSpot(() => json({ results: [] }));

    await hubspot.listRecords({ input: { objectType: type as 'notes' }, req: req() });

    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}`);
    expect(query(calls[0])).toEqual({ limit: '100' });
  });

  it('refuses an unknown object type and a limit over 100', async () => {
    stubHubSpot(() => json({ results: [] }));

    await expect(
      hubspot.listRecords({ input: { objectType: '../owners' as 'notes' }, req: req() }),
    ).rejects.toThrow();
    await expect(
      hubspot.listRecords({ input: { objectType: 'deals', limit: 101 }, req: req() }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('listAssociations', () => {
  it('gives each record its own labels and cursor', async () => {
    stubHubSpot(() =>
      json(
        {
          status: 'COMPLETE',
          results: [
            {
              from: { id: '51' },
              to: [
                {
                  toObjectId: 7,
                  associationTypes: [
                    { category: 'HUBSPOT_DEFINED', typeId: 1, label: 'Primary' },
                    { category: 'HUBSPOT_DEFINED', typeId: 279, label: null },
                  ],
                },
              ],
              paging: { next: { after: 'MTA', link: null } },
            },
            {
              from: { id: '52' },
              to: [
                {
                  toObjectId: 8,
                  associationTypes: [{ category: 'USER_DEFINED', typeId: 3, label: 'Billing' }],
                },
              ],
            },
          ],
          errors: [{ status: 'error', category: 'OBJECT_NOT_FOUND', message: 'No associations' }],
        },
        207,
      ),
    );

    const result = await hubspot.listAssociations({
      input: {
        fromType: 'contacts',
        toType: 'companies',
        ids: ['51', '52', '53'],
        cursors: { '52': 'NTA' },
      },
      req: req(),
    });

    expect(calls[0]?.method).toBe('POST');
    expect(path(calls[0])).toBe('/crm/v4/associations/contacts/companies/batch/read');
    expect(body(calls[0])).toEqual({
      inputs: [{ id: '51' }, { id: '52', after: 'NTA' }, { id: '53' }],
    });
    expect(result).toEqual({
      results: [
        {
          id: '51',
          associations: [
            {
              id: '7',
              labels: [
                { category: 'HUBSPOT_DEFINED', typeId: 1, label: 'Primary' },
                { category: 'HUBSPOT_DEFINED', typeId: 279, label: null },
              ],
            },
          ],
          nextCursor: 'MTA',
        },
        {
          id: '52',
          associations: [
            { id: '8', labels: [{ category: 'USER_DEFINED', typeId: 3, label: 'Billing' }] },
          ],
          nextCursor: null,
        },
      ],
      errors: [{ category: 'OBJECT_NOT_FOUND', message: 'No associations' }],
    });
  });

  it('takes at most 1,000 IDs', async () => {
    stubHubSpot(() => json({ results: [] }));

    await expect(
      hubspot.listAssociations({
        input: {
          fromType: 'deals',
          toType: 'contacts',
          ids: Array.from({ length: 1001 }, (_, index) => String(index)),
        },
        req: req(),
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('listLists', () => {
  const found = {
    listId: '123',
    name: 'Customers',
    objectTypeId: '0-1',
    processingType: 'MANUAL',
    processingStatus: 'COMPLETE',
    listVersion: 1,
    additionalProperties: { hs_list_size: 59 },
  };

  it('searches with count and offset, and turns the next offset into nextCursor', async () => {
    stubHubSpot((call) =>
      body(call).offset === 0
        ? json({ lists: [found], hasMore: true, offset: 1, total: 2 })
        : json({ lists: [], hasMore: false, offset: 2, total: 2 }),
    );

    const first = await hubspot.listLists({
      input: { query: 'Cust', objectTypeId: '0-1', limit: 1 },
      req: req(),
    });

    const last = await hubspot.listLists({
      input: { query: 'Cust', objectTypeId: '0-1', limit: 1, cursor: first.nextCursor! },
      req: req(),
    });

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hubapi.com/crm/v3/lists/search',
    });
    expect(body(calls[0])).toEqual({
      query: 'Cust',
      objectTypeId: '0-1',
      count: 1,
      offset: 0,
      additionalProperties: [],
    });
    expect(body(calls[1])).toMatchObject({ offset: 1 });
    expect(first).toEqual({
      results: [
        {
          listId: '123',
          name: 'Customers',
          objectTypeId: '0-1',
          processingType: 'MANUAL',
          processingStatus: 'COMPLETE',
          additionalProperties: { hs_list_size: '59' },
        },
      ],
      nextCursor: '1',
    });
    expect(last.nextCursor).toBeNull();
  });
});

describe('the other paged reads', () => {
  const reads: Array<[string, Record<string, unknown>, string, Record<string, string>, unknown]> = [
    [
      'listListMembers',
      { listId: '123' },
      '/crm/v3/lists/123/memberships',
      {},
      { recordId: '51', membershipTimestamp: '2026-01-02T03:04:05.000Z' },
    ],
    [
      'listOwners',
      { archived: true },
      '/crm/v3/owners',
      { archived: 'true' },
      { id: '9', email: 'sam@acme.com', firstName: 'Sam', userId: 44, archived: true },
    ],
  ];

  it.each(reads)('%s sends limit and after', async (slug, input, route, params, item) => {
    stubHubSpot((call) =>
      query(call).after
        ? json({ results: [item] })
        : json({ results: [item], paging: { next: { after: 'Mg' } } }),
    );

    const action = (hubspot as unknown as Record<string, typeof hubspot.listOwners>)[slug];
    const first = await action({ input: { ...input, limit: 2 }, req: req() });
    const last = await action({
      input: { ...input, limit: 2, cursor: first.nextCursor ?? undefined },
      req: req(),
    });

    expect(path(calls[0])).toBe(route);
    expect(query(calls[0])).toEqual({ ...params, limit: '2' });
    expect(query(calls[1])).toEqual({ ...params, limit: '2', after: 'Mg' });
    expect(first).toEqual({ results: [item], nextCursor: 'Mg' });
    expect(last).toEqual({ results: [item], nextCursor: null });
  });
});

describe('unpaged reads', () => {
  it('lists pipelines with their stages', async () => {
    const pipeline = {
      id: 'default',
      label: 'Sales Pipeline',
      displayOrder: 0,
      archived: false,
      stages: [
        {
          id: 'appointmentscheduled',
          label: 'Appointment Scheduled',
          displayOrder: 0,
          metadata: { probability: '0.2', isClosed: 'false' },
        },
      ],
    };

    stubHubSpot(() => json({ results: [pipeline] }));

    await expect(
      hubspot.listPipelines({ input: { objectType: 'deals' }, req: req() }),
    ).resolves.toEqual({ results: [pipeline] });
    expect(path(calls[0])).toBe('/crm/v3/pipelines/deals');
  });

  it('lists properties', async () => {
    const property = {
      name: 'dealstage',
      label: 'Deal Stage',
      type: 'enumeration',
      fieldType: 'radio',
      groupName: 'dealinformation',
      options: [{ label: 'Won', value: 'closedwon', displayOrder: 1, hidden: false }],
    };

    stubHubSpot(() => json({ results: [property] }));

    await expect(
      hubspot.listProperties({ input: { objectType: 'deals', archived: false }, req: req() }),
    ).resolves.toEqual({ results: [property] });
    expect(path(calls[0])).toBe('/crm/v3/properties/deals');
    expect(query(calls[0])).toEqual({ archived: 'false' });
  });
});
