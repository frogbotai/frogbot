import { getGroupKey } from './keys.js';
import type { ResolvedGroup } from './resolve.js';

/** A group as a list lays it out: the resolved group, and whether it shows with no records. */
export type LaidOutGroup = ResolvedGroup & { keepEmpty: boolean };

/** A group with its true count, as the list shows it. */
export type CountedGroup = LaidOutGroup & { count: number };

/**
 * Orders and pages a list's groups before they are counted. Fixed groups (options) all show, empty
 * ones too; stored values that are no longer options follow them. Other groups are the values
 * present, paged by the list's page size as Payload pages its groups. "No value" comes last when
 * it has records. A descending `groupBy` reverses the values.
 */
export function layoutGroups({
  descending,
  fixed,
  groups,
  limit,
  noValueLabel,
  page,
  strays = [],
}: {
  descending: boolean;
  fixed: boolean;
  groups: ResolvedGroup[];
  limit: number;
  /** The "No value" label when records have no value, otherwise `undefined`. */
  noValueLabel?: string;
  page: number;
  strays?: ResolvedGroup[];
}): { groups: LaidOutGroup[]; totalPages: number } {
  const ordered: LaidOutGroup[] = groups.map((group) => ({ ...group, keepEmpty: fixed }));

  if (descending) ordered.reverse();

  ordered.push(...strays.map((group) => ({ ...group, keepEmpty: false })));

  if (noValueLabel !== undefined) {
    ordered.push({ key: getGroupKey(null), keepEmpty: false, label: noValueLabel, value: null });
  }

  if (fixed || limit <= 0) return { groups: ordered, totalPages: 1 };

  const start = (Math.max(page, 1) - 1) * limit;

  return {
    groups: ordered.slice(start, start + limit),
    totalPages: Math.max(1, Math.ceil(ordered.length / limit)),
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
