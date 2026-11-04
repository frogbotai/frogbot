import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createHubSpot } from '../../../packages/pieces/piece-hubspot/src/index.js';
import { body, calls, json, path, query, req, stubHubSpot } from './fixtures.js';

const hubspot = createHubSpot({});
const { actions } = pieceFactoryDefinition(createHubSpot);

type Options = (args: {
  input: Record<string, unknown>;
  client: unknown;
  options: unknown;
  req: unknown;
}) => Promise<Array<{ label: string; value: string }>>;

async function options(slug: string, field: string, input: Record<string, unknown> = {}) {
  const found = actions.find((action) => action.slug === slug);
  const callback = (found?.options as Record<string, Options> | undefined)?.[field];

  if (!callback) throw new Error(`${slug} has no ${field} options`);

  return callback({ input, client: await hubspot.client({ req: req() }), options: {}, req: req() });
}

afterEach(() => vi.unstubAllGlobals());

describe('HubSpot dropdowns', () => {
  it('every action dropdown is covered here', () => {
    const fields = actions.flatMap((action) =>
      Object.keys(action.options ?? {}).map((field) => field),
    );

    expect([...new Set(fields)].sort()).toEqual(
      [
        'additionalPropertiesToRetrieve',
        'associationType',
        'customObjectType',
        'firstSearchPropertyName',
        'folderId',
        'fromObjectType',
        'listId',
        'pipelineId',
        'pipelineStageId',
        'productId',
        'secondSearchPropertyName',
        'toObjectIds',
        'toObjectType',
        'workflowId',
      ].sort(),
    );
  });

  it.each([
    ['createContact', 'additionalPropertiesToRetrieve', 'contacts'],
    ['findDeal', 'firstSearchPropertyName', 'deals'],
    ['getTicket', 'additionalPropertiesToRetrieve', 'tickets'],
    ['updateLineItem', 'additionalPropertiesToRetrieve', 'line_items'],
    ['findProduct', 'secondSearchPropertyName', 'products'],
  ])("%s %s lists the object's visible properties", async (slug, field, type) => {
    stubHubSpot(() =>
      json({
        results: [
          { name: 'email', label: 'Email', type: 'string', fieldType: 'text' },
          { name: 'hs_secret', label: 'Secret', hidden: true },
        ],
      }),
    );

    await expect(options(slug, field)).resolves.toEqual([{ label: 'Email', value: 'email' }]);
    expect(path(calls[0])).toBe(`/crm/v3/properties/${type}`);
  });

  it("lists the chosen custom object's properties, and nothing before one is chosen", async () => {
    stubHubSpot(() => json({ results: [{ name: 'color', label: 'Color' }] }));

    await expect(options('getCustomObject', 'additionalPropertiesToRetrieve')).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
    await expect(
      options('findCustomObject', 'firstSearchPropertyName', { customObjectType: '2-34' }),
    ).resolves.toEqual([{ label: 'Color', value: 'color' }]);
    expect(path(calls[0])).toBe('/crm/v3/properties/2-34');
  });

  it('lists custom object types by plural label', async () => {
    stubHubSpot(() =>
      json({
        results: [
          { objectTypeId: '2-34', name: 'cars', labels: { singular: 'Car', plural: 'Cars' } },
          { objectTypeId: '2-35', name: 'boats', labels: {} },
        ],
      }),
    );

    await expect(options('createCustomObject', 'customObjectType')).resolves.toEqual([
      { label: 'Cars', value: '2-34' },
      { label: 'boats', value: '2-35' },
    ]);
    expect(path(calls[0])).toBe('/crm/v3/schemas');
  });

  it.each([
    ['createDeal', 'deals'],
    ['updateTicket', 'tickets'],
  ])('%s lists pipelines, then the chosen pipeline’s stages', async (slug, type) => {
    stubHubSpot(() => json({ results: [{ id: 'default', label: 'Sales' }] }));

    await expect(options(slug, 'pipelineId')).resolves.toEqual([
      { label: 'Sales', value: 'default' },
    ]);
    expect(path(calls[0])).toBe(`/crm/v3/pipelines/${type}`);

    await expect(options(slug, 'pipelineStageId')).resolves.toEqual([]);
    expect(calls).toHaveLength(1);

    await expect(options(slug, 'pipelineStageId', { pipelineId: 'default' })).resolves.toEqual([
      { label: 'Sales', value: 'default' },
    ]);
    expect(path(calls[1])).toBe(`/crm/v3/pipelines/${type}/default/stages`);
  });

  it('lists products by name across pages', async () => {
    stubHubSpot((call) =>
      query(call).after
        ? json({ results: [{ id: '2', properties: { name: null } }] })
        : json({
            results: [{ id: '1', properties: { name: 'Widget' } }],
            paging: { next: { after: '1' } },
          }),
    );

    await expect(options('createLineItem', 'productId')).resolves.toEqual([
      { label: 'Widget', value: '1' },
      { label: '2', value: '2' },
    ]);
    expect(path(calls[0])).toBe('/crm/v3/objects/products');
    expect(query(calls[0])).toEqual({ limit: '100', properties: 'name' });
  });

  it('stops listing records after 10 pages', async () => {
    let page = 0;

    stubHubSpot(() =>
      json({
        results: [{ id: String(++page), properties: { email: `${page}@acme.com` } }],
        paging: { next: { after: String(page) } },
      }),
    );

    const found = await options('createAssociations', 'toObjectIds', { toObjectType: 'contacts' });

    expect(calls).toHaveLength(10);
    expect(found[0]).toEqual({ label: '1@acme.com', value: '1' });
    expect(query(calls[0]).properties).toBe('email');
  });

  it('lists standard and custom object types for associations', async () => {
    stubHubSpot(() => json({ results: [{ objectTypeId: '2-34', name: 'cars' }] }));

    const found = await options('findAssociations', 'toObjectType');

    expect(found.slice(0, 3)).toEqual([
      { label: 'Contacts', value: 'contacts' },
      { label: 'Companies', value: 'companies' },
      { label: 'Deals', value: 'deals' },
    ]);
    expect(found.at(-1)).toEqual({ label: 'cars', value: '2-34' });
    await expect(options('removeAssociations', 'fromObjectType')).resolves.toEqual(found);
  });

  it("lists the pair's association types once both are chosen", async () => {
    stubHubSpot(() =>
      json({
        results: [
          { category: 'HUBSPOT_DEFINED', typeId: 1, label: 'Primary' },
          { category: 'HUBSPOT_DEFINED', typeId: 279, label: null },
        ],
      }),
    );

    await expect(
      options('createAssociations', 'associationType', { fromObjectType: 'contacts' }),
    ).resolves.toEqual([]);
    await expect(
      options('createAssociations', 'associationType', {
        fromObjectType: 'contacts',
        toObjectType: 'companies',
      }),
    ).resolves.toEqual([
      { label: 'Primary', value: '1' },
      { label: 'contacts to companies', value: '279' },
    ]);
    expect(path(calls[0])).toBe('/crm/associations/v4/contacts/companies/labels');
  });

  it('lists manual contact lists through the v3 lists search, across pages', async () => {
    stubHubSpot((call) =>
      body(call).offset === 0
        ? json({ lists: [{ listId: '1', name: 'VIP' }], hasMore: true, offset: 100 })
        : json({ lists: [{ listId: '2', name: 'Churned' }], hasMore: false, offset: 101 }),
    );

    await expect(options('removeContactFromList', 'listId')).resolves.toEqual([
      { label: 'VIP', value: '1' },
      { label: 'Churned', value: '2' },
    ]);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.hubapi.com/crm/v3/lists/search',
    });
    expect(body(calls[0])).toEqual({
      query: '',
      count: 100,
      offset: 0,
      objectTypeId: '0-1',
      processingTypes: ['MANUAL', 'SNAPSHOT'],
      additionalProperties: [],
    });
    expect(body(calls[1]).offset).toBe(100);
  });

  it('lists enabled workflows', async () => {
    stubHubSpot(() =>
      json({
        workflows: [
          { id: 10900, name: 'Nurture', enabled: true },
          { id: 12707, name: 'Old', enabled: false },
        ],
      }),
    );

    await expect(options('addContactToWorkflow', 'workflowId')).resolves.toEqual([
      { label: 'Nurture', value: '10900' },
    ]);
    expect(path(calls[0])).toBe('/automation/v3/workflows');
  });

  it('lists file manager folders', async () => {
    stubHubSpot(() => json({ results: [{ id: '12', name: 'Logos' }, { id: '13' }] }));

    await expect(options('uploadFile', 'folderId')).resolves.toEqual([
      { label: 'Logos', value: '12' },
      { label: '13', value: '13' },
    ]);
    expect(path(calls[0])).toBe('/files/v3/folders/search');
  });
});
