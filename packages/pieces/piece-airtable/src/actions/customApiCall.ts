import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { AirtableClient } from '../client.js';
import { defineAirtableAction } from '../definitions.js';

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z
    .string()
    .startsWith('/')
    .refine((path) => !path.split('/').includes('..'), 'Path cannot contain parent segments.'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
});

export const customApiCall = defineAirtableAction({
  slug: 'customApiCall',
  description: 'Call an Airtable API endpoint with the configured credential.',
  input: inputSchema,
  output: z.unknown(),
  async run({
    client,
    input,
    req,
  }: PieceRunArgs<z.output<typeof inputSchema>, object, AirtableClient>) {
    return client.request({
      method: input.method,
      path: input.path,
      query: input.query,
      body: input.body,
      signal: req.signal ?? undefined,
    });
  },
});
