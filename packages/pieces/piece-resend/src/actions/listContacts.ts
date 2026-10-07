import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ audience_id: z.string() }).passthrough();

export const listContacts = defineAction({
  slug: 'listContacts',
  description: 'List audience contacts',
  idempotent: true,
  input,
  async run({ input, client }) {
    const result = await client.request({ path: `/audiences/${input.audience_id}/contacts` });

    return (result as { data?: PieceJSON[] })?.data ?? [];
  },
});
