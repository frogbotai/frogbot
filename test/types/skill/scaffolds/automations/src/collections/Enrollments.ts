// src/collections/Enrollments.ts
import type { CollectionConfig } from 'frogbot';

export const Enrollments: CollectionConfig = {
  slug: 'enrollments',
  admin: { useAsTitle: 'email' },
  access: { read: ({ req }) => Boolean(req.user), update: ({ req }) => Boolean(req.user) },
  fields: [
    { name: 'email', type: 'email', required: true },
    {
      name: 'status',
      type: 'select',
      options: ['active', 'paused', 'stopped', 'finished'],
      defaultValue: 'active',
      required: true,
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc;

        await req.frogbot.jobs.queue({
          workflow: 'follow-up',
          input: { enrollmentId: String(doc.id) },
          jobId: `follow-up:${doc.id}`,
          overrideAccess: true,
          req,
        });

        return doc;
      },
    ],
  },
};
