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
    { name: 'pendingSince', type: 'date', admin: { readOnly: true } },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        const entering =
          data.status === 'pending' &&
          (operation === 'create' || originalDoc?.status !== 'pending');

        data.pendingSince = entering ? new Date().toISOString() : originalDoc?.pendingSince;

        return data;
      },
    ],
    afterChange: [
      async ({ context, doc, previousDoc, req }) => {
        if (context.automation) return doc;
        if (doc.status !== 'pending' || previousDoc?.status === 'pending') return doc;

        const pendingSince = String(doc.pendingSince);

        await req.frogbot.jobs.queue({
          workflow: 'auto-solve',
          input: { ticketId: String(doc.id), pendingSince },
          jobId: `auto-solve:${doc.id}:${pendingSince}`,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
