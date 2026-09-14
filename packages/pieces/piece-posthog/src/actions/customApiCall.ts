import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { PosthogClient } from '../client.js';

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

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make an authenticated call to the PostHog API.',
  input: inputSchema,
  output: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    body: z.json(),
  }),
  async run({ input, client }: PieceRunArgs<z.output<typeof inputSchema>, object, PosthogClient>) {
    return client.request(input);
  },
};
