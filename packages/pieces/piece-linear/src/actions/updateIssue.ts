import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';
import { teamId } from '../config.js';
import { priorities, teamOptions, teams, users } from './options.js';

const inputSchema = z.object({
  teamId,
  issueId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  stateId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
});
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const updateIssue = {
  slug: 'updateIssue',
  description: 'Update an existing Linear issue.',
  input: inputSchema,
  output,
  idempotent: true,
  options: {
    teamId: teams,
    issueId: teamOptions('issues'),
    stateId: teamOptions('workflowStates'),
    labelIds: teamOptions('issueLabels'),
    assigneeId: users,
    priority: priorities,
  },
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    const { teamId: _, issueId, ...fields } = input;
    const response = await client.updateIssue(issueId, fields);
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      issue: { id: response.issueId },
    };
  },
};
