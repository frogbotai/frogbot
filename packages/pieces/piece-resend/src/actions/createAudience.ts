import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ name: z.string() });

export const createAudience = defineAction({
  slug: 'createAudience',
  description: 'Create an audience',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'POST', path: '/audiences', body: { name: input.name } });
  },
});
