import { z } from 'zod';

import { defineWebhookTrigger } from './define.js';

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

function manualTrigger<const TSlug extends string>({
  slug,
  label,
  description,
  eventType,
}: {
  slug: TSlug;
  label: string;
  description: string;
  eventType: string;
}) {
  return defineWebhookTrigger({
    slug,
    label,
    description,
    type: 'webhook',
    input,
    output,
    onEnable({ webhookUrl }) {
      return Promise.resolve({ webhookUrl });
    },
    async onDisable() {},
    run({ req, state }) {
      const delivery = output.safeParse(req.data);

      if (!state.webhookUrl || !delivery.success || delivery.data.event.event_type !== eventType) {
        return Promise.resolve([]);
      }

      return Promise.resolve([{ data: delivery.data, dedupeKey: delivery.data.event.id }]);
    },
  });
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
