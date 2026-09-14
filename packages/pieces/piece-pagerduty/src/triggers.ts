import type { PieceWebhookTrigger } from 'frogbot/pieces';
import { z } from 'zod';

import type { PagerdutyClient } from './client.js';
import type { PagerdutyOptions } from './config.js';

const input = z.object({});
const output = z
  .object({
    event: z
      .object({
        id: z.string(),
        event_type: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

type ManualWebhookState = { webhookUrl: string };

function manualTrigger({
  slug,
  label,
  description,
  eventType,
}: {
  slug: string;
  label: string;
  description: string;
  eventType: string;
}): PieceWebhookTrigger<
  typeof input,
  typeof output,
  PagerdutyOptions,
  PagerdutyClient,
  ManualWebhookState
> {
  return {
    slug,
    label,
    description,
    type: 'webhook',
    input,
    output,
    async onEnable({ webhookUrl }) {
      return { webhookUrl };
    },
    async onDisable() {},
    async run({ req, state }) {
      const delivery = output.safeParse(req.data);

      if (!state.webhookUrl || !delivery.success || delivery.data.event.event_type !== eventType) {
        return [];
      }

      return [{ data: delivery.data, dedupeKey: delivery.data.event.id }];
    },
  };
}

export const newIncident = manualTrigger({
  slug: 'newIncident',
  label: 'New Incident',
  description: 'Triggers when a new incident is created.',
  eventType: 'incident.triggered',
});

export const incidentResolved = manualTrigger({
  slug: 'incidentResolved',
  label: 'Incident Resolved',
  description: 'Triggers when an incident is resolved.',
  eventType: 'incident.resolved',
});

export const incidentAcknowledged = manualTrigger({
  slug: 'incidentAcknowledged',
  label: 'Incident Acknowledged',
  description: 'Triggers when an incident is acknowledged.',
  eventType: 'incident.acknowledged',
});
