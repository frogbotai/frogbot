import { z } from 'zod';

import { richText, toAdf } from '../adf.js';
import { signal } from '../client.js';
import { identifier, issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issue, issuePath } from '../records.js';
import { issueOptions, transitionOptions } from './options.js';

export const transitionIssue = defineAction({
  slug: 'transitionIssue',
  description:
    "Move a Jira issue to a new status through a workflow transition, with an optional comment. Fails when the transition isn't available from the current status.",
  input: z.object({
    issueKey,
    transitionId: identifier.meta({ label: 'Transition' }),
    comment: richText.optional(),
  }),
  output: z.object({ success: z.literal(true), issue }),
  idempotent: false,
  options: { issueKey: issueOptions, transitionId: transitionOptions },
  async run({ client, input, req }) {
    const path = issuePath(input.issueKey);

    await client.request(z.unknown(), {
      method: 'POST',
      path: `${path}/transitions`,
      body: {
        transition: { id: input.transitionId },
        ...(input.comment === undefined
          ? {}
          : { update: { comment: [{ add: { body: toAdf(input.comment) } }] } }),
      },
      signal: signal(req),
    });

    return {
      success: true as const,
      issue: await client.request(issue, { path, signal: signal(req) }),
    };
  },
});
