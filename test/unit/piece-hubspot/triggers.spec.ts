import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createHubSpot } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { body, type Call, calls, json, path, query, req, stubHubSpot } from './fixtures.js';

const hubspot = createHubSpot({});
const { triggers } = pieceFactoryDefinition(createHubSpot);

type Cursor = { since: number; start: number; seen: string[] };

type Run = (args: {
  input: Record<string, unknown>;
  cursor?: unknown;
  client: unknown;
  options: unknown;
  req: unknown;
}) => Promise<{ events: unknown[]; cursor?: Cursor }>;

const minute = 60_000;
const t0 = Date.parse('2026-11-01T12:00:00.000Z');

async function run(slug: string, input: Record<string, unknown>, cursor?: unknown) {
  const trigger = triggers.find((entry) => entry.slug === slug) as unknown as {
    input: { parse(value: unknown): Record<string, unknown> };
    run: Run;
  };

  return trigger.run({
    input: trigger.input.parse(input),
    cursor,
    client: await hubspot.client({ req: req() }),
    options: {},
    req: req(),
  });
}

function at(offset: number) {
  vi.setSystemTime(t0 + offset);
}

function iso(offset: number) {
  return new Date(t0 + offset).toISOString();
}

type Stored = {
  id: string;
  properties: Record<string, string>;
  propertiesWithHistory?: Record<string, Array<{ timestamp: string; value: string }>>;
};

function crm(store: Record<string, Stored[]>) {
  return (call: Call) => {
    const route = path(call);
    const type = route.split('/')[4] ?? '';

    if (route.endsWith('/batch/read')) {
      const ids = body(call).inputs.map((input: { id: string }) => input.id);

      return json({ results: (store[type] ?? []).filter((record) => ids.includes(record.id)) });
    }

    const { filterGroups, sorts } = body(call);
    const filters: Array<{ propertyName: string; operator: string; value?: string }> =
      filterGroups[0].filters;

    const sort = sorts[0].propertyName;
    const results = (store[type] ?? [])
      .filter((record) =>
        filters.every(({ propertyName, operator, value }) => {
          const actual = record.properties[propertyName];

          if (operator === 'HAS_PROPERTY') return actual !== undefined;
          if (operator === 'EQ') return actual === value;

          return Date.parse(actual ?? '') > Number(value);
        }),
      )
      .sort((a, b) => Date.parse(a.properties[sort]) - Date.parse(b.properties[sort]))
      .map(({ propertiesWithHistory: _history, ...record }) => record);

    return json({ total: results.length, results });
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HubSpot triggers', () => {
  it('registers upstream’s triggers less newBlogArticle, all polling every 5 minutes', () => {
    expect(triggers.map((trigger) => trigger.slug).sort()).toEqual(
      [
        'dealStageUpdated',
        'newCompany',
        'newCompanyPropertyChange',
        'newContact',
        'newContactInList',
        'newContactPropertyChange',
        'newCustomObject',
        'newCustomObjectPropertyChange',
        'newDeal',
        'newDealPropertyChange',
        'newEmailEvent',
        'newEmailSubscriptionsTimeline',
        'newEngagement',
        'newFormSubmission',
        'newLineItem',
        'newOrUpdatedCompany',
        'newOrUpdatedContact',
        'newOrUpdatedLineItem',
        'newOrUpdatedProduct',
        'newProduct',
        'newTask',
        'newTicket',
        'newTicketPropertyChange',
      ].sort(),
    );
    expect(
      triggers.every((trigger) => trigger.type === 'polling' && trigger.schedule === '*/5 * * * *'),
    ).toBe(true);
  });
});

const recordTriggers: Array<[string, string, string, Record<string, unknown>]> = [
  ['newContact', 'contacts', 'createdate', {}],
  ['newOrUpdatedContact', 'contacts', 'lastmodifieddate', {}],
  ['newCompany', 'companies', 'createdate', {}],
  ['newOrUpdatedCompany', 'companies', 'hs_lastmodifieddate', {}],
  ['newDeal', 'deals', 'createdate', {}],
  ['newTicket', 'tickets', 'createdate', {}],
  ['newLineItem', 'line_items', 'createdate', {}],
  ['newOrUpdatedLineItem', 'line_items', 'hs_lastmodifieddate', {}],
  ['newProduct', 'products', 'createdate', {}],
  ['newOrUpdatedProduct', 'products', 'hs_lastmodifieddate', {}],
  ['newTask', 'tasks', 'hs_createdate', {}],
  ['newCustomObject', '2-34', 'hs_createdate', { customObjectType: '2-34' }],
  [
    'dealStageUpdated',
    'deals',
    'hs_v2_date_entered_current_stage',
    { pipelineId: 'default', stageId: 'closedwon' },
  ],
];

