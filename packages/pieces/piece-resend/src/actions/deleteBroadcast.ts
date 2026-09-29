import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ broadcast_id: z.string() }).passthrough();

export const deleteBroadcast = defineAction({
  slug: 'deleteBroadcast',
  description: 'Delete a broadcast',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'DELETE', path: `/broadcasts/${input.broadcast_id}` });
  },
});
