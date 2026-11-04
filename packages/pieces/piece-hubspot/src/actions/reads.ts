import { z } from 'zod';

import { signal } from '../client.js';
import { objectType, recordId } from '../config.js';
import { defineAction } from '../define.js';
import { cursorPage, pageInput, pageOutput } from '../pagination.js';
import {
  associationLabel,
  crmRecord,
  list,
  listMember,
  owner,
  pipeline,
  property,
} from '../records.js';

const names = (label: string, description: string) =>
  z
    .array(z.string().regex(/^[\w-]+$/, `${label} must be HubSpot internal names.`))
    .optional()
    .meta({ label, description });

export const listRecords = defineAction({
  slug: 'listRecords',
  description:
    'List one page of a CRM object’s records: contacts, companies, deals, tickets, activities (notes, emails, calls, meetings, tasks), line items, products or a custom object. Unlike search, this has no 10,000-result limit.',
  input: z.object({
    objectType,
    properties: names(
      'Properties',
      'Property names to return. HubSpot returns a few defaults when this is empty.',
    ),
    associations: names(
      'Associations',
      'Object types whose associated IDs to include, such as companies. Only the first page of each comes back; use listAssociations for the rest.',
    ),
    ...pageInput,
  }),
  output: pageOutput(crmRecord),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(cursorPage(crmRecord), {
      path: `/crm/v3/objects/${input.objectType}`,
      query: {
        limit: input.limit,
        after: input.cursor,
        properties: input.properties,
        associations: input.associations,
      },
      signal: signal(req),
    });
  },
});

const associationsPage = z.object({
  results: z.array(
    z.object({
      from: z.object({ id: z.coerce.string() }),
      to: z.array(
        z.object({
          toObjectId: z.coerce.string(),
          associationTypes: z.array(associationLabel),
        }),
      ),
      paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
    }),
  ),
  errors: z
    .array(z.object({ message: z.string(), category: z.string().optional() }))
    .optional()
    .default([]),
});

export const listAssociations = defineAction({
  slug: 'listAssociations',
  description:
    'Read the associations from up to 1,000 records to one object type, with their labels. Each record’s result has its own nextCursor; pass it back in cursors to read that record’s next page.',
  input: z.object({
    fromType: objectType.meta({ label: 'From object type' }),
    toType: objectType.meta({ label: 'To object type' }),
    ids: z.array(recordId('Record ID')).min(1).max(1000).meta({ label: 'Record IDs' }),
    cursors: z
      .record(z.string(), z.string().min(1))
      .optional()
      .meta({ description: 'A record’s nextCursor from a previous call, keyed by record ID.' }),
  }),
  output: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        associations: z.array(z.object({ id: z.string(), labels: z.array(associationLabel) })),
        nextCursor: z.string().nullable(),
      }),
    ),
    errors: z.array(z.object({ message: z.string(), category: z.string().optional() })),
  }),
  idempotent: true,
  async run({ client, input, req }) {
    const page = await client.request(associationsPage, {
      method: 'POST',
      path: `/crm/v4/associations/${input.fromType}/${input.toType}/batch/read`,
      body: {
        inputs: input.ids.map((id) => {
          const after = input.cursors?.[id];

          return after === undefined ? { id } : { id, after };
        }),
      },
      signal: signal(req),
    });

    return {
      results: page.results.map((result) => ({
        id: result.from.id,
        associations: result.to.map((to) => ({ id: to.toObjectId, labels: to.associationTypes })),
        nextCursor: result.paging?.next?.after ?? null,
      })),
      errors: page.errors,
    };
  },
});

const listsPage = z.object({
  lists: z.array(list),
  hasMore: z.boolean(),
  offset: z.number(),
});

export const listLists = defineAction({
  slug: 'listLists',
  description: 'List one page of lists (segments), optionally filtered by name or object type.',
  input: z.object({
    query: z.string().optional().meta({ description: 'Only lists whose name contains this.' }),
    objectTypeId: z
      .string()
      .regex(/^\d+-\d+$/)
      .optional()
      .meta({ description: 'Only lists of this object type, such as 0-1 for contacts.' }),
    limit: pageInput.limit,
    cursor: z
      .string()
      .regex(/^\d+$/, "cursor must be a previous page's nextCursor.")
      .optional()
      .meta({ description: "The previous page's nextCursor. Keep the other inputs the same." }),
  }),
  output: pageOutput(list),
  idempotent: true,
  async run({ client, input, req }) {
    const page = await client.request(listsPage, {
      method: 'POST',
      path: '/crm/v3/lists/search',
      body: {
        query: input.query ?? '',
        count: input.limit,
        offset: input.cursor === undefined ? 0 : Number(input.cursor),
        additionalProperties: [],
        ...(input.objectTypeId ? { objectTypeId: input.objectTypeId } : {}),
      },
      signal: signal(req),
    });

    return { results: page.lists, nextCursor: page.hasMore ? String(page.offset) : null };
  },
});

export const listListMembers = defineAction({
  slug: 'listListMembers',
  description: 'List one page of the record IDs in a list, ordered by record ID.',
  input: z.object({ listId: recordId('List ID'), ...pageInput }),
  output: pageOutput(listMember),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(cursorPage(listMember), {
      path: `/crm/v3/lists/${input.listId}/memberships`,
      query: { limit: input.limit, after: input.cursor },
      signal: signal(req),
    });
  },
});

export const listOwners = defineAction({
  slug: 'listOwners',
  description: 'List one page of the account’s owners: the users records can be assigned to.',
  input: z.object({
    archived: z
      .boolean()
      .optional()
      .meta({ description: 'List deactivated owners instead of active ones.' }),
    ...pageInput,
  }),
  output: pageOutput(owner),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(cursorPage(owner), {
      path: '/crm/v3/owners',
      query: { limit: input.limit, after: input.cursor, archived: input.archived },
      signal: signal(req),
    });
  },
});

export const listPipelines = defineAction({
  slug: 'listPipelines',
  description: 'List every deal or ticket pipeline, with its stages.',
  input: z.object({ objectType: z.enum(['deals', 'tickets']).meta({ label: 'Object type' }) }),
  output: z.object({ results: z.array(pipeline) }),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(z.object({ results: z.array(pipeline) }), {
      path: `/crm/v3/pipelines/${input.objectType}`,
      signal: signal(req),
    });
  },
});

export const listProperties = defineAction({
  slug: 'listProperties',
  description:
    'List every property of a CRM object, with its type and options. Use it to choose properties for listRecords.',
  input: z.object({
    objectType,
    archived: z.boolean().optional().meta({ description: 'List archived properties instead.' }),
  }),
  output: z.object({ results: z.array(property) }),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(z.object({ results: z.array(property) }), {
      path: `/crm/v3/properties/${input.objectType}`,
      query: { archived: input.archived },
      signal: signal(req),
    });
  },
});
