import { parse } from 'csv-parse/sync';
import { z } from 'zod';

import { signal } from '../client.js';
import { dataRoot, fieldName, objectName } from '../config.js';
import { defineAction } from '../define.js';
import { objectOptions } from './options.js';

const jobId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{15,18}$/, 'Job ID must be a Salesforce job ID.')
  .meta({ label: 'Job ID' });

const job = z.object({
  id: z.string(),
  state: z.string().meta({
    description: 'UploadComplete, InProgress, JobComplete, Failed or Aborted for a query job.',
  }),
  object: z.string().optional(),
  operation: z.string().optional(),
  numberRecordsProcessed: z.number().optional(),
  numberRecordsFailed: z.number().optional(),
  errorMessage: z.string().nullish(),
});

export const createQueryJob = defineAction({
  slug: 'createQueryJob',
  label: 'Create Bulk Query Job',
  description:
    "Start a Bulk API 2.0 query job for a large read. Check it with getQueryJob until it's JobComplete, then read its results. Bulk queries don't support FIELDS(), OFFSET, GROUP BY or parent-to-child subqueries.",
  input: z.object({
    soql: z.string().trim().min(1).meta({ label: 'SOQL' }),
    queryAll: z
      .boolean()
      .default(false)
      .meta({ label: 'Include deleted', description: 'Also return deleted and merged records.' }),
  }),
  output: job,
  idempotent: false,
  run({ client, input, req }) {
    return client.request(job, {
      method: 'POST',
      path: `${dataRoot}/jobs/query`,
      body: { operation: input.queryAll ? 'queryAll' : 'query', query: input.soql },
      signal: signal(req),
    });
  },
});

export const getQueryJob = defineAction({
  slug: 'getQueryJob',
  label: 'Get Bulk Query Job',
  description: "Read a Bulk query job's state and how many records it has processed.",
  input: z.object({ id: jobId }),
  output: job,
  idempotent: true,
  run({ client, input, req }) {
    return client.request(job, {
      path: `${dataRoot}/jobs/query/${input.id}`,
      signal: signal(req),
    });
  },
});

export const getQueryJobResults = defineAction({
  slug: 'getQueryJobResults',
  label: 'Get Bulk Query Results',
  description:
    "Read one page of a finished Bulk query job's records, then the next page with the returned locator. Values come back as strings, empty when blank.",
  input: z.object({
    id: jobId,
    locator: z
      .string()
      .min(1)
      .optional()
      .meta({ description: "The previous page's locator; leave it out for the first page." }),
    maxRecords: z.number().int().positive().optional().meta({ label: 'Page size' }),
  }),
  output: z.object({
    records: z.array(z.record(z.string(), z.string())),
    locator: z.string().nullable().meta({ description: 'null once every page is read.' }),
  }),
  idempotent: true,
  async run({ client, input, req }) {
    const response = await client.send({
      path: `${dataRoot}/jobs/query/${input.id}/results`,
      query: { locator: input.locator, maxRecords: input.maxRecords },
      headers: { accept: 'text/csv' },
      signal: signal(req),
    });

    const locator = response.headers.get('sforce-locator');
    const records: Record<string, string>[] = parse(await response.text(), {
      columns: true,
      skip_empty_lines: true,
    });

    return { records, locator: !locator || locator === 'null' ? null : locator };
  },
});

export const upsertRecordsBulk = defineAction({
  slug: 'upsertRecordsBulk',
  label: 'Bulk Upsert Records',
  description:
    'Insert or update many records from CSV through a Bulk API 2.0 ingest job, matched on an external ID field. Returns once the CSV is uploaded; Salesforce then processes the job.',
  input: z.object({
    object: objectName,
    externalIdField: fieldName('External ID field'),
    csv: z.string().min(1).meta({
      label: 'Records (CSV)',
      description: 'A header row of field API names, then one row per record.',
    }),
  }),
  output: z.object({ id: z.string(), state: z.string() }),
  idempotent: true,
  options: { object: objectOptions },
  async run({ client, input, req }) {
    const created = await client.request(job, {
      method: 'POST',
      path: `${dataRoot}/jobs/ingest`,
      body: {
        object: input.object,
        externalIdFieldName: input.externalIdField,
        contentType: 'CSV',
        operation: 'upsert',
        lineEnding: input.csv.includes('\r\n') ? 'CRLF' : 'LF',
      },
      signal: signal(req),
    });

    await client.send({
      method: 'PUT',
      path: `${dataRoot}/jobs/ingest/${created.id}/batches`,
      csv: input.csv,
      signal: signal(req),
    });

    const uploaded = await client.request(job, {
      method: 'PATCH',
      path: `${dataRoot}/jobs/ingest/${created.id}`,
      body: { state: 'UploadComplete' },
      signal: signal(req),
    });

    return { id: uploaded.id, state: uploaded.state };
  },
});
