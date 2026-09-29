import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import { defineAction } from '../define.js';

export const listAudiences = defineAction({
  slug: 'listAudiences',
  description: 'List audiences',
  idempotent: true,
  input: z.object({}),
  async run({ client }) {
    const result = await client.request({ path: '/audiences' });
    return (result as { data?: PieceJSON[] })?.data ?? [];
  },
});
