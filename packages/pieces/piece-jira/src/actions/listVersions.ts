import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { listOutput, offsetPage, pageInput } from '../pagination.js';
import { projectOptions } from './options.js';

const item = z
  .object({
    id: z.string(),
    name: z.string(),
    released: z.boolean().optional(),
    archived: z.boolean().optional(),
    releaseDate: z.string().optional(),
    startDate: z.string().optional(),
  })
  .passthrough();

export const listVersions = defineAction({
  slug: 'listVersions',
  description: "List one page of a project's versions (releases).",
  input: z.object({ projectId: identifier, ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { projectId: projectOptions },
  async run({ client, input, req }) {
    return offsetPage(client, item, {
      path: `/project/${encodeURIComponent(input.projectId)}/version`,
      key: 'values',
      limit: input.limit,
      cursor: input.cursor,
      signal: signal(req),
    });
  },
});
