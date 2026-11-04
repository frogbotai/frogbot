import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { definePollingTrigger } from '../define.js';
import { newById } from './poll.js';

const issueType = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    hierarchyLevel: z.number().optional(),
  })
  .passthrough();

export const issueTypeCreated = definePollingTrigger({
  slug: 'issueTypeCreated',
  description: 'Emit each new issue type in a Jira project.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({ projectId: identifier.meta({ label: 'Project' }) }),
  output: issueType,
  async run({ client, input, cursor, req }) {
    const types = await client.request(z.array(issueType), {
      path: '/issuetype/project',
      query: { projectId: input.projectId },
      signal: signal(req),
    });

    return newById(cursor, types);
  },
});
