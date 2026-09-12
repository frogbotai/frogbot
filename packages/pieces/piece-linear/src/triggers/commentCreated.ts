import { z } from 'zod';

import { webhookTrigger } from './webhook.js';

export const commentCreated = webhookTrigger({
  slug: 'commentCreated',
  action: 'create',
  resourceType: 'Comment',
  input: z.object({
    teamIds: z.array(z.string()).optional(),
    authorIds: z.array(z.string()).optional(),
  }),
  matches: (delivery, input) =>
    (!input.teamIds?.length ||
      (delivery.data?.issue?.team?.id !== undefined &&
        input.teamIds.includes(delivery.data.issue.team.id))) &&
    (!input.authorIds?.length ||
      (delivery.data?.userId !== undefined && input.authorIds.includes(delivery.data.userId))),
});
