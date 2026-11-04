import { z } from 'zod';

import { assertDataPath, signal } from '../client.js';
import { dataRoot, objectName } from '../config.js';
import { defineAction } from '../define.js';
import { queryPage, queryPageOutput } from '../records.js';

const firstPage = z.strictObject({
  soql: z.string().trim().min(1).meta({
    label: 'SOQL',
    description: 'A SOQL query, such as SELECT Id, Name FROM Account ORDER BY Id.',
  }),
  queryAll: z
    .boolean()
    .default(false)
    .meta({ label: 'Include deleted', description: 'Also return deleted and merged records.' }),
  batchSize: z.number().int().min(200).max(2000).optional().meta({
    label: 'Page size',
    description: 'Records per page, 200 to 2,000. Salesforce may return fewer.',
  }),
});

const nextPage = z.strictObject({
  nextRecordsUrl: z
    .string()
    .refine((path) => {
      try {
        assertDataPath(path);

        return true;
      } catch {
        return false;
      }
    }, 'nextRecordsUrl must be a path under /services/data/.')
    .meta({ description: "The previous page's nextRecordsUrl." }),
});

export const query = defineAction({
  slug: 'query',
  label: 'Run Query',
  description:
    'Read one page of a SOQL query, or the next page with the previous nextRecordsUrl. Over 2,000 records, a Bulk query job is usually faster.',
  input: z.union([firstPage, nextPage]),
  output: queryPageOutput,
  idempotent: true,
  run({ client, input, req }) {
    if ('nextRecordsUrl' in input) {
      return client.request(queryPage, { path: input.nextRecordsUrl, signal: signal(req) });
    }

    return client.request(queryPage, {
      path: `${dataRoot}/${input.queryAll ? 'queryAll' : 'query'}`,
      query: { q: input.soql },
      headers: input.batchSize ? { 'sforce-query-options': `batchSize=${input.batchSize}` } : {},
      signal: signal(req),
    });
  },
});

const objectSummary = z.object({
  name: z.string(),
  label: z.string(),
  labelPlural: z.string().optional(),
  custom: z.boolean(),
  queryable: z.boolean(),
  createable: z.boolean(),
  keyPrefix: z.string().nullable().optional(),
});

export const listObjects = defineAction({
  slug: 'listObjects',
  description: "List the org's objects, standard and custom, with whether each can be queried.",
  input: z.object({}),
  output: z.object({ objects: z.array(objectSummary) }),
  idempotent: true,
  async run({ client, req }) {
    const result = await client.request(z.object({ sobjects: z.array(objectSummary) }), {
      path: `${dataRoot}/sobjects`,
      signal: signal(req),
    });

    return { objects: result.sobjects };
  },
});

const field = z.object({
  name: z.string(),
  label: z.string(),
  type: z.string(),
  custom: z.boolean(),
  createable: z.boolean(),
  queryable: z.boolean().optional(),
  referenceTo: z.array(z.string()),
  relationshipName: z.string().nullable(),
});

const childRelationship = z.object({
  childSObject: z.string(),
  field: z.string(),
  relationshipName: z.string().nullable(),
});

const description = z.object({
  name: z.string(),
  label: z.string(),
  custom: z.boolean(),
  queryable: z.boolean(),
  createable: z.boolean(),
  fields: z.array(field),
  childRelationships: z.array(childRelationship),
});

export const describeObject = defineAction({
  slug: 'describeObject',
  description:
    "Describe one object's fields: type, whether custom, and for lookups the objects they point to. Pass ifModifiedSince to skip an unchanged object.",
  input: z.object({
    object: objectName,
    ifModifiedSince: z.iso.datetime({ offset: true }).optional().meta({
      label: 'If modified since',
      description: 'Returns { notModified: true } when the object has not changed since then.',
    }),
  }),
  output: z.union([
    z.object({ notModified: z.literal(true) }),
    description.extend({ notModified: z.literal(false) }),
  ]),
  idempotent: true,
  async run({ client, input, req }) {
    const response = await client.send({
      path: `${dataRoot}/sobjects/${input.object}/describe`,
      headers: input.ifModifiedSince
        ? { 'if-modified-since': new Date(input.ifModifiedSince).toUTCString() }
        : {},
      signal: signal(req),
    });

    if (response.status === 304) return { notModified: true as const };

    return { ...description.parse(await response.json()), notModified: false as const };
  },
});
