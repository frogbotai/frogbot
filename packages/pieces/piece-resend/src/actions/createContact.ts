import { z } from 'zod';

import { compact } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({
  audience_id: z.string(),
  email: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  unsubscribed: z.boolean().optional(),
});

export const createContact = {
  slug: 'createContact',
  description: 'Create an audience contact',
  idempotent: false,
  input,
  async run({ input, client }) {
    const { audience_id } = input;
    const body = compact({
      email: input.email,
      first_name: input.first_name || undefined,
      last_name: input.last_name || undefined,
      unsubscribed: input.unsubscribed,
    });
    return client.request({ method: 'POST', path: `/audiences/${audience_id}/contacts`, body });
  },
} satisfies ResendAction;
