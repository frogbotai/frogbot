import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { PosthogClient } from '../client.js';

const inputSchema = z.object({
  name: z.string().optional(),
  slackIncomingWebhook: z.string().optional(),
  anonymizeIps: z.boolean().optional(),
  isDemo: z.boolean().optional(),
});

const output = z
  .object({
    id: z.number().int(),
    uuid: z.string(),
    name: z.string(),
    api_token: z.string(),
  })
  .passthrough();

export const createProject = {
  slug: 'createProject',
  description: 'Create a PostHog project.',
  input: inputSchema,
  output,
  idempotent: false,
  async run({ input, client }: PieceRunArgs<z.output<typeof inputSchema>, object, PosthogClient>) {
    const response = await client.request({
      method: 'POST',
      path: '/api/projects/',
      body: {
        name: input.name,
        slack_incoming_webhook: input.slackIncomingWebhook,
        anonymize_ips: input.anonymizeIps,
        is_demo: input.isDemo,
      },
    });

    return response.body;
  },
};
