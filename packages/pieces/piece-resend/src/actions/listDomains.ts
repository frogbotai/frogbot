import { z } from 'zod';

import type { ResendAction } from './types.js';

export const listDomains = {
  slug: 'listDomains',
  description: 'List domains',
  idempotent: true,
  input: z.object({}),
  async run({ client }) {
    const result = await client.request({ path: '/domains' });
    const domains = (result as { data?: Array<Record<string, unknown>> })?.data ?? [];
    return domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      status: domain.status,
      region: domain.region,
      created_at: domain.created_at,
      sending: (domain.capabilities as Record<string, unknown> | undefined)?.sending ?? '',
      receiving: (domain.capabilities as Record<string, unknown> | undefined)?.receiving ?? '',
    }));
  },
} satisfies ResendAction;
