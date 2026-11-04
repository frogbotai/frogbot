import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issuePath, success } from '../records.js';
import { issueOptions, userOptions } from './options.js';

export const assignIssue = defineAction({
  slug: 'assignIssue',
  description: 'Set the assignee of a Jira issue, replacing any current one. Changes nothing else.',
  input: z.object({
    issueKey,
    assignee: z.string().trim().min(1).meta({ description: 'The assignee accountId.' }),
  }),
  output: success,
  idempotent: true,
  options: { issueKey: issueOptions, assignee: userOptions },
  async run({ client, input, req }) {
    await client.request(z.unknown(), {
      method: 'PUT',
      path: issuePath(input.issueKey, '/assignee'),
      body: { accountId: input.assignee },
      signal: signal(req),
    });

    return { success: true as const };
  },
});
