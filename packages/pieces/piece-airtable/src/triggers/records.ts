import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { AirtableClient } from '../client.js';
import { defineAirtablePollingTrigger } from '../definitions.js';
import { recordSchema } from '../schemas.js';

const newRecordInput = z.object({
  baseId: z.string().min(1).meta({ label: 'Base ID' }),
  tableId: z.string().min(1).meta({ label: 'Table ID' }),
  viewId: z.string().optional().meta({ label: 'View ID' }),
});

async function listRecords({
  client,
  input,
  req,
  query,
}: PieceRunArgs<z.output<typeof newRecordInput>, object, AirtableClient> & {
  query?: Record<string, string | undefined>;
}) {
  return client.listAll<z.output<typeof recordSchema>>({
    path: `/${input.baseId}/${input.tableId}`,
    key: 'records',
    query: { view: input.viewId, ...query },
    signal: req.signal ?? undefined,
  });
}

export const newRecord = defineAirtablePollingTrigger({
  slug: 'newRecord',
  description: 'Emit records created since the previous poll.',
  type: 'polling' as const,
  schedule: '*/5 * * * *',
  input: newRecordInput,
  output: recordSchema,
  sample: { id: 'recExample', fields: { Name: 'Example' } },
  async run(
    args: PieceRunArgs<z.output<typeof newRecordInput>, object, AirtableClient> & {
      cursor?: number;
    },
  ) {
    const now = Date.now();
    const records = await listRecords(args);
    const events = records.filter(({ createdTime }) => {
      return !args.cursor || (createdTime !== undefined && Date.parse(createdTime) > args.cursor);
    });

    return { events, cursor: now };
  },
});

const updatedRecordInput = newRecordInput.extend({
  modifiedTimeField: z.string().min(1).meta({ label: 'Last modified time field name' }),
});

export const newOrUpdatedRecord = defineAirtablePollingTrigger({
  slug: 'newOrUpdatedRecord',
  description: 'Emit records created or updated since the previous poll.',
  type: 'polling' as const,
  schedule: '*/5 * * * *',
  input: updatedRecordInput,
  output: recordSchema,
  sample: { id: 'recExample', fields: { Name: 'Example' } },
  async run({
    client,
    input,
    cursor,
    req,
  }: PieceRunArgs<z.output<typeof updatedRecordInput>, object, AirtableClient> & {
    cursor?: number;
  }) {
    const now = Date.now();
    const since = new Date(cursor ?? now - 86_400_000).toISOString();
    const records = await listRecords({
      client,
      input,
      options: {},
      req,
      query: {
        filterByFormula: `IS_AFTER({${input.modifiedTimeField}},${JSON.stringify(since)})`,
      },
    });

    return { events: records, cursor: now };
  },
});
