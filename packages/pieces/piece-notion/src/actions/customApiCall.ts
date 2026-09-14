import { z } from 'zod';

import { defineNotionAction } from '../definitions.js';

const json = z.json();

export const customApiCall = defineNotionAction({
  slug: 'customApiCall',
  description: 'Call a Notion API endpoint with the configured credential.',
  input: z.object({
    method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
    path: z
      .string()
      .startsWith('/')
      .refine((path) => !path.split('/').includes('..')),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    body: json.optional(),
  }),
  output: json,
  async run({ client, input, req }) {
    const result = await client.request({
      method: input.method,
      path: input.path,
      query: input.query,
      body: input.body,
      signal: req.signal ?? undefined,
    });

    return json.parse(result);
  },
});
