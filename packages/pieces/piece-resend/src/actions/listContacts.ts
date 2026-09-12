import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ audience_id: z.string() }).passthrough();

export const listContacts = {
  slug: 'listContacts',
  description: 'List audience contacts',
  idempotent: true,
  input,
  async run({ input, client }) {
    const result = await client.request({ path: `/audiences/${input.audience_id}/contacts` });
    return (result as { data?: PieceJSON[] })?.data ?? [];
  },
} satisfies ResendAction;
