import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { projectOptions } from './options.js';

const item = z
  .object({
    id: z.string(),
    name: z.string(),
    statusCategory: z.string().optional(),
    scope: z.unknown().optional(),
  })
  .passthrough();

export const listStatuses = defineAction({
  slug: 'listStatuses',
  description: 'List one page of workflow statuses, optionally for one project.',
  input: z.object({ projectId: z.string().optional(), ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { projectId: projectOptions },
  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/statuses/search',
      key: 'values',
      query: { projectId: input.projectId },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
