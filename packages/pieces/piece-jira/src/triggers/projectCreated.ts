import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { allValues } from '../pagination.js';
import { newById } from './poll.js';

const project = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    projectTypeKey: z.string().optional(),
  })
  .passthrough();

export const projectCreated = definePollingTrigger({
  slug: 'projectCreated',
  description: 'Emit each new Jira project.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({}),
  output: project,
  async run({ client, cursor, req }) {
    return newById(
      cursor,
      await allValues(client, project, { path: '/project/search', signal: signal(req) }),
    );
  },
});
