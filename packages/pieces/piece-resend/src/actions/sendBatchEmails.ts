import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import { emailBody } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({
  emails: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      subject: z.string(),
      content_type: z.enum(['html', 'text']),
      content: z.string(),
      reply_to: z.string().optional(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
    }),
  ),
  idempotency_key: z.string().optional(),
});

export const sendBatchEmails = {
  slug: 'sendBatchEmails',
  description: 'Send up to 100 emails',
  idempotent: false,
  input,
  async run({ input, client }) {
    const result = await client.request({
      method: 'POST',
      path: '/emails/batch',
      body: input.emails.map((message) => emailBody(message)),
      headers: input.idempotency_key ? { 'Idempotency-Key': input.idempotency_key } : undefined,
    });
    return (result as { data?: PieceJSON[] })?.data ?? [];
  },
} satisfies ResendAction;
