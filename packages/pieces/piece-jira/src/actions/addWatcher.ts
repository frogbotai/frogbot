import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issuePath, success } from '../records.js';
import { issueOptions, userOptions } from './options.js';

export const addWatcher = defineAction({
  slug: 'addWatcher',
  description: 'Add a user as a watcher of a Jira issue, so they get its notifications.',
  input: z.object({
    issueKey,
    accountId: z.string().trim().min(1).meta({ label: 'User' }),
  }),
  output: success,
  idempotent: true,
  options: { issueKey: issueOptions, accountId: userOptions },
  async run({ client, input, req }) {
    await client.request(z.unknown(), {
      method: 'POST',
      path: issuePath(input.issueKey, '/watchers'),
      body: input.accountId,
      signal: signal(req),
    });

    return { success: true as const };
  },
});
