import { z } from 'zod';

import { defineAction } from '../define.js';

const input = z.object({ domain_id: z.string() }).passthrough();

export const verifyDomain = defineAction({
  slug: 'verifyDomain',
  description: 'Verify a domain',
  idempotent: false,
  input,
  async run({ input, client }) {
    return client.request({ method: 'POST', path: `/domains/${input.domain_id}/verify` });
  },
});
