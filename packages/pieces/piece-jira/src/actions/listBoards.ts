import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { projectOptions } from './options.js';

const item = z
  .object({
    id: z.number(),
    name: z.string(),
    type: z.string().optional(),
    location: z
      .object({ projectId: z.number().optional(), projectKey: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const listBoards = defineAction({
  slug: 'listBoards',
  description: 'List one page of Jira Software boards, optionally for one project.',
  input: z.object({ projectId: z.string().optional(), ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { projectId: projectOptions },
  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/board',
      api: 'agile',
      key: 'values',
      query: { projectKeyOrId: input.projectId },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
