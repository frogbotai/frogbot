import { z } from 'zod';

import { teamId } from '../config.js';
import { webhookTrigger } from './webhook.js';

export const issueRemoved = webhookTrigger({
  slug: 'issueRemoved',
  action: 'remove',
  resourceType: 'Issue',
  input: z.object({ teamId }),
});
