import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, pageInput, tokenPage } from '../pagination.js';
import { changeHistory } from '../records.js';

const item = z
  .object({ issueId: z.string(), changeHistories: z.array(changeHistory) })
  .passthrough();

export const listChangelogs = defineAction({
  slug: 'listChangelogs',
  description:
    'List one page of change history for up to 1,000 issues at once: who changed which field, from what to what, and when.',
  input: z.object({
    issueKeys: z.array(z.string().trim().min(1)).min(1).max(1000),
    fieldIds: z
      .array(z.string())
      .max(10)
      .optional()
      .meta({ description: 'Only changes to these fields, such as status or assignee.' }),
    ...pageInput,
  }),
  output: listOutput(item),
  idempotent: true,
  async run({ client, input, req }) {
    return tokenPage(client, item, {
      path: '/changelog/bulkfetch',
      key: 'issueChangeLogs',
      body: {
        issueIdsOrKeys: input.issueKeys,
        ...(input.fieldIds ? { fieldIds: input.fieldIds } : {}),
      },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
