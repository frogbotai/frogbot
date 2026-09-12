import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';
import { teamId } from '../config.js';
import { teamOptions, teams } from './options.js';

const inputSchema = z.object({ teamId, issueId: z.string(), body: z.string() });
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const createComment = {
  slug: 'createComment',
  description: 'Create a comment on a Linear issue.',
  input: inputSchema,
  output,
  idempotent: false,
  options: { teamId: teams, issueId: teamOptions('issues') },
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    const response = await client.createComment({ issueId: input.issueId, body: input.body });
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      comment: { id: response.commentId },
    };
  },
};
