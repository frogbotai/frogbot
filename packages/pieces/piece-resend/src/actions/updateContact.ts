import { z } from 'zod';

import { defineAction } from '../define.js';
import { compact } from '../format.js';

const input = z.object({
  audience_id: z.string(),
  contact_id: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  unsubscribed: z.boolean().optional(),
});

export const updateContact = defineAction({
  slug: 'updateContact',
  description: 'Update an audience contact',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { audience_id, contact_id } = input;
    const body = compact({
      first_name: input.first_name || undefined,
      last_name: input.last_name || undefined,
      unsubscribed: input.unsubscribed ?? undefined,
    });
    return client.request({
      method: 'PATCH',
      path: `/audiences/${audience_id}/contacts/${contact_id}`,
      body,
    });
  },
});
