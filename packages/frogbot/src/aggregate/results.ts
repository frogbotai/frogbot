import type { AdapterAggregateResult } from '../database/types.js';
import type { AggregateFieldType, AggregateResult, AggregateValueDescriptor } from './types.js';

function invalid(label: string): Error {
  return new Error(`[frogbot] ${label}: the database returned a value its field type can't hold.`);
}

function toNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;

  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(number)) throw invalid(label);

  return number;
}

function toISOString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;

  const date = value instanceof Date ? value : new Date(value as number | string);

  if (Number.isNaN(date.getTime())) throw invalid(label);

  return date.toISOString();
}

/** Turns a stored group key into its JSON value: numbers, booleans, ISO dates, IDs or strings. */
export function toGroupKey(value: unknown, type: AggregateFieldType, label: string): unknown {
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : Number(value) !== 0;
    case 'date':
      return toISOString(value, label);
    case 'number':
      return toNumber(value, label);
    case 'id':
      return typeof value === 'bigint' ? Number(value) : value;
    default:
      return String(value);
  }
}

/** Counts and sums are numbers (`0` when empty); averages, minimums and maximums are `null` when empty. */
export function toAggregateValue(
  value: unknown,
  descriptor: AggregateValueDescriptor,
  label: string,
): number | string | null {
  if (descriptor.operation === 'count' || descriptor.operation === 'sum') {
    return toNumber(value, label) ?? 0;
  }

  if (descriptor.operation !== 'avg' && descriptor.type === 'date') {
    return toISOString(value, label);
  }

  return toNumber(value, label);
}

export function getAggregatePage({
  groups,
  limit,
  page,
  totalDocs,
}: {
  groups: AggregateResult['groups'];
  limit: number | undefined;
  page: number;
  totalDocs: AdapterAggregateResult['totalDocs'];
}): AggregateResult {
  if (!limit) {
    return {
      groups,
      totalDocs: groups.length,
      totalPages: 1,
      page: 1,
      limit: 0,
      hasNextPage: false,
      hasPrevPage: false,
      nextPage: null,
      prevPage: null,
      pagingCounter: 1,
    };
  }

  const totalPages = Math.ceil(totalDocs / limit);
  const hasNextPage = totalPages > page;
  const hasPrevPage = page > 1;

  return {
    groups,
    totalDocs,
    totalPages,
    page,
    limit,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null,
    pagingCounter: (page - 1) * limit + 1,
  };
}

/** The one row of an aggregate without `groupBy` that matched nothing: counts and sums are `0`, as grouped sums are, and the rest and the `denied` values `null`. */
export function getEmptyTotals(
  values: { name: string; operation: AggregateValueDescriptor['operation'] }[],
  denied: ReadonlySet<string> = new Set(),
): AggregateResult['groups'][number] {
  return {
    group: {},
    values: Object.fromEntries(
      values.map(({ name, operation }) => [
        name,
        !denied.has(name) && (operation === 'count' || operation === 'sum') ? 0 : null,
      ]),
    ),
  };
}

export function getEmptyAggregate(limit: number | undefined): AggregateResult {
  return {
    groups: [],
    totalDocs: 0,
    totalPages: 0,
    page: 1,
    limit: limit ?? 0,
    hasNextPage: false,
    hasPrevPage: false,
    nextPage: null,
    prevPage: null,
    pagingCounter: 1,
  };
}
