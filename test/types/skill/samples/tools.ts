import type { AgentConfig, FrogbotConfig, Tool } from 'frogbot';
import { todoTools } from 'frogbot/tools';
import { z } from 'zod';

const inputSchema = z.object({
  projectId: z.string(),
});

export const getProjectStatus: Tool<typeof inputSchema, { status: string }> = {
  slug: 'get_project_status',
  description: 'Return the current status of a project.',
  inputSchema,
  async execute({ projectId }, { frogbot, req }) {
    const project = await frogbot.findByID({
      collection: 'projects',
      id: projectId,
      req,
      overrideAccess: false,
    });

    if (typeof project.status !== 'string') {
      throw new Error('Project status must be a string.');
    }

    return { status: project.status };
  },
};

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Report project status from the available tools.',
  tools: [getProjectStatus],
};

export const tools: FrogbotConfig['tools'] = [getProjectStatus];
export const agents: FrogbotConfig['agents'] = [assistant];

export const builtInTools: FrogbotConfig['tools'] = [...todoTools];
