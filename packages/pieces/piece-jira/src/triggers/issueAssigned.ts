import { z } from 'zod';

import { signal } from '../client.js';
import { definePollingTrigger } from '../define.js';
import { issue } from '../records.js';
import { jqlInput, pollIssues } from './poll.js';

const assignee = z.object({ accountId: z.string().nullish(), displayName: z.string().nullish() });

export const issueAssigned = definePollingTrigger({
  slug: 'issueAssigned',
  description:
    "Emit each change of a Jira issue's assignee, optionally only to one person or to the connected account.",
  type: 'polling',
  schedule: '*/5 * * * *',
  input: z.object({
    assignedToMe: z.boolean().default(false).meta({
      description: "Only assignments to the trigger's own Jira account. Overrides assignee.",
    }),
    assignee: z.string().optional().meta({ description: 'Only assignments to this accountId.' }),
    ...jqlInput,
  }),
  output: z.object({
    issue,
    change: z.object({ from: assignee, to: assignee, by: z.unknown(), at: z.string() }),
  }),
  async run({ client, input, cursor, req }) {
    const target = input.assignedToMe
      ? ' TO currentUser()'
      : input.assignee
        ? ` TO "${input.assignee.replace(/["\\]/g, '')}"`
        : '';

    return pollIssues(client, {
      cursor,
      input,
      timeField: 'updated',
      scope: (window) => `assignee CHANGED${target} AFTER ${window}`,
      expand: ['changelog'],
      items: ({ changelog, ...item }) =>
        (changelog?.histories ?? []).flatMap((history) =>
          history.items
            .filter((change) => change.fieldId === 'assignee' || change.field === 'assignee')
            .filter(
              (change) => input.assignedToMe || !input.assignee || change.to === input.assignee,
            )
            .map((change) => ({
              id: history.id,
              epoch: Date.parse(history.created),
              event: {
                issue: item,
                change: {
                  from: { accountId: change.from, displayName: change.fromString },
                  to: { accountId: change.to, displayName: change.toString },
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
