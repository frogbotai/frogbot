import type { PieceJSON } from 'frogbot/pieces';
import { z } from 'zod';

import type { ResendAction } from './types.js';

export const listAudiences = {
  slug: 'listAudiences',
  description: 'List audiences',
  idempotent: true,
  input: z.object({}),
  async run({ client }) {
    const result = await client.request({ path: '/audiences' });
    return (result as { data?: PieceJSON[] })?.data ?? [];
  },
} satisfies ResendAction;
