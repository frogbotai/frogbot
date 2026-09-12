import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ email_id: z.string() }).passthrough();

export const cancelScheduledEmail = {
  slug: 'cancelScheduledEmail',
  description: 'Cancel a scheduled email',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'POST', path: `/emails/${input.email_id}/cancel` });
  },
} satisfies ResendAction;
