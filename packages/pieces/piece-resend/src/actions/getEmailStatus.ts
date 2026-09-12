import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ email_id: z.string() }).passthrough();

export const getEmailStatus = {
  slug: 'getEmailStatus',
  description: 'Get an email delivery status',
  idempotent: true,
  input,
  async run({ input, client }) {
    return client.request({ path: `/emails/${input.email_id}` });
  },
} satisfies ResendAction;
