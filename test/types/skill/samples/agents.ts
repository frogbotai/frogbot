import type { AgentConfig, FrogbotConfig, SkillConfig, Tool } from 'frogbot';
import { buildConfig, getFrogbot } from 'frogbot';
import { general } from 'frogbot/agents';
import { z } from 'zod';

import { ai } from './ai.js';
import { domainConfig } from './domain-context.js';

export const assistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'You are a concise and friendly assistant.',
};

export const agents: FrogbotConfig['agents'] = [general(), assistant];

const config = buildConfig({ ...domainConfig, ai, agents });

export async function runAgent() {
  const frogbot = await getFrogbot({ config });
  const result = await frogbot.agents.assistant.generate({
    prompt: "Summarize today's open tasks.",
  });

  console.log(result.text);

  return result;
}

const searchInput = z.object({ query: z.string() });

const searchProjects: Tool<typeof searchInput> = {
  slug: 'search_projects',
  description: 'Search projects by title.',
  inputSchema: searchInput,
  async execute({ query }, { frogbot, req }) {
    const projects = await frogbot.find({
      collection: 'projects',
      where: { title: { contains: query } },
      req,
      overrideAccess: false,
    });

    return projects.docs;
  },
};

export const toolAssistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Answer with the available project data.',
  tools: [searchProjects],
  inheritTools: false,
};

const supportPolicy: SkillConfig = {
  slug: 'support-policy',
  description: 'Customer support policy',
  instructions: 'Apply the support policy before proposing a resolution.',
  resources: [
    {
      path: 'refunds.md',
      description: 'Refund rules',
      content: 'Refunds require an order number and a verified customer email.',
    },
  ],
};

export const skillAssistant: AgentConfig = {
  slug: 'assistant',
  instructions: 'Help customers resolve support requests.',
  skills: [supportPolicy],
};
