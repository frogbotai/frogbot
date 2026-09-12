import { z } from 'zod';

import { compact } from '../format.js';
import type { ResendAction } from './types.js';

const input = z.object({
  name: z.string(),
  region: z.enum(['us-east-1', 'eu-west-1', 'ap-northeast-1', 'sa-east-1']).optional(),
});

export const createDomain = {
  slug: 'createDomain',
  description: 'Create a domain',
  idempotent: false,
  input,
  async run({ input, client }) {
    const result = (await client.request({
      method: 'POST',
      path: '/domains',
      body: compact({ name: input.name, region: input.region }),
    })) as Record<string, unknown>;
    return {
      id: result.id,
      name: result.name,
      status: result.status,
      region: result.region,
      created_at: result.created_at,
      sending: (result.capabilities as Record<string, unknown> | undefined)?.sending ?? '',
      receiving: (result.capabilities as Record<string, unknown> | undefined)?.receiving ?? '',
      dns_records: result.records,
    };
  },
} satisfies ResendAction;
