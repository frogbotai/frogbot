import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z
    .string()
    .startsWith('/')
    .refine((path) => !path.split('/').includes('..'), 'Path cannot contain parent segments.'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
});

export const customApiCall = defineAction({
  slug: 'customApiCall',
  description: 'Call an Airtable API endpoint with the configured credential.',
  input: inputSchema,
  output: z.unknown(),
  async run({ client, input, req }) {
    return client.request({
      method: input.method,
      path: input.path,
      query: input.query,
      body: input.body,
      signal: req.signal ?? undefined,
    });
  },
});
