// src/collections/Tickets.ts
import type { CollectionConfig } from 'frogbot';

export const Tickets: CollectionConfig = {
  slug: 'tickets',
  fields: [
    { name: 'subject', type: 'text', required: true },
    { name: 'customerEmail', type: 'email', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['open', 'pending', 'solved'],
      defaultValue: 'open',
      required: true,
    },
  ],
  hooks: {
    afterChange: [
      async ({ context, doc, previousDoc, req }) => {
        if (context.automation) return doc;

        const jobId = `auto-solve:${doc.id}`;

        if (doc.status === 'pending' && previousDoc?.status !== 'pending') {
          await req.frogbot.jobs.queue({
            workflow: 'auto-solve',
            input: { ticketId: String(doc.id) },
            jobId,
            overrideAccess: true,
            req,
          });
        }

        if (doc.status !== 'pending' && previousDoc?.status === 'pending') {
          await req.frogbot.jobs.cancel({
            where: { jobId: { equals: jobId } },
            overrideAccess: true,
            req,
          });
        }

        return doc;
      },
    ],
  },
};
