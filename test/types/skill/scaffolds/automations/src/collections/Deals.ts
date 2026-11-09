// src/collections/Deals.ts
import type { CollectionConfig } from 'frogbot';

export const Deals: CollectionConfig = {
  slug: 'deals',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'stage', type: 'select', options: ['open', 'won', 'lost'], defaultValue: 'open' },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (doc.stage !== 'won' || previousDoc?.stage === 'won') return doc;

        const deliveryId = `deal-won:${doc.id}:${String(doc.updatedAt)}`;

        await req.frogbot.jobs.queue({
          task: 'send-webhook',
          input: {
            deliveryId,
            url: process.env.DEAL_WEBHOOK_URL!,
            event: 'deal.won',
            data: { id: doc.id, name: doc.name },
          },
          jobId: deliveryId,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
