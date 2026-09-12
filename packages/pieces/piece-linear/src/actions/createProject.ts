import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';
import { teamId } from '../config.js';
import { teams } from './options.js';

const inputSchema = z.object({
  teamId,
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  statusId: z.string().optional(),
});
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const createProject = {
  slug: 'createProject',
  description: 'Create a project in a Linear team.',
  input: inputSchema,
  output,
  idempotent: false,
  options: { teamId: teams },
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    const { teamId, ...fields } = input;
    const response = await client.createProject({ teamIds: [teamId], ...fields });
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      project: { id: response.projectId },
    };
  },
};