describe.each(recordTriggers)('%s', (slug, type, time, input) => {
  const extra = slug === 'dealStageUpdated' ? { pipeline: 'default', dealstage: 'closedwon' } : {};
  const record = (id: string, offset: number) => ({
    id,
    properties: { [time]: iso(offset), ...extra },
  });

  it('starts at now, then emits only records newer than the previous poll', async () => {
    const store: Record<string, Stored[]> = { [type]: [record('1', -minute)] };

    stubHubSpot(crm(store));

    const first = await run(slug, input);

    expect(first).toEqual({ events: [], cursor: { since: t0, start: t0, seen: [] } });
    expect(calls).toHaveLength(0);

    store[type].push(record('2', minute));
    at(10 * minute);

    const second = await run(slug, input, first.cursor);

    expect(second.events).toEqual([record('2', minute)]);
    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}/search`);
    expect(body(calls[0])).toMatchObject({
      limit: 200,
      sorts: [{ propertyName: time, direction: 'ASCENDING' }],
    });
    expect(body(calls[0]).properties).toContain(time);
    expect(body(calls[0]).filterGroups[0].filters.at(-1)).toEqual({
      propertyName: time,
      operator: 'GT',
      value: String(t0),
    });

    store[type].push(record('3', 11 * minute));
    at(20 * minute);

    const third = await run(slug, input, second.cursor);

    expect(third.events).toEqual([record('3', 11 * minute)]);
    expect(third.cursor?.since).toBe(t0 + 20 * minute);
  });
});

describe('the polling window', () => {
  it('looks back 5 minutes for late-indexed records, without emitting one twice', async () => {
    const store: Record<string, Stored[]> = {
      contacts: [{ id: '1', properties: { createdate: iso(9 * minute) } }],
    };

    stubHubSpot(crm(store));
    at(10 * minute);

    const cursor = { since: t0, start: t0, seen: [] };
    const first = await run('newContact', {}, cursor);

    store.contacts.push({ id: '2', properties: { createdate: iso(8 * minute) } });
    at(20 * minute);

    const second = await run('newContact', {}, first.cursor);

    expect(first.events).toEqual([store.contacts[0]]);
    expect(body(calls[1]).filterGroups[0].filters[0].value).toBe(String(t0 + 5 * minute));
    expect(second.events).toEqual([store.contacts[1]]);
    expect(second.cursor?.seen).toEqual([]);
  });

  it('resumes at the last record when a burst passes search’s 10,000 cap', async () => {
    stubHubSpot((call) => {
      const offset = Number(body(call).after ?? 0);

      return json({
        results: [{ id: String(offset), properties: { createdate: iso(minute + offset) } }],
        paging: { next: { after: String(offset + 200) } },
      });
    });

    at(30 * minute);

    const result = await run('newContact', {}, { since: t0, start: t0, seen: [] });

    expect(calls).toHaveLength(50);
    expect(result.events).toHaveLength(50);
    expect(result.cursor?.since).toBe(t0 + minute + 9800);
  });
});

const propertyTriggers: Array<[string, string, string, Record<string, unknown>]> = [
  ['newContactPropertyChange', 'contacts', 'lastmodifieddate', {}],
  ['newCompanyPropertyChange', 'companies', 'hs_lastmodifieddate', {}],
  ['newDealPropertyChange', 'deals', 'hs_lastmodifieddate', {}],
  ['newTicketPropertyChange', 'tickets', 'hs_lastmodifieddate', {}],
  ['newCustomObjectPropertyChange', '2-34', 'hs_lastmodifieddate', { customObjectType: '2-34' }],
];

describe.each(propertyTriggers)('%s', (slug, type, modified, input) => {
  it('emits records whose property changed since the previous poll', async () => {
    const changed = (id: string, modifiedAt: number, changedAt: number) => ({
      id,
      properties: { [modified]: iso(modifiedAt), city: 'Austin' },
      propertiesWithHistory: { city: [{ timestamp: iso(changedAt), value: 'Austin' }] },
    });

    const store: Record<string, Stored[]> = {
      [type]: [changed('1', 2 * minute, 2 * minute), changed('2', 3 * minute, -60 * minute)],
    };

    stubHubSpot(crm(store));
    at(10 * minute);

    const first = await run(
      slug,
      { ...input, propertyName: 'city' },
      { since: t0, start: t0, seen: [] },
    );

    expect(first.events).toEqual([
      { id: '1', properties: { [modified]: iso(2 * minute), city: 'Austin' } },
    ]);
    expect(body(calls[0]).filterGroups[0].filters[0]).toEqual({
      propertyName: 'city',
      operator: 'HAS_PROPERTY',
    });
    expect(path(calls[1])).toBe(`/crm/v3/objects/${type}/batch/read`);
    expect(body(calls[1])).toEqual({
      properties: ['city', modified],
      propertiesWithHistory: ['city'],
      inputs: [{ id: '1' }, { id: '2' }],
    });

    at(20 * minute);

    await expect(
      run(slug, { ...input, propertyName: 'city' }, first.cursor),
    ).resolves.toMatchObject({ events: [] });
  });
});

describe('newEngagement', () => {
  const store: Record<string, Stored[]> = {
    notes: [{ id: '1', properties: { hs_createdate: iso(minute), hs_note_body: 'Hi' } }],
    calls: [{ id: '1', properties: { hs_createdate: iso(2 * minute), hs_call_title: 'Intro' } }],
  };

  it('polls every v3 activity type and tags each with its type', async () => {
    stubHubSpot(crm(store));
    at(5 * minute);

    const result = await run('newEngagement', {}, { since: t0, start: t0, seen: [] });

    expect(calls.map(path)).toEqual([
      '/crm/v3/objects/notes/search',
      '/crm/v3/objects/emails/search',
      '/crm/v3/objects/calls/search',
      '/crm/v3/objects/meetings/search',
      '/crm/v3/objects/tasks/search',
    ]);
    expect(result.events).toEqual([
      { type: 'NOTE', record: store.notes[0] },
      { type: 'CALL', record: store.calls[0] },
    ]);
    expect(result.cursor?.seen).toEqual([`notes:1:${t0 + minute}`, `calls:1:${t0 + 2 * minute}`]);

    at(20 * minute);

    await expect(run('newEngagement', {}, result.cursor)).resolves.toMatchObject({ events: [] });
  });

  it('polls one type when asked', async () => {
    stubHubSpot(crm(store));
    at(10 * minute);

    const result = await run(
      'newEngagement',
      { eventType: 'CALL' },
      { since: t0, start: t0, seen: [] },
    );

    expect(calls.map(path)).toEqual(['/crm/v3/objects/calls/search']);
    expect(result.events).toEqual([{ type: 'CALL', record: store.calls[0] }]);
  });
});

describe('newContactInList', () => {
  it('emits contacts added since the previous poll, with their membership time', async () => {
    const members = [
      { recordId: '1', membershipTimestamp: iso(-minute) },
      { recordId: '2', membershipTimestamp: iso(2 * minute) },
    ];

    stubHubSpot((call) =>
      path(call).endsWith('/join-order')
        ? json({ results: members })
        : json({ results: [{ id: '2', properties: { email: 'dana@acme.com' } }] }),
    );

    at(10 * minute);

    const result = await run(
      'newContactInList',
      { listId: '123' },
      { since: t0, start: t0, seen: [] },
    );

    expect(path(calls[0])).toBe('/crm/v3/lists/123/memberships/join-order');
    expect(query(calls[0])).toEqual({ limit: '100' });
    expect(path(calls[1])).toBe('/crm/v3/objects/contacts/batch/read');
    expect(body(calls[1]).inputs).toEqual([{ id: '2' }]);
    expect(result.events).toEqual([
      { id: '2', properties: { email: 'dana@acme.com' }, membershipTimestamp: iso(2 * minute) },
    ]);

    at(20 * minute);

    await expect(run('newContactInList', { listId: '123' }, result.cursor)).resolves.toMatchObject({
      events: [],
    });
  });
});

describe('the v1 email triggers', () => {
  it('newEmailEvent reads the window between the floor and now, one type when asked', async () => {
    const event = { id: 'e1', created: t0 + minute, type: 'OPEN', recipient: 'dana@acme.com' };

    stubHubSpot((call) =>
      query(call).offset
        ? json({ events: [], hasMore: false, offset: 'x' })
        : json({ events: [event], hasMore: true, offset: 'b' }),
    );

    at(10 * minute);

    const result = await run(
      'newEmailEvent',
      { eventType: 'OPEN' },
      { since: t0, start: t0, seen: [] },
    );

    expect(path(calls[0])).toBe('/email/public/v1/events');
    expect(query(calls[0])).toEqual({
      eventType: 'OPEN',
      startTimestamp: String(t0),
      endTimestamp: String(t0 + 10 * minute),
      limit: '1000',
    });
    expect(query(calls[1]).offset).toBe('b');
    expect(result.events).toEqual([event]);

    at(20 * minute);

    await expect(run('newEmailEvent', {}, result.cursor)).resolves.toMatchObject({
      events: [],
    });
  });

  it('newEmailSubscriptionsTimeline emits each change', async () => {
    const change = {
      timestamp: t0 + minute,
      recipient: 'dana@acme.com',
      portalId: 62515,
      changes: [{ change: 'UNSUBSCRIBED', changeType: 'SUBSCRIPTION_STATUS' }],
    };

    stubHubSpot(() => json({ timeline: [change], hasMore: false, offset: 1 }));
    at(5 * minute);

    const result = await run(
      'newEmailSubscriptionsTimeline',
      {},
      { since: t0, start: t0, seen: [] },
    );

    expect(path(calls[0])).toBe('/email/public/v1/subscriptions/timeline');
    expect(query(calls[0])).toMatchObject({ startTimestamp: String(t0) });
    expect(result.events).toEqual([change]);
    expect(result.cursor?.seen).toEqual([`dana@acme.com:${t0 + minute}`]);
  });
});

describe('newFormSubmission', () => {
  it('reads newest first until it passes the floor, keyed by field label', async () => {
    const fresh = {
      conversionId: 'c2',
      submittedAt: t0 + 2 * minute,
      pageUrl: 'https://acme.com/contact',
      values: [
        { name: 'email', value: 'dana@acme.com' },
        { name: 'topics', value: 'Pricing' },
        { name: 'topics', value: 'Support' },
        { name: 'resume', value: 'https://files/a.pdf' },
        { name: 'hidden_field', value: 'x' },
      ],
    };

    const old = { conversionId: 'c1', submittedAt: t0 - minute, values: [] };

    stubHubSpot((call) =>
      path(call).startsWith('/marketing/v3/forms/')
        ? json({
            fieldGroups: [
              {
                fields: [
                  { name: 'email', label: 'Email', fieldType: 'email' },
                  { name: 'topics', label: 'Topics', fieldType: 'multiple_checkboxes' },
                  { name: 'resume', label: 'Resume', fieldType: 'file' },
                ],
              },
            ],
          })
        : json({ results: [fresh, old], paging: { next: { after: 'more' } } }),
    );

    at(10 * minute);

    const result = await run(
      'newFormSubmission',
      { formId: 'f-1', allowMultipleFiles: true },
      { since: t0, start: t0, seen: [] },
    );

    expect(path(calls[0])).toBe('/form-integrations/v1/submissions/forms/f-1');
    expect(query(calls[0])).toEqual({ limit: '50' });
    expect(path(calls[1])).toBe('/marketing/v3/forms/f-1');
    expect(calls).toHaveLength(2);
    expect(result.events).toEqual([
      {
        conversionId: 'c2',
        submittedAt: t0 + 2 * minute,
        pageUrl: 'https://acme.com/contact',
        values: {
          Email: 'dana@acme.com',
          Topics: ['Pricing', 'Support'],
          Resume: ['https://files/a.pdf'],
          hidden_field: 'x',
        },
      },
    ]);

    at(20 * minute);

    await expect(run('newFormSubmission', { formId: 'f-1' }, result.cursor)).resolves.toMatchObject(
      { events: [] },
    );
  });
});
