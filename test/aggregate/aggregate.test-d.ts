import type { AggregateFieldPath, AggregateValue, FrogBotInstance } from 'frogbot';
import { expectTypeOf } from 'vitest';

import type { Deal } from './frogbot-types.js';
import { dealsSlug } from './shared.js';

declare const frogbot: FrogBotInstance;

const result = await frogbot.aggregate({
  collection: dealsSlug,
  groupBy: ['stage', { field: 'closedAt', by: 'month' }],
  values: {
    deals: { count: true },
    total: { sum: 'amount' },
    average: { avg: 'amount' },
    largest: { max: 'amount' },
    firstClosed: { min: 'closedAt' },
    deepest: { max: 'details.probability' },
  },
  overrideAccess: true,
});

expectTypeOf(result.groups[0].values).toEqualTypeOf<{
  deals: number;
  total: number;
  average: number | null;
  largest: number | null;
  firstClosed: string | null;
  deepest: number | string | null;
}>();

expectTypeOf(result.groups[0].group).toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(result.totalDocs).toEqualTypeOf<number>();
expectTypeOf(result.nextPage).toEqualTypeOf<number | null>();

expectTypeOf<keyof Deal & 'amount'>().toMatchTypeOf<AggregateFieldPath<typeof dealsSlug>>();
expectTypeOf<{ sum: 'amount' }>().toMatchTypeOf<AggregateValue<typeof dealsSlug>>();

await frogbot.aggregate({
  collection: dealsSlug,
  groupBy: 'stage',
  // @ts-expect-error count takes only true
  values: { deals: { count: false } },
});

await frogbot.aggregate({
  collection: dealsSlug,
  // @ts-expect-error hour is not a bucket
  groupBy: { field: 'closedAt', by: 'hour' },
  values: { deals: { count: true } },
});
