import type { PayloadRequest } from 'payload';

/**
 * Deletes failed scheduled jobs whose task is no longer registered, such as a task an upgrade
 * removed. Payload fails them on their next run and never deletes them.
 */
export async function deleteOrphanJobs({ req }: { req: PayloadRequest }): Promise<void> {
  await req.payload.db.deleteMany({
    collection: 'payload-jobs',
    req,
    where: {
      and: [
        { 'meta.scheduled': { equals: true } },
        { hasError: { equals: true } },
        { taskSlug: { exists: true } },
        { taskSlug: { not_in: (req.payload.config.jobs.tasks ?? []).map(({ slug }) => slug) } },
      ],
    },
  });
}
