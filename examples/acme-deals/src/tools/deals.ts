import type { Tool } from 'frogbot';
import { z } from 'zod';

import type { Deal } from '../frogbot-types';

const stage = z.enum(['lead', 'proposal', 'won', 'lost']);
const findInput = z.object({ stage: stage.optional() });
const moveInput = z.object({ id: z.number(), stage });

type DealRow = Pick<Deal, 'id' | 'name' | 'stage' | 'amount' | 'closeDate'>;

export const findDeals: Tool<typeof findInput, DealRow[]> = {
  slug: 'find_deals',
  description: 'Find deals, optionally in one stage.',
  inputSchema: findInput,
  execute: async ({ stage }, ctx) => {
    const { docs } = await ctx.frogbot.find({
      collection: 'deals',
      where: stage ? { stage: { equals: stage } } : {},
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    });

    return docs.map(({ id, name, stage, amount, closeDate }) => ({ id, name, stage, amount, closeDate }));
  },
  sources: (deals) => deals.map((deal) => ({ collection: 'deals', id: deal.id, title: deal.name })),
};

export const moveDeal: Tool<typeof moveInput> = {
  slug: 'move_deal',
  description: 'Move a deal to another stage.',
  inputSchema: moveInput,
  approval: 'required',
  execute: ({ id, stage }, ctx) =>
    ctx.frogbot.update({
      collection: 'deals',
      id,
      data: { stage },
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    }),
};
