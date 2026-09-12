import { z } from 'zod';

import { emailBody, send as request } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({
  to: z.array(z.string()),
  from_name: z.string(),
  from: z.string(),
  bcc: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
  reply_to: z.string().optional(),
  subject: z.string(),
  content_type: z.enum(['html', 'text']),
  content: z.string(),
  scheduled_at: z.string().optional(),
});

export const send = {
  slug: 'send',
  description: 'Send a text or HTML email',
  idempotent: false,
  input,
  async run({ input, client }) {
    return request(client, emailBody(input, true), true);
  },
} satisfies ResendAction;
