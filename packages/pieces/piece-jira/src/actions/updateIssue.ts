import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issueFields, issueFieldsInput } from '../fields.js';
import { issue, issuePath } from '../records.js';
import { issueOptions, priorityOptions, transitionOptions, userOptions } from './options.js';

export const updateIssue = defineAction({
  slug: 'updateIssue',
  description:
    'Update fields on a Jira issue, and optionally move it through a workflow transition first. Returns the updated issue.',
  input: z.object({
    issueKey,
    transitionId: z
      .string()
      .optional()
      .meta({ label: 'Status', description: 'A workflow transition id to run first.' }),
    issueTypeId: z.string().optional().meta({ label: 'Issue type' }),
    ...issueFieldsInput,
  }),
  output: issue,
  idempotent: true,
  options: {
    issueKey: issueOptions,
    transitionId: transitionOptions,
    assignee: userOptions,
    priority: priorityOptions,
  },
  async run({ client, input, req }) {
    const path = issuePath(input.issueKey);

    if (input.transitionId) {
      await client.request(z.unknown(), {
        method: 'POST',
        path: `${path}/transitions`,
        body: { transition: { id: input.transitionId } },
        signal: signal(req),
      });
    }

    const fields = {
      ...(input.issueTypeId ? { issuetype: { id: input.issueTypeId } } : {}),
      ...issueFields(input),
    };

    if (Object.keys(fields).length === 0) {
      return client.request(issue, { path, signal: signal(req) });
    }

    return client.request(issue, {
      method: 'PUT',
      path,
      query: { returnIssue: true },
      body: { fields },
      signal: signal(req),
    });
  },
});
