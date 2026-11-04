import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import type { FrogBotRequest } from '../../../packages/frogbot/src/types/request.js';
import { createHubSpot } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { body, type Call, calls, json, path, query, req, stubHubSpot } from './fixtures.js';

const hubspot = createHubSpot({});

type Run = (args: { input: Record<string, unknown>; req: unknown }) => Promise<unknown>;

function action(slug: string) {
  return (hubspot as unknown as Record<string, Run>)[slug];
}

afterEach(() => vi.unstubAllGlobals());

const record = {
  id: '51',
  properties: { name: 'Acme' },
  createdAt: '2026-01-02T03:04:05.000Z',
  updatedAt: '2026-01-02T03:04:05.000Z',
  archived: false,
};

const objects: Array<{
  name: string;
  type: string;
  idField: string;
  defaults: string;
  named?: [Record<string, unknown>, Record<string, string>];
  input?: Record<string, unknown>;
}> = [
  { name: 'Contact', type: 'contacts', idField: 'contactId', defaults: 'firstname,lastname,email' },
  { name: 'Company', type: 'companies', idField: 'companyId', defaults: 'name,domain,industry' },
  {
    name: 'Deal',
    type: 'deals',
    idField: 'dealId',
    defaults: 'dealtype,dealname,amount',
    named: [
      { dealname: 'Big', pipelineId: 'default', pipelineStageId: 'appointmentscheduled' },
      { dealname: 'Big', pipeline: 'default', dealstage: 'appointmentscheduled' },
    ],
  },
  {
    name: 'Ticket',
    type: 'tickets',
    idField: 'ticketId',
    defaults: 'subject,content,source_type',
    named: [
      { ticketName: 'Broken', pipelineId: '0', pipelineStageId: '1' },
      { subject: 'Broken', hs_pipeline: '0', hs_pipeline_stage: '1' },
    ],
  },
  {
    name: 'LineItem',
    type: 'line_items',
    idField: 'lineItemId',
    defaults: 'name,description,price',
    named: [{ productId: '77' }, { hs_product_id: '77' }],
  },
  { name: 'Product', type: 'products', idField: 'productId', defaults: 'createdate,description' },
  {
    name: 'CustomObject',
    type: '2-3456789',
    idField: 'customObjectId',
    defaults: 'hs_object_id,hs_lastmodifieddate,hs_createdate',
    input: { customObjectType: '2-3456789' },
  },
];

function crmRoute(call: Call) {
  return call.method === 'POST' && path(call).endsWith('/search')
    ? json({ total: 1, results: [record] })
    : json(record, call.method === 'POST' ? 201 : 200);
}

