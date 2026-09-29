import { z } from 'zod';

import { defineAction } from '../define.js';

const json: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);
const customApiCallInput = z.object({
  method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).default('GET'),
  path: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: json.optional(),
});

export const customApiCall = defineAction({
  slug: 'customApiCall',
  label: 'Custom API call',
  description: 'Call a Zoom API endpoint.',
  input: customApiCallInput,
  output: json,
  async run({ input, client, req }) {
    const headers = Object.fromEntries(
      Object.entries(input.headers).filter(([name]) => name.toLowerCase() !== 'authorization'),
    );

    return client({ ...input, headers, signal: req.signal ?? undefined });
  },
});
