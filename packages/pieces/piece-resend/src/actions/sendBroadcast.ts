import { z } from 'zod';

import { defineAction } from '../define.js';
import { compact } from '../format.js';

const input = z.object({ broadcast_id: z.string() }).passthrough().extend({
  scheduled_at: z.string().optional(),
});

export const sendBroadcast = defineAction({
  slug: 'sendBroadcast',
  description: 'Send a broadcast',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { broadcast_id } = input;
    const body = compact({ scheduled_at: input.scheduled_at || undefined });

    return client.request({ method: 'POST', path: `/broadcasts/${broadcast_id}/send`, body });
  },
});
