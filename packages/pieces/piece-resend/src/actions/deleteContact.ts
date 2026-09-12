import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ audience_id: z.string(), contact_id: z.string() }).passthrough();

export const deleteContact = {
  slug: 'deleteContact',
  description: 'Delete an audience contact',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({
      method: 'DELETE',
      path: `/audiences/${input.audience_id}/contacts/${input.contact_id}`,
    });
  },
} satisfies ResendAction;
