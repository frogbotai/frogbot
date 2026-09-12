import { type PieceWebhookTrigger } from 'frogbot/pieces';
import type { z } from 'zod';

import type { Linear } from '../client.js';

type Delivery = {
  action?: string;
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
}): PieceWebhookTrigger<TInput, undefined, object, Linear, { webhookId: string }> {
  return {
    slug,
    description: `Trigger when a Linear ${resourceType.toLowerCase()} is ${action}d.`,
    type: 'webhook',
    input,
    async onEnable({ client, input, webhookUrl }) {
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
        resourceTypes: [resourceType],
        ...(team ? { teamId: team } : { allPublicTeams: true }),
      });
      if (!response.success || !response.webhook)
        {throw new Error(`Linear failed to create the ${slug} webhook.`);}
      return { webhookId: (await response.webhook).id };
    },
    async onDisable({ client, state }) {
      await client.deleteWebhook(state.webhookId);
    },
    async run({ input, req }) {
      const delivery = req.data as Delivery;
      return delivery.action === action && (!matches || matches(delivery, input)) ? [delivery] : [];
    },
  };
}
