import { getPath, toCellData } from '../cells.js';
import { getBoardColumnKey } from './data.js';

/** One group from `POST /api/<slug>/aggregate` with a `count` value. */
export type BoardTotalsGroup = {
  group: Record<string, unknown>;
  values: { count?: number };
};

/** The board column key a stored group value lands in; `''` is Uncategorized. */
export function getBoardGroupKey(value: unknown): string {
  const cell = toCellData(value);

  return cell === null || cell === undefined ? '' : getBoardColumnKey(cell);
}

/** Maps aggregate groups to each column's total, keyed like the board's columns. */
export function toColumnTotals(
  groups: BoardTotalsGroup[],
  groupBy: string,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const { group, values } of groups) {
    const value = Object.prototype.hasOwnProperty.call(group, groupBy)
      ? group[groupBy]
      : getPath(group, groupBy);

    const key = getBoardGroupKey(value);

    totals[key] = (totals[key] ?? 0) + (values.count ?? 0);
  }

  return totals;
}

/** Adds `delta` to one column's total, never below zero. */
export function adjustColumnTotal(
  totals: Record<string, number>,
  key: string,
  delta: number,
): Record<string, number> {
  return { ...totals, [key]: Math.max(0, (totals[key] ?? 0) + delta) };
}
