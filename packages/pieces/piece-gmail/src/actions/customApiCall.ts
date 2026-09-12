import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Gmail } from '../client.js';

const inputSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/'),
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
});
export const customApiCall = {
  slug: 'customApiCall',
  description: 'Make an authenticated Gmail API call.',
  input: inputSchema,
  output: z.unknown(),
  idempotent: false,
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Gmail>) {
    const request = client.context._options.auth;
    if (!request || typeof request === 'string' || !('request' in request))
      {throw new Error('[frogbot] Gmail client is missing authenticated transport.');}
    return (
      await request.request({
        method: input.method,
        url: `https://gmail.googleapis.com/gmail/v1${input.path}`,
        params: input.query,
        data: input.body,
      })
    ).data;
  },
};
