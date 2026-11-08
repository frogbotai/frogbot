import { getPath, toCellData } from '../cells.js';

/** One group from `POST /api/<slug>/aggregate` with a `count` value. */
export type GroupCountRow = {
  group: Record<string, unknown>;
  values: { count?: number };
};

/** A stable key for a group value, so `2` and `'2'` and two related collections never collide. */
export function getGroupKey(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    const relationship = value as { id?: unknown; relationTo?: unknown; value?: unknown };
    if (relationship.relationTo && relationship.value !== undefined) {
      const relatedValue = relationship.value;
      const id =
        relatedValue && typeof relatedValue === 'object'
          ? (relatedValue as { id?: unknown }).id
          : relatedValue;

      return `relationship:${String(relationship.relationTo)}:${getGroupKey(id)}`;
    }

    if (relationship.id !== undefined) return `relationship:${getGroupKey(relationship.id)}`;
  }

  return `${typeof value}:${String(value)}`;
}

/** The key of the group a stored value lands in; `''` is the "No value" group. */
export function getGroupValueKey(value: unknown): string {
  const cell = toCellData(value);

  return cell === null || cell === undefined ? '' : getGroupKey(cell);
}

/** The view's `where` narrowed to one group; no value matches records without one. */
export function buildGroupWhere(
  where: unknown,
  groupBy: string,
  value: unknown,
): Record<string, unknown> {
  const group = {
    [groupBy]: value === null || value === undefined ? { exists: false } : { equals: value },
  };

  return where && typeof where === 'object' && Object.keys(where).length > 0
    ? { and: [where, group] }
    : group;
}

/** Maps aggregate rows to each group's count, keyed by `getGroupValueKey`. */
export function toGroupCounts(rows: GroupCountRow[], groupBy: string): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const { group, values } of rows) {
    const value = Object.prototype.hasOwnProperty.call(group, groupBy)
      ? group[groupBy]
      : getPath(group, groupBy);

    const key = getGroupValueKey(value);

    counts[key] = (counts[key] ?? 0) + (values.count ?? 0);
  }

  return counts;
}

/** Adds `delta` to one group's count, never below zero. */
export function adjustGroupCount(
  counts: Record<string, number>,
  key: string,
  delta: number,
): Record<string, number> {
  return { ...counts, [key]: Math.max(0, (counts[key] ?? 0) + delta) };
}
