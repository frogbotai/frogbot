import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';

const inputSchema = z.object({
  query: z.string(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const rawGraphqlQuery = {
  slug: 'rawGraphqlQuery',
  description: 'Perform a raw GraphQL query against Linear.',
  input: inputSchema,
  output: z.unknown(),
  idempotent: false,
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    return client.client.rawRequest(input.query, input.variables);
  },
};
