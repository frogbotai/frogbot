/** The date the QA seed arranges every record around, and the date every views spec opens. */
export const today = new Date('2026-06-15T12:00:00Z');

/** The calendar date of `today`, for a calendar's `?date=`. */
export const todayDate = '2026-06-15';

/** The display zone views specs run in. June is UTC-7 there. */
export const timezoneId = 'America/Los_Angeles';

const offsetHours = 7;

const DAY = 24 * 60 * 60 * 1000;

/** An ISO date `days` after `today` at `hour`:`minute` Los Angeles time. */
export function la(days: number, hour: number, minute = 0): string {
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  return new Date(
    midnight + days * DAY + ((hour + offsetHours) * 60 + minute) * 60 * 1000,
  ).toISOString();
}

/** `prefix` padded with a repeating phrase to exactly 200 characters. */
export function longTitle(prefix: string): string {
  return `${prefix} ${'and a much longer note that keeps on going '.repeat(6)}`.slice(0, 200);
}

/** Picks the item at `index` from `items`, wrapping around. */
export function cycle<T>(items: readonly T[], index: number): T {
  return items[index % items.length];
}
