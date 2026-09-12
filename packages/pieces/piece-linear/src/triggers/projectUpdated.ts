import { z } from 'zod';

import { webhookTrigger } from './webhook.js';

export const projectUpdated = webhookTrigger({
  slug: 'projectUpdated',
  action: 'update',
  resourceType: 'Project',
  input: z.object({
    teamIds: z.array(z.string()).optional(),
    projectStatus: z.string().optional(),
  }),
  matches: (delivery, input) =>
    Boolean(delivery.updatedFrom?.statusId) &&
    (!input.teamIds?.length || input.teamIds.some((id) => delivery.data?.teamIds?.includes(id))) &&
    (!input.projectStatus || input.projectStatus === delivery.data?.status?.name),
});
