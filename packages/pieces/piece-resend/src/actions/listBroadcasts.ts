import { z } from 'zod';

import type { ResendAction } from './types.js';

export const listBroadcasts = {
  slug: 'listBroadcasts',
  description: 'List broadcasts',
  idempotent: true,
  input: z.object({}),
  async run({ client }) {
    const result = await client.request({ path: '/broadcasts' });
    const broadcasts = (result as { data?: Array<Record<string, unknown>> })?.data ?? [];
    return broadcasts.map((broadcast) => ({
      id: broadcast.id,
      name: broadcast.name ?? '',
      audience_id: broadcast.audience_id,
      from: broadcast.from,
      subject: broadcast.subject,
      reply_to: Array.isArray(broadcast.reply_to)
        ? broadcast.reply_to.join(', ')
        : (broadcast.reply_to ?? ''),
      preview_text: broadcast.preview_text ?? '',
      status: broadcast.status,
      created_at: broadcast.created_at,
      scheduled_at: broadcast.scheduled_at ?? '',
      sent_at: broadcast.sent_at ?? '',
    }));
  },
} satisfies ResendAction;
