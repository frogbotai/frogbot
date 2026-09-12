import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ broadcast_id: z.string() }).passthrough();

export const deleteBroadcast = {
  slug: 'deleteBroadcast',
  description: 'Delete a broadcast',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'DELETE', path: `/broadcasts/${input.broadcast_id}` });
  },
} satisfies ResendAction;
