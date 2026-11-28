export type TwoFactorResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** The `detail` of a FrogBot `Problem`, or `fallback`. */
export function errorMessage(body: unknown, fallback: string): string {
  const message = (body as { detail?: unknown } | null)?.detail;

  return typeof message === 'string' && message ? message : fallback;
}

/** Posts JSON to a two-factor endpoint and returns its body or its error message. */
export async function postTwoFactor<T>(
  url: string,
  body: Record<string, unknown> = {},
): Promise<TwoFactorResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data: unknown = await response.json().catch(() => null);

    return response.ok
      ? { ok: true, data: data as T }
      : { ok: false, error: errorMessage(data, 'Something went wrong. Try again.') };
  } catch {
    return { ok: false, error: 'Something went wrong. Try again.' };
  }
}
