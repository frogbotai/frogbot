import type { AgentConfig } from 'frogbot';

export const foreman: AgentConfig = {
  slug: 'foreman',
  model: 'smart',
  profile: { name: 'Foreman', avatar: '/foreman.png' },
  instructions: 'You run the schedule for Mow Money. Be brief.',
};
