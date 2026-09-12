import { type PieceActionDefinition, type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';
import { teamId } from '../config.js';
import { priorities, teamOptions, teams, users } from './options.js';

const inputSchema = z.object({
  teamId,
  title: z.string(),
  description: z.string().optional(),
  stateId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  templateId: z.string().optional(),
});
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const createIssue = {
  slug: 'createIssue',
  description: 'Create an issue in a Linear team.',
  input: inputSchema,
  output,
  idempotent: false,
  options: {
    teamId: teams,
    stateId: teamOptions('workflowStates'),
    labelIds: teamOptions('issueLabels'),
    assigneeId: users,
    priority: priorities,
  },
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    const response = await client.createIssue(input);
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      issue: { id: response.issueId },
    };
  },
} satisfies PieceActionDefinition<typeof inputSchema, typeof output, object, Linear>;
