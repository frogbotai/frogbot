import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { BraveSearch } from '../client.js';

const scalar = z.union([z.string(), z.number(), z.boolean()]);
const input = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/'),
  headers: z.record(z.string(), z.string()).default({}),
  queryParams: z.record(z.string(), z.union([scalar, z.array(scalar)])).default({}),
  bodyType: z.enum(['none', 'json', 'raw']).default('none'),
  body: z.unknown().optional(),
  responseIsBinary: z.boolean().default(false),
  failsafe: z.boolean().default(false),
  timeout: z.number().positive().optional(),
  followRedirects: z.boolean().default(false),
});
const output = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.unknown(),
});

export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make an authenticated request to the Brave Search API.',
  input,
  output,
  idempotent: false,
  async run({
    client,
    input: values,
    req,
  }: PieceRunArgs<z.output<typeof input>, object, BraveSearch>) {
    const headers = { ...values.headers };
    let body: BodyInit | undefined;

    if (values.bodyType === 'json') {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(values.body);
    } else if (values.bodyType === 'raw' && values.body !== undefined) {
      body = String(values.body);
    }

    return client.request({
      method: values.method,
      path: values.path,
      headers,
      query: values.queryParams,
      body,
      responseIsBinary: values.responseIsBinary,
      failsafe: values.failsafe,
      timeout: values.timeout,
      followRedirects: values.followRedirects,
      signal: req.signal ?? undefined,
    });
  },
};
