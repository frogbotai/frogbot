import { createHash, randomBytes } from 'node:crypto';

import type { FormLinkDuration, FormsLinksOptions } from '../types.js';
import { formatDuration, parseDuration } from './duration.js';

export const DEFAULT_EXPIRY = '7d';
export const DEFAULT_MAX_EXPIRY = '30d';

/** Link lengths in seconds. */
export type LinkLimits = { defaultExpiry: number; maxExpiry: number };

/** 32 random bytes, base64url. No prefix: a link is never a credential header. */
export function createLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The hex SHA-256 of a token: what `form-links` stores and looks links up by. */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function duration(value: FormLinkDuration | undefined, fallback: string, name: string): number {
  const seconds = parseDuration(value ?? fallback);

  if (seconds === undefined) {
    throw new Error(
      `[plugin-forms] formsPlugin({ links: { ${name} } }) must be seconds above 0 or a length like '7d'.`,
    );
  }

  return seconds;
}

export function resolveLinkLimits(options: FormsLinksOptions = {}): LinkLimits {
  const maxExpiry = duration(options.maxExpiry, DEFAULT_MAX_EXPIRY, 'maxExpiry');
  const defaultExpiry =
    options.defaultExpiry === undefined
      ? Math.min(duration(undefined, DEFAULT_EXPIRY, 'defaultExpiry'), maxExpiry)
      : duration(options.defaultExpiry, DEFAULT_EXPIRY, 'defaultExpiry');

  if (defaultExpiry > maxExpiry) {
    throw new Error(
      '[plugin-forms] formsPlugin({ links: { defaultExpiry } }) is longer than maxExpiry.',
    );
  }

  return { defaultExpiry, maxExpiry };
}

/**
 * The seconds a new link lasts: `expiresIn`, or the default. Returns a message instead when
 * `expiresIn` isn't a length or is over the maximum.
 */
export function linkLifetime(
  expiresIn: unknown,
  { defaultExpiry, maxExpiry }: LinkLimits,
): number | { error: string } {
  if (expiresIn === undefined || expiresIn === null) return defaultExpiry;

  const seconds = parseDuration(expiresIn);

  if (seconds === undefined) {
    return { error: "Use seconds above 0 or a length like '30m', '12h', '7d' or '2w'." };
  }

  if (seconds > maxExpiry) {
    return { error: `Links can last at most ${formatDuration(maxExpiry)}.` };
  }

  return seconds;
}
