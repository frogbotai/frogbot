import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { BraveSearch } from '../client.js';

const input = z.object({
  query: z.string().min(1).meta({ label: 'Query', description: 'The search query' }),
  count: z.number().int().min(1).max(20).default(10).meta({
    label: 'Count',
    description: 'Number of results (1-20)',
  }),
});

const result = z
  .object({
    title: z.string(),
    url: z.string(),
    description: z.string().optional(),
  })
  .passthrough();
const output = z
  .object({
    type: z.string().optional(),
    query: z.object({ original: z.string() }).passthrough().optional(),
    web: z
      .object({ results: z.array(result) })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const searchWeb = {
  slug: 'searchWeb',
  description: 'Search the public web with Brave Search.',
  input,
  output,
  idempotent: true,
  async run({
    client,
    input: values,
    req,
  }: PieceRunArgs<z.output<typeof input>, object, BraveSearch>) {
    const response = await client.request({
      path: '/web/search',
      query: { q: values.query, count: values.count },
      signal: req.signal ?? undefined,
    });

    return response.body;
  },
};
