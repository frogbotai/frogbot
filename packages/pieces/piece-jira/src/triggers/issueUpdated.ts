import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { issue } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

export const issueUpdated = definePollingTrigger({
  slug: 'issueUpdated',
  description: 'Emit each Jira issue update, optionally only for issues matching a JQL filter.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object(jqlInput),
  output: issue,
  async run({ client, input, cursor, req }) {
    return pollIssues(client, {
      cursor,
      input,
      timeField: 'updated',
      items: ({ changelog: _changelog, ...item }) => [
        { id: item.id, epoch: Date.parse(String(item.fields?.updated)), event: item },
      ],
      signal: signal(req),
    });
  },
});
