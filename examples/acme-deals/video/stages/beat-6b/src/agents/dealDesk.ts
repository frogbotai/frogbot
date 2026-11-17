import type { AgentConfig } from 'frogbot';

import { findDeals, moveDeal } from '../tools/deals';

export const dealDesk: AgentConfig = {
  slug: 'deal-desk',
  model: 'smart',
  profile: { name: 'Deal Desk', avatar: '/deal-desk.png' },
  instructions: 'You help the Acme sales team keep its pipeline moving. Be brief.',
  tools: [findDeals, moveDeal],
};
