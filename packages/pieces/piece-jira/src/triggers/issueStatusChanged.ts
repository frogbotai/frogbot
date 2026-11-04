import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { issue } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

const status = z.object({ id: z.string().nullish(), name: z.string().nullish() });

export const issueStatusChanged = definePollingTrigger({
  slug: 'issueStatusChanged',
  description:
    "Emit each change of a Jira issue's status, with the old and new status, who changed it and when.",
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object(jqlInput),
  output: z.object({
    issue,
    change: z.object({ from: status, to: status, by: z.unknown(), at: z.string() }),
  }),
  async run({ client, input, cursor, req }) {
    return pollIssues(client, {
      cursor,
      input,
      timeField: 'updated',
      scope: (window) => `status CHANGED AFTER ${window}`,
      expand: ['changelog'],
      items: ({ changelog, ...item }) =>
        (changelog?.histories ?? []).flatMap((history) =>
          history.items
            .filter((change) => change.fieldId === 'status' || change.field === 'status')
            .map((change) => ({
              id: history.id,
              epoch: Date.parse(history.created),
              event: {
                issue: item,
                change: {
                  from: { id: change.from, name: change.fromString },
                  to: { id: change.to, name: change.toString },
                  by: history.author,
                  at: history.created,
                },
              },
            })),
        ),
      signal: signal(req),
    });
  },
});
