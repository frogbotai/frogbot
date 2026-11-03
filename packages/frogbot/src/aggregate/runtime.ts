import type { Config } from 'payload';

import type { AggregateAdapter } from '../database/types.js';
import { AggregateCapabilityError } from './errors.js';

const aggregateAdapters = new WeakMap<object, AggregateAdapter>();

export function getAggregateAdapter(db: object, collection: string): AggregateAdapter {
  const adapter = aggregateAdapters.get(db);

  if (!adapter) throw new AggregateCapabilityError(collection);

  return adapter;
}

export function withAggregateRuntime({
  adapter,
  aggregate,
}: {
  adapter: Config['db'];
  aggregate?: AggregateAdapter;
}): Config['db'] {
  if (!aggregate) return adapter;

  return {
    ...adapter,
    init(args) {
      const db = adapter.init(args);

      aggregateAdapters.set(db, aggregate);

      return db;
    },
  };
}
