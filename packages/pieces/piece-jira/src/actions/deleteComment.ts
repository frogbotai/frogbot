import { z } from 'zod';

import { signal } from '../client.js';
import { identifier, issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { issuePath, success } from '../records.js';
import { commentOptions, issueOptions } from './options.js';

export const deleteComment = defineAction({
  slug: 'deleteComment',
  description: 'Permanently delete a comment from a Jira issue.',
  input: z.object({ issueKey, commentId: identifier.meta({ label: 'Comment' }) }),
  output: success,
  idempotent: true,
  options: { issueKey: issueOptions, commentId: commentOptions },
  async run({ client, input, req }) {
    await client.request(z.unknown(), {
      method: 'DELETE',
      path: issuePath(input.issueKey, `/comment/${encodeURIComponent(input.commentId)}`),
      signal: signal(req),
    });

    return { success: true as const };
  },
});
