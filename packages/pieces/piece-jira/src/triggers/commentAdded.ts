import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { comment } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

const comments = z.object({ comments: z.array(comment) }).passthrough();

export const commentAdded = definePollingTrigger({
  slug: 'commentAdded',
  description: 'Emit each new comment on a Jira issue, with the issue it is on.',
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object(jqlInput),
  output: z.object({
    issue: z.object({ id: z.string(), key: z.string(), summary: z.string().optional() }),
    comment,
  }),
  async run({ client, input, cursor, req }) {
    return pollIssues(client, {
      cursor,
      input,
      timeField: 'updated',
      fields: ['summary', 'comment'],
      items: (item) => {
        const parent = {
          id: item.id,
          key: item.key,
          ...(typeof item.fields?.summary === 'string' ? { summary: item.fields.summary } : {}),
        };

        return (comments.safeParse(item.fields?.comment).data?.comments ?? []).map((entry) => ({
          id: entry.id,
          epoch: Date.parse(entry.created ?? ''),
          event: { issue: parent, comment: entry },
        }));
      },
      signal: signal(req),
    });
  },
});
