import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { allValues } from '../pagination.js';
import { newById } from './poll.js';

const priority = z
  .object({ id: z.string(), name: z.string(), description: z.string().optional() })
  .passthrough();

export const priorityCreated = definePollingTrigger({
  slug: 'priorityCreated',
  description: 'Emit each new Jira priority.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({}),
  output: priority,
  async run({ client, cursor, req }) {
    return newById(
      cursor,
      await allValues(client, priority, { path: '/priority/search', signal: signal(req) }),
    );
  },
});
