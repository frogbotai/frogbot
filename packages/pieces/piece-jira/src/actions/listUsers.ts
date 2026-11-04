import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { user } from '../records.js';

const item = user;

export const listUsers = defineAction({
  slug: 'listUsers',
  description: 'List one page of the users on the Jira site, people and apps.',
  input: z.object({ ...pageInput }),
  output: listOutput(item),
  idempotent: true,

  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: '/users/search',

      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
