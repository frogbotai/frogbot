import { z } from 'zod';

import { defineAction } from '../define.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const forbiddenHeaders = new Set([
  'authorization',
  'proxy-authorization',
  'host',
  'cookie',
  'content-length',
  'transfer-encoding',
]);

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']),
  path: z.string().min(1),
  headers: z
    .record(z.string(), z.string())
    .default({})
    .refine(
      (headers) => Object.keys(headers).every((name) => !forbiddenHeaders.has(name.toLowerCase())),
      'Authentication and transport headers cannot be overridden.',
    ),
  query: z.record(z.string(), scalar).optional(),
  body: z.json().optional(),
});

const output = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.json(),
});

export const customApiCall = defineAction({
  slug: 'customApiCall',
  description: 'Make an authenticated call to the PostHog API.',
  input: inputSchema,
  output,
  async run({ input, client }) {
    return (await client.request(input)) as z.output<typeof output>;
  },
});
