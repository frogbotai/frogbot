import type { PieceOption } from 'frogbot/pieces';
import { z } from 'zod';

import type { HubSpotClient, HubSpotRequest } from '../client.js';
import { standardObjectTypes } from '../config.js';
import { cursorPage } from '../pagination.js';

type Args = { client: HubSpotClient; input: Record<string, unknown> };

const maxPages = 10;

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function safe(value: unknown) {
  const found = text(value);

  return found && /^[\w-]+$/.test(found) ? found : undefined;
}

async function allResults<T>(client: HubSpotClient, item: z.ZodType<T>, request: HubSpotRequest) {
  const results: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.request(cursorPage(item), {
      ...request,
      query: { ...request.query, limit: 100, after },
    });

    results.push(...result.results);

    if (result.nextCursor === null) break;

    after = result.nextCursor;
  }

  return results;
}

const propertyItem = z.object({
  name: z.string(),
  label: z.string(),
  hidden: z.boolean().optional(),
});

async function properties(client: HubSpotClient, objectType: string | undefined) {
  if (!objectType) return [];

  const result = await client.request(z.object({ results: z.array(propertyItem) }), {
    path: `/crm/v3/properties/${objectType}`,
  });

  return result.results
    .filter((property) => !property.hidden)
    .map((property) => ({ label: property.label, value: property.name }));
}

/** A standard object's properties, by label. */
export const propertyOptions =
  (objectType: string) =>
  ({ client }: Args) =>
    properties(client, objectType);

/** The chosen custom object's properties. */
export const customPropertyOptions = ({ client, input }: Args) =>
  properties(client, safe(input.customObjectType));

const schemas = z.object({
  results: z.array(
    z.object({
      objectTypeId: z.string(),
      name: z.string(),
      labels: z.object({ plural: z.string().optional() }).optional(),
    }),
  ),
});

export async function customObjectTypeOptions({ client }: Args): Promise<PieceOption[]> {
  const result = await client.request(schemas, { path: '/crm/v3/schemas' });

  return result.results.map((schema) => ({
    label: schema.labels?.plural ?? schema.name,
    value: schema.objectTypeId,
  }));
}

const standardLabels: Record<(typeof standardObjectTypes)[number], string> = {
  contacts: 'Contacts',
  companies: 'Companies',
  deals: 'Deals',
  tickets: 'Tickets',
  notes: 'Notes',
  emails: 'Emails',
  calls: 'Calls',
  meetings: 'Meetings',
  tasks: 'Tasks',
  line_items: 'Line items',
  products: 'Products',
};

/** Standard objects, then the account's custom objects. */
export async function objectTypeOptions(args: Args): Promise<PieceOption[]> {
  return [
    ...standardObjectTypes.map((value) => ({ label: standardLabels[value], value })),
    ...(await customObjectTypeOptions(args)),
  ];
}

const pipelines = z.object({ results: z.array(z.object({ id: z.string(), label: z.string() })) });

export const pipelineOptions =
  (objectType: 'deals' | 'tickets') =>
  async ({ client }: Args): Promise<PieceOption[]> => {
    const result = await client.request(pipelines, { path: `/crm/v3/pipelines/${objectType}` });

    return result.results.map((pipeline) => ({ label: pipeline.label, value: pipeline.id }));
  };

export const stageOptions =
  (objectType: 'deals' | 'tickets') =>
  async ({ client, input }: Args): Promise<PieceOption[]> => {
    const pipelineId = safe(input.pipelineId);

    if (!pipelineId) return [];

    const result = await client.request(pipelines, {
      path: `/crm/v3/pipelines/${objectType}/${pipelineId}/stages`,
    });

    return result.results.map((stage) => ({ label: stage.label, value: stage.id }));
  };

const named = z.object({ id: z.string(), properties: z.record(z.string(), z.string().nullable()) });

const labelProperty: Record<string, string> = {
  contacts: 'email',
  companies: 'name',
  deals: 'dealname',
  tickets: 'subject',
  line_items: 'name',
  products: 'name',
};

async function records(client: HubSpotClient, objectType: string | undefined) {
  if (!objectType) return [];

  const property = labelProperty[objectType];
  const found = await allResults(client, named, {
    path: `/crm/v3/objects/${objectType}`,
    query: { properties: property ? [property] : undefined },
  });

  return found.map((record) => ({
    label: (property && record.properties[property]) || record.id,
    value: record.id,
  }));
}

export const productOptions = ({ client }: Args) => records(client, 'products');

/** Records of the chosen `toObjectType`. */
export const toRecordOptions = ({ client, input }: Args) =>
  records(client, safe(input.toObjectType));

const labels = z.object({
  results: z.array(z.object({ typeId: z.number(), label: z.string().nullable().optional() })),
});

export async function associationTypeOptions({ client, input }: Args): Promise<PieceOption[]> {
  const from = safe(input.fromObjectType);
  const to = safe(input.toObjectType);

  if (!from || !to) return [];

  const result = await client.request(labels, {
    path: `/crm/associations/v4/${from}/${to}/labels`,
  });

  return result.results.map((type) => ({
    label: type.label ?? `${from} to ${to}`,
    value: String(type.typeId),
  }));
}

const listsPage = z.object({
  lists: z.array(z.object({ listId: z.string(), name: z.string() })),
  hasMore: z.boolean(),
  offset: z.number(),
});

/** Contact lists whose members can be added and removed by hand. */
export async function contactListOptions({ client }: Args): Promise<PieceOption[]> {
  const options: PieceOption[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.request(listsPage, {
      method: 'POST',
      path: '/crm/v3/lists/search',
      body: {
        query: '',
        count: 100,
        offset,
        objectTypeId: '0-1',
        processingTypes: ['MANUAL', 'SNAPSHOT'],
        additionalProperties: [],
      },
    });

    options.push(...result.lists.map((list) => ({ label: list.name, value: list.listId })));

    if (!result.hasMore) break;

    offset = result.offset;
  }

  return options;
}

const workflows = z.object({
  workflows: z.array(z.object({ id: z.number(), name: z.string(), enabled: z.boolean() })),
});

/** Enabled contact workflows, by their legacy ID. */
export async function workflowOptions({ client }: Args): Promise<PieceOption[]> {
  const result = await client.request(workflows, { path: '/automation/v3/workflows' });

  return result.workflows
    .filter((workflow) => workflow.enabled)
    .map((workflow) => ({ label: workflow.name, value: String(workflow.id) }));
}

const folder = z.object({ id: z.string(), name: z.string().optional() });

export async function folderOptions({ client }: Args): Promise<PieceOption[]> {
  const folders = await allResults(client, folder, { path: '/files/v3/folders/search' });

  return folders.map((found) => ({ label: found.name ?? found.id, value: found.id }));
}
