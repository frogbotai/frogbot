/** The message for a failed link request; the server's own text when it sends one. */
export async function linkError(response: Response): Promise<string> {
  if (response.status === 400 || response.status === 422 || response.status === 502) {
    const body: unknown = await response.json().catch(() => undefined);
    const message = (body as { errors?: { message?: unknown }[] } | undefined)?.errors?.[0]
      ?.message;

    if (typeof message === 'string') return message;
  }

  if (response.status === 401) return 'Your session has expired. Sign in and try again.';

  if (response.status === 400) {
    return 'These credentials were not accepted. Check the values and try again.';
  }

  return 'Could not create the connection. Please try again.';
}
