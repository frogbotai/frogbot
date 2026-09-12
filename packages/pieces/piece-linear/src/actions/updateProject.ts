import { type PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { Linear } from '../client.js';
import { teamId } from '../config.js';
import { projects, teams } from './options.js';

const inputSchema = z.object({
  teamId,
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  statusId: z.string().optional(),
});
const output = z.object({ success: z.boolean(), lastSyncId: z.number().optional() }).passthrough();

export const updateProject = {
  slug: 'updateProject',
  description: 'Update an existing Linear project.',
  input: inputSchema,
  output,
  idempotent: true,
  options: { teamId: teams, projectId: projects },
  async run({ client, input }: PieceRunArgs<z.output<typeof inputSchema>, object, Linear>) {
    const { teamId, projectId, ...fields } = input;
    const response = await client.updateProject(projectId, { teamIds: [teamId], ...fields });
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      project: { id: response.projectId },
    };
  },
};
