import { z } from 'zod';

import { compact } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({
  audience_id: z.string(),
  from: z.string(),
  subject: z.string(),
  name: z.string().optional(),
  reply_to: z.string().optional(),
  preview_text: z.string().optional(),
  content_type: z.enum(['html', 'text']),
  content: z.string(),
});

export const createBroadcast = {
  slug: 'createBroadcast',
  description: 'Create a broadcast',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { content, content_type, ...values } = input;
    return client.request({
      method: 'POST',
      path: '/broadcasts',
      body: compact({
        audience_id: values.audience_id,
        from: values.from,
        subject: values.subject,
        name: values.name || undefined,
        reply_to: values.reply_to || undefined,
        preview_text: values.preview_text || undefined,
        [content_type === 'html' ? 'html' : 'text']: content,
      }),
    });
  },
} satisfies ResendAction;
