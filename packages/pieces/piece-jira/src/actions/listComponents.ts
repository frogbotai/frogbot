import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { user } from '../records.js';
import { projectOptions } from './options.js';

const item = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    lead: user.optional(),
  })
  .passthrough();

export const listComponents = defineAction({
  slug: 'listComponents',
  description: "List one page of a project's components.",
  input: z.object({ projectId: identifier, ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { projectId: projectOptions },
  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: `/project/${encodeURIComponent(input.projectId)}/component`,
      key: 'values',
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
