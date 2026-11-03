import type { AggregateAdapter } from 'frogbot/aggregate';

import { aggregate } from './aggregate.js';

export const mongooseAggregateAdapter: AggregateAdapter = { aggregate };
