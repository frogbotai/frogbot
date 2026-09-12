import { z } from 'zod';

import { compact } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({ broadcast_id: z.string() }).passthrough().extend({
  scheduled_at: z.string().optional(),
});

export const sendBroadcast = {
  slug: 'sendBroadcast',
  description: 'Send a broadcast',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { broadcast_id } = input;
    const body = compact({ scheduled_at: input.scheduled_at || undefined });
    return client.request({ method: 'POST', path: `/broadcasts/${broadcast_id}/send`, body });
  },
} satisfies ResendAction;
