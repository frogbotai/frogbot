import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { issuePath, user } from '../records.js';
import { issueOptions } from './options.js';

const item = z
  .object({
    id: z.string(),
    author: user.optional(),
    comment: z.unknown().optional(),
    started: z.string().optional(),
    timeSpentSeconds: z.number().optional(),
  })
  .passthrough();

export const listWorklogs = defineAction({
  slug: 'listWorklogs',
  description: "List one page of an issue's worklogs.",
  input: z.object({ issueKey, ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: issuePath(input.issueKey, '/worklog'),
      key: 'worklogs',
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
