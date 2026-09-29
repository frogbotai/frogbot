import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ audience_id: z.string() }).passthrough();

export const deleteAudience = defineAction({
  slug: 'deleteAudience',
  description: 'Delete an audience',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'DELETE', path: `/audiences/${input.audience_id}` });
  },
});
