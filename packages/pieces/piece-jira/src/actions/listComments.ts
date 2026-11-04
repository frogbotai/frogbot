import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { comment, issuePath } from '../records.js';
import { issueOptions } from './options.js';

export const listComments = defineAction({
  slug: 'listComments',
  description: "List a Jira issue's comments, with ADF and rendered HTML bodies.",
  input: z.object({
    issueKey,
    orderBy: z.enum(['-created', '+created']).default('-created'),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  output: z
    .object({
      comments: z.array(comment),
      startAt: z.number(),
      maxResults: z.number(),
      total: z.number(),
    })
    .passthrough(),
  idempotent: true,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    return client.request(
      z
        .object({
          comments: z.array(comment),
          startAt: z.number(),
          maxResults: z.number(),
          total: z.number(),
        })
        .passthrough(),
      {
        path: issuePath(input.issueKey, '/comment'),
        query: { orderBy: input.orderBy, maxResults: input.limit, expand: 'renderedBody' },
        signal: signal(req),
      },
    );
  },
});
