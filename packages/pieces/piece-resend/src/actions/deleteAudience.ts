import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ audience_id: z.string() }).passthrough();

export const deleteAudience = {
  slug: 'deleteAudience',
  description: 'Delete an audience',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'DELETE', path: `/audiences/${input.audience_id}` });
  },
} satisfies ResendAction;
