import { z } from 'zod';

import { richText, toAdf } from '../adf.js';
import { signal } from '../client.js';
import { issueKey } from '../config.js';
import { defineAction } from '../define.js';
import { comment, issuePath } from '../records.js';
import { issueOptions } from './options.js';

export const addComment = defineAction({
  slug: 'addComment',
  description: 'Add a comment to a Jira issue. The body takes markdown or ADF.',
  input: z.object({ issueKey, body: richText }),
  output: comment,
  idempotent: false,
  options: { issueKey: issueOptions },
  async run({ client, input, req }) {
    return client.request(comment, {
      method: 'POST',
      path: issuePath(input.issueKey, '/comment'),
      body: { body: toAdf(input.body) },
      signal: signal(req),
    });
  },
});
