import { z } from 'zod';

import { defineAction } from '../define.js';

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

const output = z.object({ status: z.number() }).passthrough();

export const createEvent = defineAction({
  slug: 'createEvent',
  description: 'Capture an event in PostHog.',
  input: inputSchema,
  output,
  idempotent: false,
  async run({ input, client }) {
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

    return response.body as z.output<typeof output>;
  },
});
