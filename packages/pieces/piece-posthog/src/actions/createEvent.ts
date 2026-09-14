import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { PosthogClient } from '../client.js';

const inputSchema = z.object({
  event: z.string().min(1).meta({ label: 'Event name' }),
  eventType: z
    .enum(['alias', 'capture', 'identify', 'page', 'screen'])
    .meta({ label: 'Event type' }),
  distinctId: z.string().min(1).meta({ label: 'Distinct ID' }),
  properties: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  messageId: z.string().optional(),
  category: z.string().optional(),
});

export const createEvent = {
  slug: 'createEvent',
  description: 'Capture an event in PostHog.',
  input: inputSchema,
  output: z.object({ status: z.number() }).passthrough(),
  idempotent: false,
  async run({ input, client }: PieceRunArgs<z.output<typeof inputSchema>, object, PosthogClient>) {
    const response = await client.request({
      method: 'POST',
      path: '/capture/',
      body: {
        event: input.event,
        type: input.eventType,
        api_key: client.personalApiKey,
        messageId: input.messageId,
        context: input.context ?? {},
        properties: input.properties ?? {},
        distinct_id: input.distinctId,
        category: input.category,
      },
    });

    return response.body;
  },
};
