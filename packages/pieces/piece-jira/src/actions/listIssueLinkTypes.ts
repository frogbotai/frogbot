import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, pageInput, slicePage } from '../pagination.js';

const item = z
  .object({ id: z.string(), name: z.string(), inward: z.string(), outward: z.string() })
  .passthrough();

export const listIssueLinkTypes = defineAction({
  slug: 'listIssueLinkTypes',
  description:
    'List one page of issue link types, such as Blocks. Jira returns them whole, so the cursor is an offset into that list.',
  input: z.object(pageInput),
  output: listOutput(item),
  idempotent: true,
  async run({ client, input, req }) {
    const result = await client.request(z.object({ issueLinkTypes: z.array(item) }), {
      path: '/issueLinkType',
      signal: signal(req),
    });

    return slicePage(result.issueLinkTypes, input);
  },
});
