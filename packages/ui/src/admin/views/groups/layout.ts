import { getGroupKey } from './keys.js';
import type { ResolvedGroup } from './resolve.js';

/** A group as a list shows it: the resolved group plus its true count. */
export type CountedGroup = ResolvedGroup & { count: number };

/**
 * Orders, counts and pages a list's groups. Fixed groups (options) all show, empty ones with 0;
 * other groups show only with records and are paged by the list's page size, as Payload pages
 * its groups. "No value" comes last, when it has records. A descending `groupBy` reverses the
 * values.
 */
export function layoutGroups({
  counts,
  descending,
  fixed,
  groups,
  limit,
  noValueLabel,
  page,
}: {
  counts: Record<string, number>;
  descending: boolean;
  fixed: boolean;
  groups: ResolvedGroup[];
  limit: number;
  noValueLabel: string;
  page: number;
}): { groups: CountedGroup[]; totalPages: number } {
  const counted = groups
    .map((group) => ({ ...group, count: counts[group.key] ?? 0 }))
    .filter((group) => fixed || group.count > 0);

  if (descending) counted.reverse();

  const empty = counts[''] ?? 0;
  if (empty > 0) {
    counted.push({ count: empty, key: getGroupKey(null), label: noValueLabel, value: null });
  }

  if (fixed || limit <= 0) return { groups: counted, totalPages: 1 };

  const start = (Math.max(page, 1) - 1) * limit;

  return {
    groups: counted.slice(start, start + limit),
    totalPages: Math.max(1, Math.ceil(counted.length / limit)),
  };
}

/** Adds or removes one key from a list of collapsed group keys, dropping anything malformed. */
export function toggleCollapsed(collapsed: unknown, key: string, on: boolean): string[] {
  const keys = Array.isArray(collapsed)
    ? collapsed.filter((item): item is string => typeof item === 'string' && item !== key)
    : [];

  return on ? [...keys, key] : keys;
}

function parseQueryByGroup(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * The page of one group from Payload's `queryByGroup` URL param, which Payload writes as JSON;
 * 1 when absent or invalid.
 */
export function getGroupPage(queryByGroup: unknown, key: string): number {
  const parsed = parseQueryByGroup(queryByGroup);
  const entry =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)[key] : undefined;

  const page = Number(
    entry && typeof entry === 'object' ? (entry as { page?: unknown }).page : undefined,
  );

  return Number.isInteger(page) && page > 0 ? page : 1;
}
