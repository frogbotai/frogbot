import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';

const item = z
  .object({
    id: z.number(),
    name: z.string(),
    state: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    completeDate: z.string().optional(),
    goal: z.string().optional(),
    originBoardId: z.number().optional(),
  })
  .passthrough();

export const listSprints = defineAction({
  slug: 'listSprints',
  description: "List one page of a board's sprints, optionally by state.",
  input: z.object({
    boardId: z.number().int().positive(),
    state: z.array(z.enum(['future', 'active', 'closed'])).optional(),
    ...pageInput,
  }),
  output: listOutput(item),
  idempotent: true,

  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: `/board/${input.boardId}/sprint`,
      api: 'agile',
      key: 'values',
      query: { state: input.state?.join(',') },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
