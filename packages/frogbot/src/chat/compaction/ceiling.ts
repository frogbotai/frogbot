const RESERVE_MIN = 16_000;

/**
 * The largest prompt the model takes while leaving room for its reply: the window less `buffer`,
 * or less 10% of it or `RESERVE_MIN`, whichever is more. A window too small to give up
 * `RESERVE_MIN` keeps 10%. An unknown window has no ceiling.
 */
export function compactionCeiling({
  window,
  buffer,
}: {
  window: number | undefined;
  buffer?: number;
}): number | undefined {
  if (window === undefined || window <= 0) return undefined;

  if (buffer !== undefined) return window - buffer;

  return window - Math.max(Math.floor(window * 0.1), window >= 2 * RESERVE_MIN ? RESERVE_MIN : 0);
}
