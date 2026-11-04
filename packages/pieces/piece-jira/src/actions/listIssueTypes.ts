import { z } from 'zod';

import { signal } from '../client.js';
import { defineAction } from '../define.js';
import { listOutput, pageInput, slicePage } from '../pagination.js';
import { projectOptions } from './options.js';

const item = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    subtask: z.boolean().optional(),
    hierarchyLevel: z.number().optional(),
    scope: z.unknown().optional(),
  })
  .passthrough();

export const listIssueTypes = defineAction({
  slug: 'listIssueTypes',
  description:
    "List one page of issue types, all of them or one project's. Jira returns them whole, so the cursor is an offset into that list.",
  input: z.object({ projectId: z.string().optional(), ...pageInput }),
  output: listOutput(item),
  idempotent: true,
  options: { projectId: projectOptions },
  async run({ client, input, req }) {
    const types = await client.request(z.array(item), {
      path: input.projectId ? '/issuetype/project' : '/issuetype',
      query: { projectId: input.projectId },
      signal: signal(req),
    });

    return slicePage(types, input);
  },
});
