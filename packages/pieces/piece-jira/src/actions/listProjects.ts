import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { user } from '../records.js';

const item = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    projectTypeKey: z.string().optional(),
    description: z.string().optional(),
    lead: user.optional(),
  })
  .passthrough();

export const listProjects = defineAction({
  slug: 'listProjects',
  description:
    'List one page of the Jira projects the account can see, with their lead and description.',
  input: z.object({ ...pageInput }),
  output: listOutput(item),
  idempotent: true,

  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/project/search',
      key: 'values',
      query: { expand: 'description,lead' },
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
