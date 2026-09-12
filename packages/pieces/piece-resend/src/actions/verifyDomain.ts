import { z } from 'zod';

import type { ResendAction } from './types.js';

const input = z.object({ domain_id: z.string() }).passthrough();

export const verifyDomain = {
  slug: 'verifyDomain',
  description: 'Verify a domain',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'POST', path: `/domains/${input.domain_id}/verify` });
  },
} satisfies ResendAction;
