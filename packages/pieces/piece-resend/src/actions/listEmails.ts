import { z } from 'zod';

import type { ResendAction } from './types.js';

export const listEmails = {
  slug: 'listEmails',
  description: 'List sent emails',
  idempotent: true,
  input: z.object({}),
  async run({ client }) {
    const result = await client.request({ path: '/emails' });
    const emails = (result as { data?: Array<Record<string, unknown>> })?.data ?? [];
    return emails.map((message) => ({
      id: message.id,
      from: message.from,
      to: Array.isArray(message.to) ? message.to.join(', ') : '',
      subject: message.subject,
      last_event: message.last_event,
      created_at: message.created_at,
      scheduled_at: message.scheduled_at ?? '',
      cc: Array.isArray(message.cc) ? message.cc.join(', ') : '',
      bcc: Array.isArray(message.bcc) ? message.bcc.join(', ') : '',
      reply_to: Array.isArray(message.reply_to) ? message.reply_to.join(', ') : '',
    }));
  },
} satisfies ResendAction;
