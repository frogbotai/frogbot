import type { FrogBot } from 'frogbot';

import { withLock } from './closing.js';
import type { FormsPluginOptions, FormsTurnstileOptions } from './types.js';

/** The hidden input's name. It looks like nothing a browser would autofill. */
export const HONEYPOT_FIELD = 'fb-hp-7c2e';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const TOKEN_MAX_LENGTH = 2048;

export type SpamOptions = {
  turnstile?: FormsTurnstileOptions;
  rateLimit: { max: number; window: number };
  trustProxy: boolean;
};

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `[plugin-forms] formsPlugin({ rateLimit: { ${name} } }) must be a whole number above 0.`,
    );
  }

  return value;
}

export function resolveSpamOptions(options: FormsPluginOptions): SpamOptions {
  const { turnstile, rateLimit, trustProxy = false } = options;

  if (turnstile && (!turnstile.siteKey || !turnstile.secretKey)) {
    throw new Error('[plugin-forms] formsPlugin({ turnstile }) needs both siteKey and secretKey.');
  }

  return {
    ...(turnstile ? { turnstile } : {}),
    rateLimit: {
      max: positiveInteger(rateLimit?.max, 10, 'max'),
      window: positiveInteger(rateLimit?.window, 600, 'window'),
    },
    trustProxy,
  };
}

/**
 * The visitor's address as the trusted proxy saw it: the last `x-forwarded-for` entry, which the
 * proxy appended, else `x-real-ip`. Without `trustProxy` there is none, since clients can send both.
 */
export function clientIp(headers: Headers, trustProxy: boolean): string | undefined {
  if (!trustProxy) return;

  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();

  return forwarded || headers.get('x-real-ip')?.trim() || undefined;
}

function rateWindow(ip: string, window: number, now: number) {
  const length = window * 1000;
  const start = Math.floor(now / length) * length;

  return { key: `plugin-forms:rate:${ip}:${start}`, remaining: start + length - now };
}

/** Counts one submit for `ip` in the current fixed window, refusing it once `max` is reached. */
export async function takeRateLimit(
  frogbot: FrogBot,
  ip: string,
  { max, window }: SpamOptions['rateLimit'],
  now = Date.now(),
): Promise<RateLimitResult> {
  const { key, remaining } = rateWindow(ip, window, now);

  return withLock(frogbot, `plugin-forms:rate-lock:${ip}`, async () => {
    const stored = await frogbot.kv.get(key);
    const count = typeof stored === 'number' ? stored : 0;

    if (count >= max) return { allowed: false, retryAfter: Math.ceil(remaining / 1000) };

    await frogbot.kv.set(key, count + 1, { ttl: remaining });

    return { allowed: true };
  });
}

/** Whether `ip` has used up the current window, without counting this request. */
export async function checkRateLimit(
  frogbot: FrogBot,
  ip: string,
  { max, window }: SpamOptions['rateLimit'],
  now = Date.now(),
): Promise<RateLimitResult> {
  const { key, remaining } = rateWindow(ip, window, now);
  const stored = await frogbot.kv.get(key);
  const count = typeof stored === 'number' ? stored : 0;

  return count >= max
    ? { allowed: false, retryAfter: Math.ceil(remaining / 1000) }
    : { allowed: true };
}

/** Asks Cloudflare whether a Turnstile token is valid. Tokens work once and expire after 300 s. */
export async function verifyTurnstile({
  secretKey,
  token,
  ip,
}: {
  secretKey: string;
  token: unknown;
  ip?: string;
}): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > TOKEN_MAX_LENGTH) return false;

  const body = new URLSearchParams({ secret: secretKey, response: token });

  if (ip) body.set('remoteip', ip);

  const response = await fetch(SITEVERIFY_URL, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return false;

  const result = (await response.json()) as { success?: unknown };

  return result.success === true;
}

export function spamWarnings({ trustProxy }: SpamOptions): string[] {
  if (trustProxy) return [];

  return [
    "[plugin-forms] trustProxy is off, so form submits aren't rate-limited per visitor. Behind a proxy that sets x-forwarded-for, pass formsPlugin({ trustProxy: true }). The honeypot and Turnstile still run.",
  ];
}
