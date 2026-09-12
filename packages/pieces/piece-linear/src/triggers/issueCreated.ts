import { z } from 'zod';

import { teamId } from '../config.js';
import { webhookTrigger } from './webhook.js';

export const issueCreated = webhookTrigger({
  slug: 'issueCreated',
  action: 'create',
  resourceType: 'Issue',
  input: z.object({ teamId }),
});
