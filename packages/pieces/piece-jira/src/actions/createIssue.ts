import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { issueFields, issueFieldsInput } from '../fields.js';
import { issue, issuePath } from '../records.js';
import { issueTypeOptions, priorityOptions, projectOptions, userOptions } from './options.js';

export const createIssue = defineAction({
  slug: 'createIssue',
  description:
    'Create a Jira issue in a project. The description takes markdown or ADF. Returns the new issue.',
  input: z.object({
    projectId: identifier.meta({ label: 'Project', description: 'The project id or key.' }),
    issueTypeId: identifier.meta({ label: 'Issue type', description: 'The issue type id.' }),
    ...issueFieldsInput,
    summary: z.string().trim().min(1),
  }),
  output: issue,
  idempotent: false,
  options: {
    projectId: projectOptions,
    issueTypeId: issueTypeOptions,
    assignee: userOptions,
    priority: priorityOptions,
  },
  async run({ client, input, req }) {
    const created = await client.request(z.object({ id: z.string() }), {
      method: 'POST',
      path: '/issue',
      body: {
        fields: {
          project: /^\d+$/.test(input.projectId)
            ? { id: input.projectId }
            : { key: input.projectId },
          issuetype: { id: input.issueTypeId },
          ...issueFields(input),
        },
      },
      signal: signal(req),
    });

    return client.request(issue, { path: issuePath(created.id), signal: signal(req) });
  },
});
