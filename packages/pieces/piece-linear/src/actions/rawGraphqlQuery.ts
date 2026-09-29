import { z } from 'zod';

import { defineAction } from '../define.js';

const inputSchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const rawGraphqlQuery = defineAction({
  slug: 'rawGraphqlQuery',
  description: 'Perform a raw GraphQL query against Linear.',
  input: inputSchema,
  output: z.unknown(),
  idempotent: false,
  async run({ client, input }) {
    return client.client.rawRequest(input.query, input.variables);
  },
});
