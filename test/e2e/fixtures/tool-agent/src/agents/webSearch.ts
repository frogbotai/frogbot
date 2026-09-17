import { createBraveSearch } from '@frogbotai/piece-brave-search';
import { createExa } from '@frogbotai/piece-exa';
import type { AgentConfig } from 'frogbot';

export const braveSearch = createBraveSearch({
  auth: { apiKey: process.env.BRAVE_API_KEY ?? 'e2e-build-placeholder' },
});
export const exa = createExa({
  auth: { apiKey: process.env.EXA_API_KEY ?? 'e2e-build-placeholder' },
});

export const braveSearchAgent: AgentConfig = {
  slug: 'brave-search',
  model: 'e2e',
  instructions:
    'Always call Brave Search. Answer with one result title and URL from the tool output.',
  tools: [braveSearch],
};

export const exaSearchAgent: AgentConfig = {
  slug: 'exa-search',
  model: 'e2e',
  instructions:
    'Always call Exa Search. Answer with one result title and URL from the tool output.',
  tools: [exa],
};
