import { z } from 'zod';

import { signal } from '../client.js';
import { identifier } from '../config.js';
import { defineAction } from '../define.js';
import { attachment } from '../records.js';

export const getAttachment = defineAction({
  slug: 'getAttachment',
  description:
    "Get a Jira attachment's metadata: name, type, size, author and content URL. downloadAttachment saves the file itself.",
  input: z.object({ attachmentId: identifier }),
  output: attachment,
  idempotent: true,
  async run({ client, input, req }) {
    return client.request(attachment, {
      path: `/attachment/${encodeURIComponent(input.attachmentId)}`,
      signal: signal(req),
    });
  },
});
