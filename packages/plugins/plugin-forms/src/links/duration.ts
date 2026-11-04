const UNITS = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 } as const;

/** Seconds in a duration like `'7d'`, or `undefined` when it isn't one above 0. */
export function parseDuration(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return;

  const match = /^(\d+)([smhdw])$/.exec(value.trim());
  if (!match) return;

  const seconds = Number(match[1]) * UNITS[match[2] as keyof typeof UNITS];

  return seconds > 0 ? seconds : undefined;
}

/** A length in words, like `7 days` or `2 weeks`. */
export function formatDuration(seconds: number): string {
  for (const [size, name] of [
    [UNITS.w, 'week'],
    [UNITS.d, 'day'],
    [UNITS.h, 'hour'],
    [UNITS.m, 'minute'],
  ] as const) {
    if (seconds % size === 0) {
      const count = seconds / size;

      return `${count} ${name}${count === 1 ? '' : 's'}`;
    }
  }

  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}
