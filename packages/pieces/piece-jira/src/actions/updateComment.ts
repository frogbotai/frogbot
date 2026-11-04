import { z } from 'zod';

import { richText, toAdf } from '../adf.js';
import { signal } from '../client.js';
import { identifier, issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { comment, issuePath } from '../records.js';
import { commentOptions, issueOptions } from './options.js';

export const updateComment = defineAction({
  slug: 'updateComment',
  description: "Replace a Jira comment's body. The body takes markdown or ADF.",
  input: z.object({ issueKey, commentId: identifier.meta({ label: 'Comment' }), body: richText }),
  output: comment,
  idempotent: true,
  options: { issueKey: issueOptions, commentId: commentOptions },
  async run({ client, input, req }) {
    return client.request(comment, {
      method: 'PUT',
      path: issuePath(input.issueKey, `/comment/${encodeURIComponent(input.commentId)}`),
      body: { body: toAdf(input.body) },
      signal: signal(req),
    });
  },
});
