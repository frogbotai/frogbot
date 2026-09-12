import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ domain_id: z.string() }).passthrough();

export const deleteDomain = {
  slug: 'deleteDomain',
  description: 'Delete a domain',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'DELETE', path: `/domains/${input.domain_id}` });
  },
} satisfies ResendAction;