describe.each(objects)('$name actions', ({ name, type, idField, defaults, named, input = {} }) => {
  it(`create${name} posts the properties, then reads the record back`, async () => {
    stubHubSpot(crmRoute);

    const result = await action(`create${name}`)({
      input: {
        ...input,
        ...named?.[0],
        objectProperties: { tags: ['a', 'b'], score: 3, vip: true, note: 'hi' },
        additionalPropertiesToRetrieve: ['extra'],
      },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'POST' });
    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}`);
    expect(body(calls[0])).toEqual({
      properties: { tags: 'a;b', score: '3', vip: 'true', note: 'hi', ...named?.[1] },
    });
    expect(path(calls[1])).toBe(`/crm/v3/objects/${type}/51`);
    expect(query(calls[1]).properties).toMatch(new RegExp(`^${defaults},(.*,)?extra$`));
    expect(result).toEqual(record);
  });

  it(`update${name} patches only what is given, skipping empty arrays`, async () => {
    stubHubSpot(crmRoute);

    await action(`update${name}`)({
      input: { ...input, [idField]: '51', objectProperties: { tags: [], note: 'hi' } },
      req: req(),
    });

    expect(calls[0]).toMatchObject({ method: 'PATCH' });
    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}/51`);
    expect(body(calls[0])).toEqual({ properties: { note: 'hi' } });
    expect(path(calls[1])).toBe(`/crm/v3/objects/${type}/51`);
  });

  it(`get${name} reads the default properties`, async () => {
    stubHubSpot(crmRoute);

    await expect(
      action(`get${name}`)({ input: { ...input, [idField]: '51' }, req: req() }),
    ).resolves.toEqual(record);
    expect(calls).toHaveLength(1);
    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}/51`);
    expect(query(calls[0]).properties.startsWith(defaults)).toBe(true);
  });

  it(`find${name} searches with one or two equality filters`, async () => {
    stubHubSpot(crmRoute);

    const result = await action(`find${name}`)({
      input: {
        ...input,
        firstSearchPropertyName: 'name',
        firstSearchPropertyValue: 'Acme',
        secondSearchPropertyName: 'city',
        secondSearchPropertyValue: 'Austin',
      },
      req: req(),
    });

    expect(path(calls[0])).toBe(`/crm/v3/objects/${type}/search`);
    expect(body(calls[0])).toMatchObject({
      limit: 200,
      filterGroups: [
        {
          filters: [
            { propertyName: 'name', operator: 'EQ', value: 'Acme' },
            { propertyName: 'city', operator: 'EQ', value: 'Austin' },
          ],
        },
      ],
    });
    expect(body(calls[0]).properties.join(',').startsWith(defaults)).toBe(true);
    expect(result).toEqual({ total: 1, results: [record] });
  });

  it(`get${name} refuses an ID that could reshape the path`, async () => {
    stubHubSpot(crmRoute);

    await expect(
      action(`get${name}`)({ input: { ...input, [idField]: '51/../owners' }, req: req() }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('createOrUpdateContact', () => {
  it('updates the contact with that email', async () => {
    stubHubSpot((call) =>
      path(call).endsWith('/search') ? json({ total: 1, results: [{ id: '51' }] }) : json(record),
    );

    await hubspot.createOrUpdateContact({
      input: { email: 'dana@acme.com', objectProperties: { firstname: 'Dana' } },
      req: req(),
    });

    expect(body(calls[0]).filterGroups[0].filters).toEqual([
      { propertyName: 'email', operator: 'EQ', value: 'dana@acme.com' },
    ]);
    expect(calls[1]).toMatchObject({ method: 'PATCH' });
    expect(path(calls[1])).toBe('/crm/v3/objects/contacts/51');
    expect(body(calls[1])).toEqual({ properties: { firstname: 'Dana' } });
  });

  it('creates one with the email when there is none', async () => {
    stubHubSpot((call) =>
      path(call).endsWith('/search') ? json({ total: 0, results: [] }) : json(record, 201),
    );

    await hubspot.createOrUpdateContact({ input: { email: 'dana@acme.com' }, req: req() });

    expect(calls[1]).toMatchObject({ method: 'POST' });
    expect(path(calls[1])).toBe('/crm/v3/objects/contacts');
    expect(body(calls[1])).toEqual({ properties: { email: 'dana@acme.com' } });
  });
});

describe('associations', () => {
  const labels = {
    results: [
      { category: 'HUBSPOT_DEFINED', typeId: 1, label: 'Primary' },
      { category: 'USER_DEFINED', typeId: 9, label: 'Billing' },
    ],
  };

  const input = {
    fromObjectType: 'contacts',
    fromObjectId: '51',
    toObjectType: 'companies',
    associationType: '9',
    toObjectIds: Array.from({ length: 150 }, (_, index) => String(index + 1)),
  };

  it('createAssociations looks up the category and creates in batches of 100', async () => {
    stubHubSpot((call) =>
      call.method === 'GET'
        ? json(labels)
        : json(
            {
              status: 'COMPLETE',
              results: [{ fromObjectId: 51, toObjectId: 1, labels: ['Billing'] }],
            },
            201,
          ),
    );

    const result = await hubspot.createAssociations({ input, req: req() });

    expect(path(calls[0])).toBe('/crm/associations/v4/contacts/companies/labels');
    expect(path(calls[1])).toBe('/crm/v4/associations/contacts/companies/batch/create');
    expect(body(calls[1]).inputs).toHaveLength(100);
    expect(body(calls[2]).inputs).toHaveLength(50);
    expect(body(calls[1]).inputs[0]).toEqual({
      from: { id: '51' },
      to: { id: '1' },
      types: [{ associationCategory: 'USER_DEFINED', associationTypeId: 9 }],
    });
    expect(result).toEqual({
      totalAssociations: 150,
      batchCount: 2,
      results: [
        { fromObjectId: '51', toObjectId: '1', labels: ['Billing'] },
        { fromObjectId: '51', toObjectId: '1', labels: ['Billing'] },
      ],
      errors: [],
    });
  });

  it('removeAssociations archives the label', async () => {
    stubHubSpot((call) =>
      call.method === 'GET' ? json(labels) : new Response(null, { status: 204 }),
    );

    const result = await hubspot.removeAssociations({
      input: { ...input, toObjectIds: ['1'] },
      req: req(),
    });

    expect(path(calls[1])).toBe('/crm/v4/associations/contacts/companies/batch/labels/archive');
    expect(result).toEqual({ success: true, totalAssociations: 1, batchCount: 1 });
  });

  it('throws for an association type the pair does not have', async () => {
    stubHubSpot(() => json(labels));

    await expect(
      hubspot.createAssociations({ input: { ...input, associationType: 4 }, req: req() }),
    ).rejects.toThrow('Association type 4 not found for contacts to companies.');
    expect(calls).toHaveLength(1);
  });

  it('findAssociations reads every page', async () => {
    stubHubSpot((call) =>
      query(call).after
        ? json({ results: [{ toObjectId: 8, associationTypes: [] }] })
        : json({
            results: [{ toObjectId: 7, associationTypes: [labels.results[0]] }],
            paging: { next: { after: 'Nw' } },
          }),
    );

    const result = await hubspot.findAssociations({
      input: { fromObjectType: 'deals', fromObjectId: '3', toObjectType: 'contacts' },
      req: req(),
    });

    expect(path(calls[0])).toBe('/crm/v4/objects/deals/3/associations/contacts');
    expect(query(calls[0])).toEqual({ limit: '500' });
    expect(query(calls[1])).toEqual({ limit: '500', after: 'Nw' });
    expect(result).toEqual({
      results: [
        { toObjectId: '7', associationTypes: [labels.results[0]] },
        { toObjectId: '8', associationTypes: [] },
      ],
    });
  });
});

describe('list membership', () => {
  function route(removed: string[]) {
    return (call: Call) =>
      path(call).endsWith('/search')
        ? json({ results: [{ id: '51' }] })
        : json({ recordsIdsAdded: ['51'], recordIdsRemoved: removed, recordIdsMissing: [] });
  }

  it('addContactToList finds the contact by email and adds it through the v3 lists API', async () => {
    stubHubSpot(route([]));

    const result = await hubspot.addContactToList({
      input: { listId: '123', email: 'dana@acme.com' },
      req: req(),
    });

    expect(path(calls[0])).toBe('/crm/v3/objects/contacts/search');
    expect(calls[1]).toMatchObject({ method: 'PUT' });
    expect(path(calls[1])).toBe('/crm/v3/lists/123/memberships/add');
    expect(body(calls[1])).toEqual(['51']);
    expect(result).toEqual({
      contactId: '51',
      recordsIdsAdded: ['51'],
      recordIdsRemoved: [],
      recordIdsMissing: [],
    });
  });

  it('removeContactFromList removes it, and throws when it was not a member', async () => {
    stubHubSpot(route(['51']));

    await hubspot.removeContactFromList({
      input: { listId: '123', email: 'dana@acme.com' },
      req: req(),
    });

    expect(path(calls[1])).toBe('/crm/v3/lists/123/memberships/remove');

    stubHubSpot(route([]));

    await expect(
      hubspot.removeContactFromList({
        input: { listId: '123', email: 'dana@acme.com' },
        req: req(),
      }),
    ).rejects.toThrow("Contact with email 'dana@acme.com' wasn't a member of list with id '123'.");
  });

  it('throws when no contact has the email', async () => {
    stubHubSpot(() => json({ results: [] }));

    await expect(
      hubspot.addContactToList({ input: { listId: '123', email: 'x@acme.com' }, req: req() }),
    ).rejects.toThrow("No contact with email 'x@acme.com' was found.");
    expect(calls).toHaveLength(1);
  });
});

describe('lookups', () => {
  const owner = { id: '9', email: 'sam@acme.com', firstName: 'Sam', userId: 44 };

  it('getOwnerByEmail returns the owner, or null', async () => {
    stubHubSpot(() => json({ results: [owner] }));

    await expect(
      hubspot.getOwnerByEmail({ input: { email: 'sam@acme.com' }, req: req() }),
    ).resolves.toEqual(owner);
    expect(query(calls[0])).toEqual({ email: 'sam@acme.com', limit: '1' });

    stubHubSpot(() => json({ results: [] }));

    await expect(
      hubspot.getOwnerByEmail({ input: { email: 'sam@acme.com' }, req: req() }),
    ).resolves.toBeNull();
  });

  it('getOwnerById reads the owner', async () => {
    stubHubSpot(() => json(owner));

    await expect(hubspot.getOwnerById({ input: { ownerId: '9' }, req: req() })).resolves.toEqual(
      owner,
    );
    expect(path(calls[0])).toBe('/crm/v3/owners/9');
  });

  it('getPipelineStageDetails reads one stage', async () => {
    const stage = { id: 'closedwon', label: 'Closed won', displayOrder: 5 };

    stubHubSpot(() => json(stage));

    await expect(
      hubspot.getPipelineStageDetails({
        input: { objectType: 'deals', pipelineId: 'default', stageId: 'closedwon' },
        req: req(),
      }),
    ).resolves.toEqual(stage);
    expect(path(calls[0])).toBe('/crm/v3/pipelines/deals/default/stages/closedwon');
  });
});

describe('uploadFile', () => {
  it('uploads a FrogBot file as multipart with its folder and access level', async () => {
    const findByID = vi.fn().mockResolvedValue({
      id: 'f1',
      url: '/api/files/file/logo.png',
      filename: 'logo.png',
      mimeType: 'image/png',
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

    stubHubSpot((call) =>
      call.url.startsWith('https://app.test/')
        ? new Response('png bytes')
        : json({ id: '300', name: 'logo', access: 'PRIVATE' }, 201),
    );

    const result = await hubspot.uploadFile({
      input: {
        folderId: '12',
        fileName: 'logo.png',
        accessLevel: 'PRIVATE',
        file: { fileId: 'f1' },
      },
      req: request as unknown as FrogBotRequest,
    });

    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', id: 'f1', overrideAccess: false }),
    );
    expect(calls[0]?.headers.get('cookie')).toBe('session=1');

    const form = calls[1].form!;
    const file = form.get('file') as File;

    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.hubapi.com/files/v3/files',
    });
    expect(calls[1]?.headers.get('content-type')).toBeNull();
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer hubspot-token');
    expect(form.get('folderId')).toBe('12');
    expect(form.get('fileName')).toBe('logo.png');
    expect(JSON.parse(form.get('options') as string)).toEqual({ access: 'PRIVATE' });
    expect(file.name).toBe('logo.png');
    expect(await file.text()).toBe('png bytes');
    expect(result).toEqual({ id: '300', name: 'logo', access: 'PRIVATE' });
  });
});

describe('marketing actions', () => {
  it('addContactToWorkflow enrolls through the v2 workflows endpoint', async () => {
    stubHubSpot(() => new Response(null, { status: 204 }));

    const result = await hubspot.addContactToWorkflow({
      input: { workflowId: '10900', email: 'dana+1@acme.com' },
      req: req(),
    });

    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hubapi.com/automation/v2/workflows/10900/enrollments/contacts/dana%2B1%40acme.com',
    });
    expect(result).toEqual({ workflowId: 10900, email: 'dana+1@acme.com', enrolled: true });
  });

  it('removeEmailSubscription unsubscribes from all email through v4', async () => {
    const status = {
      subscriptionId: 1234,
      subscriptionName: 'Newsletter',
      status: 'NOT_SUBSCRIBED',
      channel: 'EMAIL',
      source: 'API',
      subscriberIdString: 'dana@acme.com',
      timestamp: '2026-01-02T03:04:05.000Z',
    };

    stubHubSpot(() => json({ status: 'COMPLETE', results: [status] }));

    const result = await hubspot.removeEmailSubscription({
      input: { email: 'dana@acme.com' },
      req: req(),
    });

    expect(calls[0]?.method).toBe('POST');
    expect(path(calls[0])).toBe(
      '/communication-preferences/v4/statuses/dana%40acme.com/unsubscribe-all',
    );
    expect(query(calls[0])).toEqual({ channel: 'EMAIL' });
    expect(result).toEqual({
      results: [
        {
          subscriptionId: '1234',
          subscriptionName: 'Newsletter',
          status: 'NOT_SUBSCRIBED',
          channel: 'EMAIL',
          timestamp: '2026-01-02T03:04:05.000Z',
        },
      ],
    });
  });
});

describe('the HubSpot piece source', () => {
  const root = join(import.meta.dirname, '../../../packages/pieces/piece-hubspot/src');

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);

      return statSync(full).isDirectory() ? files(full) : [full];
    });
  }

  it.each(['/contacts/v1/', '/engagements/v1/', '/oauth/v1/'])('never calls %s', (retired) => {
    const hits = files(root).filter((file) => readFileSync(file, 'utf8').includes(retired));

    expect(hits).toEqual([]);
  });

  it('marks exactly the read, get and find actions idempotent', () => {
    const { actions } = pieceFactoryDefinition(createHubSpot);
    const reads = /^(list|get|find)[A-Z]/;

    for (const { slug, idempotent } of actions) {
      expect([slug, idempotent]).toEqual([slug, reads.test(slug)]);
    }
  });
});
