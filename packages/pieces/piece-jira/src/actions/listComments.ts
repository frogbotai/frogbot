import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { comment, issuePath } from '../records.js';
import { issueOptions } from './options.js';

export const listComments = defineAction({
  slug: 'listComments',
  description: "List one page of a Jira issue's comments, with ADF and rendered HTML bodies.",
  input: z.object({
    issueKey,
    orderBy: z.enum(['-created', '+created']).default('-created'),
    ...pageInput,
  }),
  output: listOutput(comment),
  idempotent: true,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    return offsetPage(client, comment, {
      path: issuePath(input.issueKey, '/comment'),
      key: 'comments',
      query: { orderBy: input.orderBy, expand: 'renderedBody' },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
