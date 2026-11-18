import type { Tool } from 'frogbot';
import { z } from 'zod';

import type { LawnJob } from '../frogbot-types';

const stage = z.enum(['quoted', 'scheduled', 'mowed', 'paid']);
const findInput = z.object({ stage: stage.optional() });
const cancelInput = z.object({ id: z.number() });

type JobRow = Pick<LawnJob, 'id' | 'customer' | 'stage' | 'price'>;

export const findJobs: Tool<typeof findInput, JobRow[]> = {
  slug: 'find_jobs',
  description: 'Find jobs, optionally in one stage.',
  inputSchema: findInput,
  execute: async ({ stage }, ctx) => {
    const { docs } = await ctx.frogbot.find({
      collection: 'lawn-jobs',
      where: stage ? { stage: { equals: stage } } : {},
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    });

    return docs.map(({ id, customer, stage, price }) => ({ id, customer, stage, price }));
  },
  sources: (jobs) => jobs.map((job) => ({ collection: 'lawn-jobs', id: job.id, title: job.customer })),
};

export const cancelJob: Tool<typeof cancelInput> = {
  slug: 'cancel_job',
  description: 'Cancel a scheduled job.',
  inputSchema: cancelInput,
  execute: ({ id }, ctx) =>
    ctx.frogbot.delete({
      collection: 'lawn-jobs',
      id,
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    }),
};
