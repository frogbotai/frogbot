import type { AgentConfig } from 'frogbot';

import { findDeals, moveDeal } from '../tools/deals';

export const dealDesk: AgentConfig = {
  slug: 'deal-desk',
  model: 'smart',
  profile: { name: 'Deal Desk', avatar: '/deal-desk.png' },
  instructions: 'You help the Acme sales team keep its pipeline moving. Be brief.',
  tools: [findDeals, moveDeal],
  triggers: [
    {
      type: 'schedule',
      slug: 'monday-summary',
      schedule: { cron: '0 15 * * 1' },
      prompt: 'Summarize the deals closing in the next 14 days.',
    },
  ],
};
