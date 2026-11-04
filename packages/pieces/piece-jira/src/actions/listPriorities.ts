import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';

const item = z
  .object({ id: z.string(), name: z.string(), description: z.string().optional() })
  .passthrough();

export const listPriorities = defineAction({
  slug: 'listPriorities',
  description: 'List one page of issue priorities.',
  input: z.object({ ...pageInput }),
  output: listOutput(item),
  idempotent: true,

  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/priority/search',
      key: 'values',
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
