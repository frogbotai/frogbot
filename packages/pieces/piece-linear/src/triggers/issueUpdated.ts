import { z } from 'zod';

import { teamId } from '../config.js';
import { webhookTrigger } from './webhook.js';

export const issueUpdated = webhookTrigger({
  slug: 'issueUpdated',
  action: 'update',
  resourceType: 'Issue',
  input: z.object({ teamId: teamId.optional() }),
});
