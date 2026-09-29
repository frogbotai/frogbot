import { z } from 'zod';

import { teamId } from '../config.js';
import { defineAction } from '../define.js';
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

export const createProject = defineAction({
  slug: 'createProject',
  description: 'Create a project in a Linear team.',
  input: inputSchema,
  output,
  idempotent: false,
  options: { teamId: teams },
  async run({ client, input }) {
    const { teamId, ...fields } = input;
    const response = await client.createProject({ teamIds: [teamId], ...fields });
    return {
      success: response.success,
      lastSyncId: response.lastSyncId,
      project: { id: response.projectId },
    };
  },
});
