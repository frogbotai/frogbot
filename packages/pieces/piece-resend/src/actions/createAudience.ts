import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ name: z.string() });

export const createAudience = {
  slug: 'createAudience',
  description: 'Create an audience',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'POST', path: '/audiences', body: { name: input.name } });
  },
} satisfies ResendAction;
