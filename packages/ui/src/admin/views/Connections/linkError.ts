/** The message for a failed link request; the server's own text for a rejected or unchecked key. */
export async function linkError(response: Response): Promise<string> {
  if (response.status === 422 || response.status === 502) {
    const body: unknown = await response.json().catch(() => undefined);
    const error = (body as { error?: unknown } | undefined)?.error;

    if (typeof error === 'string') return error;
  }

  if (response.status === 401) return 'Your session has expired. Sign in and try again.';

  if (response.status === 400) {
    return 'These credentials were not accepted. Check the values and try again.';
  }

  return 'Could not create the connection. Please try again.';
}
