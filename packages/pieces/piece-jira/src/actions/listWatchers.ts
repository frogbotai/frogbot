import { z } from 'zod';

import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, pageInput, slicePage } from '../pagination.js';
import { issuePath, user } from '../records.js';
import { issueOptions } from './options.js';

export const listWatchers = defineAction({
  slug: 'listWatchers',
  description:
    "List one page of an issue's watchers. Jira returns them whole, so the cursor is an offset into that list.",
  input: z.object({ issueKey, ...pageInput }),
  output: listOutput(user),
  idempotent: true,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    const result = await client.request(z.object({ watchers: z.array(user) }), {
      path: issuePath(input.issueKey, '/watchers'),
      signal: signal(req),
    });

    return slicePage(result.watchers, input);
  },
});
