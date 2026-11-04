import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { issue } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

export const issueCreated = definePollingTrigger({
  slug: 'issueCreated',
  description: 'Emit each new Jira issue, optionally only those matching a JQL filter.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object(jqlInput),
  output: issue,
  async run({ client, input, cursor, req }) {
    return pollIssues(client, {
      cursor,
      input,
      timeField: 'created',
      items: ({ changelog: _changelog, ...item }) => [
        { id: item.id, epoch: Date.parse(String(item.fields?.created)), event: item },
      ],
      signal: signal(req),
    });
  },
});
