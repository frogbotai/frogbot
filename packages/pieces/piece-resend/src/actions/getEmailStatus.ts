import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ email_id: z.string() }).passthrough();

export const getEmailStatus = defineAction({
  slug: 'getEmailStatus',
  description: 'Get an email delivery status',
  idempotent: true,
  input,
  async run({ input, client }) {
    return client.request({ path: `/emails/${input.email_id}` });
  },
});
