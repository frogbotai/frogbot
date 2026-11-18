import type { AgentConfig } from 'frogbot';

import { cancelJob, findJobs } from '../tools/jobs';

export const foreman: AgentConfig = {
  slug: 'foreman',
  model: 'smart',
  profile: { name: 'Foreman', avatar: '/foreman.png' },
  instructions: 'You run the schedule for Mow Money. Be brief.',
  tools: [findJobs, cancelJob],
};
