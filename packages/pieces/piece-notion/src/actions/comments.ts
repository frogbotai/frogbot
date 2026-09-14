import { z } from 'zod';

import { notionId } from '../config.js';
import { defineNotionAction } from '../definitions.js';
import { notionComment } from '../schemas.js';

export const addComment = defineNotionAction({
  slug: 'addComment',
  description: 'Add a comment to a page.',
  input: z.object({ pageId: notionId, commentText: z.string().min(1) }),
  output: notionComment,
  idempotent: false,
  async run({ client, input, req }) {
    const result = await client.request({
      method: 'POST',
      path: '/comments',
      body: {
        parent: { page_id: input.pageId },
        rich_text: [{ text: { content: input.commentText } }],
      },
      signal: req.signal ?? undefined,
    });

    return notionComment.parse(result);
  },
});
