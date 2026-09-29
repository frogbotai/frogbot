import { z } from 'zod';

import { teamId } from '../config.js';
import { defineAction } from '../define.js';
import { teamOptions, teams } from './options.js';

const inputSchema = z.object({ teamId, issueId: z.string(), body: z.string() });
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const createComment = defineAction({
  slug: 'createComment',
  description: 'Create a comment on a Linear issue.',
  input: inputSchema,
  output,
  idempotent: false,
  options: { teamId: teams, issueId: teamOptions('issues') },
  async run({ client, input }) {
    const response = await client.createComment({ issueId: input.issueId, body: input.body });
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      comment: { id: response.commentId },
    };
  },
});
