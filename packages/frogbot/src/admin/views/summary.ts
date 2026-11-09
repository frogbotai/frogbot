import type { Payload, SanitizedCollectionConfig } from 'payload';

import { resolveAggregateField } from '../../aggregate/resolveField.js';

/** A list column's footer total. Dates read `min` and `max` as Earliest and Latest. */
export type SummaryOperation = 'avg' | 'count' | 'max' | 'min' | 'sum';

/** What a column holds, for its summary: numbers total, dates have extremes, the rest count. */
export type SummaryKind = 'date' | 'number' | 'other';

export const SUMMARY_OPERATIONS: Record<SummaryKind, readonly SummaryOperation[]> = {
  number: ['count', 'sum', 'avg', 'min', 'max'],
  date: ['count', 'min', 'max'],
  other: ['count'],
};

/**
 * The summary kind of a list column, or `undefined` when the aggregate would refuse it: an unknown
 * path, a hidden field, or one with its own `access.read`.
 */
export function getSummaryKind({
  collection,
  path,
  payload,
}: {
  collection: SanitizedCollectionConfig;
  path: string;
  payload: Payload;
}): SummaryKind | undefined {
  const resolved = resolveAggregateField({ collection, path, payload });

  if (!resolved || resolved.hidden || resolved.readGuarded) return undefined;

  if (resolved.hops.length || resolved.many) return 'other';

  return resolved.type === 'number' || resolved.type === 'date' ? resolved.type : 'other';
}
