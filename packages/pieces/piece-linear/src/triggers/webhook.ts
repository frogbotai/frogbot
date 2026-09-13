import { createHash } from 'node:crypto';

import { type PieceWebhookTrigger } from 'frogbot/pieces';
import type { z } from 'zod';

import type { Linear } from '../client.js';
import type { LinearOptions } from '../config.js';

type Delivery = {
  action?: string;
  type?: string;
  data?: {
    issue?: { team?: { id?: string } };
    userId?: string;
    teamIds?: string[];
    status?: { name?: string };
  };
  updatedFrom?: { statusId?: string };
};

export function webhookTrigger<TInput extends z.ZodType>({
  slug,
  action,
  resourceType,
  input,
  matches,
}: {
  slug: string;
  action: string;
  resourceType: 'Comment' | 'Issue' | 'Project';
  input: TInput;
  matches?: (delivery: Delivery, input: z.output<TInput>) => boolean;
}): PieceWebhookTrigger<TInput, undefined, LinearOptions, Linear, { webhookId: string }> {
  return {
    slug,
    description: `Trigger when a Linear ${resourceType.toLowerCase()} is ${action}d.`,
    type: 'webhook',
    input,
    async onEnable({ client, input, webhookUrl, options }) {
      if (!options.webhookSecret) {
        throw new Error(`Linear ${slug} webhook requires createLinear({ webhookSecret }).`);
      }
      const team =
        typeof input === 'object' &&
        input !== null &&
        'teamId' in input &&
        typeof input.teamId === 'string'
          ? input.teamId
          : undefined;
      const response = await client.createWebhook({
        label: `FrogBot ${slug}`,
        url: webhookUrl,
        secret: options.webhookSecret,
        resourceTypes: [resourceType],
        ...(team ? { teamId: team } : { allPublicTeams: true }),
      });
      const webhook = response.success ? await response.webhook : undefined;
      if (!webhook) {
        throw new Error(`Linear failed to create the ${slug} webhook.`);
      }
      return { webhookId: webhook.id };
    },
    async onDisable({ client, state }) {
      const response = await client.deleteWebhook(state.webhookId);
      if (!response.success) {
        throw new Error(`Linear failed to delete the ${slug} webhook '${state.webhookId}'.`);
      }
    },
    async run({ input, req }) {
      const delivery = req.data as Delivery;
      return delivery?.type === resourceType &&
        delivery.action === action &&
        (!matches || matches(delivery, input))
        ? [
            {
              dedupeKey: createHash('sha256').update(JSON.stringify(delivery)).digest('hex'),
              data: delivery,
            },
          ]
        : [];
    },
  };
}
