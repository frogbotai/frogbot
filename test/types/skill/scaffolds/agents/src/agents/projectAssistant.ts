// src/agents/projectAssistant.ts
import type { AgentConfig, Tool } from 'frogbot';
import { z } from 'zod';

const searchInput = z.object({ query: z.string() });

export const searchProjects: Tool<typeof searchInput> = {
  slug: 'search_projects',
  description: 'Search projects by title.',
  inputSchema: searchInput,
  access: ({ req }) => Boolean(req.user),
  async execute({ query }, { frogbot, req, overrideAccess }) {
    const projects = await frogbot.find({
      collection: 'projects',
      where: { title: { contains: query } },
      req,
      overrideAccess,
    });

    return projects.docs;
  },
};

export const projectAssistant: AgentConfig = {
  slug: 'project-assistant',
  instructions: 'Answer questions about projects. Search before you answer.',
  tools: [searchProjects],
  inheritTools: false,
};
