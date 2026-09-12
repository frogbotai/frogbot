import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ email_id: z.string() }).passthrough().extend({ scheduled_at: z.string() });

export const rescheduleEmail = {
  slug: 'rescheduleEmail',
  description: 'Reschedule an email',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { email_id, ...body } = input;
    return client.request({ method: 'PATCH', path: `/emails/${email_id}`, body });
  },
} satisfies ResendAction;
