import { z } from 'zod';

import { signal } from '../client.js';
import { dataRoot, fieldName, objectName, recordId } from '../config.js';
import { defineAction } from '../define.js';
import {
  changed,
  created,
  queryPage,
  queryPageOutput,
  sobject,
  soqlString,
  upserted,
} from '../records.js';
import { fieldOptions, objectOptions } from './options.js';

const values = z
  .record(z.string().regex(/^[A-Za-z]\w*$/), z.json())
  .meta({ label: 'Fields', description: 'Field values by API name, such as {"Name": "Acme"}.' });

export const createRecord = defineAction({
  slug: 'createRecord',
  description: 'Create a record of any object from field values by API name.',
  input: z.object({ object: objectName, fields: values }),
  output: created,
  idempotent: false,
  options: { object: objectOptions },
  run({ client, input, req }) {
    return client.request(created, {
      method: 'POST',
      path: `${dataRoot}/sobjects/${input.object}`,
      body: input.fields,
      signal: signal(req),
    });
  },
});

export const updateRecord = defineAction({
  slug: 'updateRecord',
  description: "Update fields on any object's record. Fields left out don't change.",
  input: z.object({ object: objectName, recordId: recordId('Record ID'), fields: values }),
  output: changed,
  idempotent: true,
  options: { object: objectOptions },
  async run({ client, input, req }) {
    await client.send({
      method: 'PATCH',
      path: `${dataRoot}/sobjects/${input.object}/${input.recordId}`,
      body: input.fields,
      signal: signal(req),
    });

    return { id: input.recordId };
  },
});

export const deleteRecord = defineAction({
  slug: 'deleteRecord',
  description: "Delete any object's record. It goes to the Recycle Bin.",
  input: z.object({ object: objectName, recordId: recordId('Record ID') }),
  output: changed,
  idempotent: false,
  options: { object: objectOptions },
  async run({ client, input, req }) {
    await client.send({
      method: 'DELETE',
      path: `${dataRoot}/sobjects/${input.object}/${input.recordId}`,
      signal: signal(req),
    });

    return { id: input.recordId };
  },
});

export const getRecordByField = defineAction({
  slug: 'getRecordByField',
  label: 'Find Record',
  description:
    'Find up to 200 records of an object whose field equals a value exactly, with all their fields.',
  input: z.object({
    object: objectName,
    field: fieldName('Field'),
    value: z.string().meta({ label: 'Value' }),
  }),
  output: queryPageOutput,
  idempotent: true,
  options: { object: objectOptions, field: fieldOptions },
  run({ client, input, req }) {
    return client.request(queryPage, {
      path: `${dataRoot}/query`,
      query: {
        q: `SELECT FIELDS(ALL) FROM ${input.object} WHERE ${input.field} = ${soqlString(input.value)} LIMIT 200`,
      },
      signal: signal(req),
    });
  },
});

export const searchRecords = defineAction({
  slug: 'searchRecords',
  label: 'Find Records by Query',
  description:
    'Find up to 200 records of an object matching a SOQL WHERE clause, with all their fields.',
  input: z.object({
    object: objectName,
    where: z.string().trim().min(1).meta({
      label: 'WHERE clause',
      description:
        "Without the WHERE keyword, such as Industry = 'Technology' AND IsDeleted = false.",
    }),
  }),
  output: queryPageOutput,
  idempotent: true,
  options: { object: objectOptions },
  run({ client, input, req }) {
    return client.request(queryPage, {
      path: `${dataRoot}/query`,
      query: { q: `SELECT FIELDS(ALL) FROM ${input.object} WHERE ${input.where} LIMIT 200` },
      signal: signal(req),
    });
  },
});

const childPage = z
  .object({ records: z.array(sobject), nextPageToken: z.string().nullish() })
  .transform(({ records, nextPageToken }) => ({ records, nextPageToken: nextPageToken ?? null }));

export const listChildRecords = defineAction({
  slug: 'listChildRecords',
  label: 'Find Child Records',
  description:
    "List one page of a record's children through a child relationship, such as an Account's Contacts.",
  input: z.object({
    parentId: recordId('Parent record ID'),
    relationship: fieldName('Child relationship').meta({
      description:
        "The relationship name, such as Contacts; describeObject's childRelationships list them.",
    }),
    pageToken: z
      .string()
      .min(1)
      .optional()
      .meta({ description: "The previous page's nextPageToken." }),
  }),
  output: z.object({ records: z.array(sobject), nextPageToken: z.string().nullable() }),
  idempotent: true,
  run({ client, input, req }) {
    return client.request(childPage, {
      path: `${dataRoot}/ui-api/records/${input.parentId}/child-relationships/${input.relationship}`,
      query: { pageToken: input.pageToken },
      signal: signal(req),
    });
  },
});

export const upsertRecords = defineAction({
  slug: 'upsertRecords',
  description:
    'Insert or update up to 200 records, matched on an external ID field. Each record succeeds or fails on its own.',
  input: z.object({
    object: objectName,
    externalIdField: fieldName('External ID field'),
    records: z.array(values).min(1).max(200).meta({ label: 'Records' }),
  }),
  output: z.object({ results: z.array(upserted) }),
  idempotent: true,
  options: { object: objectOptions, externalIdField: fieldOptions },
  async run({ client, input, req }) {
    const results = await client.request(z.array(upserted), {
      method: 'PATCH',
      path: `${dataRoot}/composite/sobjects/${input.object}/${input.externalIdField}`,
      body: {
        allOrNone: false,
        records: input.records.map((record) => ({ attributes: { type: input.object }, ...record })),
      },
      signal: signal(req),
    });

    return { results };
  },
});
