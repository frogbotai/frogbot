import { z } from 'zod';

import { webhookTrigger } from './webhook.js';

export const projectRemoved = webhookTrigger({
  slug: 'projectRemoved',
  action: 'remove',
  resourceType: 'Project',
  input: z.object({}),
});
