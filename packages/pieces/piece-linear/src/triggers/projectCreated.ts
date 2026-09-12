import { z } from 'zod';

import { webhookTrigger } from './webhook.js';

export const projectCreated = webhookTrigger({
  slug: 'projectCreated',
  action: 'create',
  resourceType: 'Project',
  input: z.object({}),
});
