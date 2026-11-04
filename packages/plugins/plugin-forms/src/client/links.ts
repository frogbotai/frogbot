import { formatDuration } from '../links/duration.js';

const HOUR = 3600;
const DAY = 24 * HOUR;
const PRESETS = [HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY, 90 * DAY];

/** The lengths the link dialog offers: presets up to the maximum, the default and the maximum. */
export function expiryChoices(
  defaultExpiry: number,
  maxExpiry: number,
): { seconds: number; label: string }[] {
  const lengths = new Set([
    ...PRESETS.filter((seconds) => seconds <= maxExpiry),
    defaultExpiry,
    maxExpiry,
  ]);

  return [...lengths]
    .sort((a, b) => a - b)
    .map((seconds) => ({
      seconds,
      label: `${formatDuration(seconds)}${seconds === defaultExpiry ? ' (default)' : ''}`,
    }));
}

/** The `form-links` list, filtered to one record's links. */
export function linksListPath(collection: string, id: number | string): `/${string}` {
  const query = new URLSearchParams({
    'where[and][0][collection][equals]': collection,
    'where[and][1][recordId][equals]': String(id),
  });

  return `/collections/form-links?${query.toString()}`;
}
