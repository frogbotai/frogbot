const DAY = 24 * 60 * 60 * 1000;

/** The UTC midnight that starts `today`'s date. */
export function startOfDay(today: Date): number {
  return Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
}

/** An ISO date `days` after `today`, at `hour`:`minute` UTC (noon by default, for dates without a time). */
export function at(today: Date, days: number, hour = 12, minute = 0): string {
  return new Date(
    startOfDay(today) + days * DAY + (hour * 60 + minute) * 60 * 1000,
  ).toISOString();
}
