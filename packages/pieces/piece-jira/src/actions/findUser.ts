import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { user } from '../records.js';

export const findUser = defineAction({
  slug: 'findUser',
  description:
    'Find Jira users whose name or email matches a keyword, to get the accountId other actions take.',
  input: z.object({ keyword: z.string().trim().min(1) }),
  output: z.object({ found: z.boolean(), data: z.array(user) }),
  idempotent: true,
  async run({ client, input, req }) {
    const data = await client.request(z.array(user), {
      path: '/user/search',
      query: { query: input.keyword },
      signal: signal(req),
    });

    return { found: data.length > 0, data };
  },
});
