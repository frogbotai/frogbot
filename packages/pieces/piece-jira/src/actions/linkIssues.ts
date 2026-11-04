import { z } from 'zod';

import { signal } from '../client.js';
import { identifier, issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issueRef, success } from '../records.js';
import { issueOptions, linkTypeOptions } from './options.js';

export const linkIssues = defineAction({
  slug: 'linkIssues',
  description:
    'Link two Jira issues with a link type such as Blocks. The first issue takes the outward role: it blocks the second.',
  input: z.object({
    firstIssueKey: issueKey,
    linkTypeId: identifier.meta({ label: 'Link type' }),
    secondIssueKey: issueKey,
  }),
  output: success,
  idempotent: false,
  options: {
    firstIssueKey: issueOptions,
    linkTypeId: linkTypeOptions,
    secondIssueKey: issueOptions,
  },
  async run({ client, input, req }) {
    await client.request(z.unknown(), {
      method: 'POST',
      path: '/issueLink',
      body: {
        type: { id: input.linkTypeId },
        outwardIssue: issueRef(input.firstIssueKey),
        inwardIssue: issueRef(input.secondIssueKey),
      },
      signal: signal(req),
    });

    return { success: true as const };
  },
});
